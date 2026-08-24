/**
 * PHASE 102 — Hermes Media & Video Hub: the poster registration surface.
 *
 * Design authority: docs/phase102/architecture.md §5 and §7.
 *
 * POST /api/media/assets/[id]/poster/upload  (multipart/form-data, field `file`)
 *
 * WHY THIS ROUTE EXISTS
 * ---------------------
 * `MediaAsset.posterStorageKey` was a nullable column with NO writer anywhere in
 * the product. `GET …/poster` served it, the player, card and hero all rendered
 * it, and the Video Hub loader reported `posterUrl: null` — because nothing
 * could ever put a key in that column. The read half of the feature shipped
 * without the write half.
 *
 * WHAT IT REUSES RATHER THAN REIMPLEMENTS
 * ---------------------------------------
 * Everything. The chain, the validator, the key minting and the byte write are
 * the sibling upload routes' — this file adds no parallel logic:
 *
 *   requirePlatformAuth   authentication BEFORE the un-scoped owner lookup, so
 *                         the 401 is id-independent and cannot be used to probe
 *                         which asset ids exist
 *   requireTrustedOrigin  same-origin for cookie callers; API keys exempt
 *   requireOrgActor       ACTIVE membership of the OWNING organization
 *   requirePermission     `manage_media`
 *   checkRateLimit        the same expensive-upload budget as the siblings
 *   enforceEntitlement    `video_hub`, AFTER the RBAC decision
 *   validateMediaUpload   declared type, extension AND magic bytes must agree
 *   buildMediaStorageKey  `media/<org>/<asset>/<uuid>.<ext>`, server-minted
 *   putMediaObject        through the object-storage seam's traversal guard
 *
 * WHY IT IS A SEPARATE PATH FROM THE VIDEO UPLOAD
 * -----------------------------------------------
 * A poster is not the asset's bytes. The video upload owns the
 * `PENDING_UPLOAD → UPLOADED` processing edge and refuses an asset that already
 * holds bytes; a poster may be set, replaced and replaced again at any point in
 * the asset's life, and it touches `processingState` never. Folding both into
 * one handler would mean one of the two rules being conditional, which is how
 * the stricter one eventually gets lost.
 *
 * WHY `QUARANTINED` IS STILL REFUSED
 * ----------------------------------
 * Quarantine is the state that says nothing may vouch for this asset's bytes.
 * Attaching a new, servable image to it would put fresh bytes behind an asset
 * an operator has explicitly distrusted.
 *
 * STATIC CI GATE
 * --------------
 * scripts/security/phase99/static-invariants.mjs scans every route calling
 * `.formData(` and requires one live token from each of four sets. This handler
 * proves them with:
 *   size     → `file.size > MAX_MEDIA_POSTER_BYTES`   (`.size >`)
 *   type     → `fileField instanceof File`            (`instanceof File`)
 *   filename → `validateFilename(...)`                (`validateFilename`)
 *   auth     → `requireOrgActor` / `requirePermission`
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requirePlatformAuth } from "@/lib/api/auth";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import { enforceEntitlement } from "@/lib/billing-governance/runtime/require-entitlement";
import { getPrisma } from "@/lib/db/prisma";
import { resolveRequestId } from "@/lib/logger/correlation";
import { getMediaAssetById } from "@/lib/media/db";
import { buildMediaStorageKey, deleteMediaObject, putMediaObject } from "@/lib/media/storage";
import {
  MAX_MEDIA_POSTER_BYTES,
  MEDIA_MAGIC_SNIFF_BYTES,
  mediaExtensionOf,
  isAllowedMediaExtension,
  sanitizeMediaDisplayName,
  validateMediaUpload,
  type MediaValidationReason,
} from "@/lib/media/validation";
import { requireOrgActor } from "@/lib/org/context";
import { can, requirePermission, type OrgPermission } from "@/lib/org/rbac";
import type { OrgRole } from "@/lib/org/types";
import { requireTrustedOrigin, resolveClientIp } from "@/lib/security/request-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Constants ────────────────────────────────────────────────────────────────

/** The same expensive-upload policy the video and subtitle surfaces borrow. */
const POSTER_LIMIT_BUCKET = "engineering-import";
const POSTER_LIMIT_KEY_PREFIX = "media-poster";

/** Multipart framing overhead allowed on top of the byte ceiling. */
const MULTIPART_ENVELOPE_SLACK_BYTES = 64 * 1024;

const MEDIA_PERMISSIONS: readonly OrgPermission[] = ["view_media", "manage_media", "review_media"];

/** Quarantine never accepts new servable bytes of any kind. */
const REFUSED_PROCESSING_STATES: readonly string[] = ["QUARANTINED"];

// ── Local types over the Prisma client ───────────────────────────────────────

interface AssetWriteModel {
  findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
  updateMany: (args: unknown) => Promise<{ count?: number }>;
}

// ── Helpers (declared before the handler: the Phase 99 static analysers slice a
//    handler body from its `export` to the next one) ──────────────────────────

const assetIdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

function deny(status: number, code: string, extraHeaders?: Record<string, string>): NextResponse {
  return NextResponse.json(
    { ok: false, error: code },
    { status, headers: { "Cache-Control": "no-store", ...(extraHeaders ?? {}) } },
  );
}

/**
 * Every refusal decided AFTER the un-scoped owner lookup collapses to one 404 —
 * see ../../upload/route.ts for why the status of a post-lookup refusal is an
 * existence oracle if it varies.
 */
function denyAfterLookup(): NextResponse {
  return deny(404, "not_found");
}

/**
 * THE FILENAME CONTROL — see ../../upload/route.ts. The storage key is minted
 * server-side, so this governs only the extension considered and the name
 * recorded in the audit trail; hostile names are refused, never rewritten.
 */
function validateFilename(
  raw: unknown,
): { ok: true; value: string } | { ok: false; reason: MediaValidationReason } {
  if (typeof raw !== "string") return { ok: false, reason: "filename_required" };
  const sanitized = sanitizeMediaDisplayName(raw);
  if (!sanitized.ok) return sanitized;
  const extension = mediaExtensionOf(sanitized.value);
  if (!extension || !isAllowedMediaExtension(extension)) {
    return { ok: false, reason: "unsupported_media_type" };
  }
  return sanitized;
}

function heldMediaPermissions(role: OrgRole): OrgPermission[] {
  return MEDIA_PERMISSIONS.filter((permission) => can(role, permission));
}

/**
 * Resolve the organization that OWNS an asset.
 *
 * Necessarily un-scoped — the caller's organization is what is being
 * established. Only the opaque owning id is selected, it never reaches a
 * response, and membership in it is proven immediately afterwards.
 */
async function resolveOwningOrganizationId(assetId: string): Promise<string | null> {
  const db = await getPrisma();
  if (!db) return null;
  try {
    const model = (db as Record<string, unknown>).mediaAsset as AssetWriteModel;
    const row = await model.findUnique({
      where: { id: assetId },
      select: { organizationId: true },
    });
    return row && typeof row.organizationId === "string" ? row.organizationId : null;
  } catch {
    return null;
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId = resolveRequestId(req);
  const { id: rawId } = await params;

  const parsedId = assetIdSchema.safeParse(rawId);
  if (!parsedId.success) return deny(404, "not_found");
  const assetId = parsedId.data;

  // ── 1. Cheap request-shape refusals, before any database work ─────────────
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return deny(415, "multipart_required");
  }
  const declaredLength = Number(req.headers.get("content-length") ?? "");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_MEDIA_POSTER_BYTES + MULTIPART_ENVELOPE_SLACK_BYTES
  ) {
    return deny(413, "file_too_large");
  }

  // ── 2. Authentication, BEFORE the un-scoped lookup ────────────────────────
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return deny(auth.status, auth.code);

  // ── 3. Same-origin, for cookie-authenticated writes ───────────────────────
  const originGate = requireTrustedOrigin(req, auth.ctx.authMethod);
  if (!originGate.ok) return deny(403, "forbidden");

  // ── 4. Tenancy, then authorization ────────────────────────────────────────
  const organizationId = await resolveOwningOrganizationId(assetId);
  if (!organizationId) return denyAfterLookup();

  const actor = await requireOrgActor(req, organizationId);
  if ("error" in actor) return denyAfterLookup();
  const { ctx } = actor;

  const permitted = requirePermission(ctx.role, "manage_media");
  if (!permitted.ok) return deny(403, "forbidden");

  // ── 5. Abuse brake, keyed ONLY on the proxy-controlled X-Real-IP ──────────
  const clientIp = resolveClientIp(req);
  const limitKey = `${POSTER_LIMIT_KEY_PREFIX}:${clientIp}`;
  if (!(await checkRateLimit(POSTER_LIMIT_BUCKET, limitKey))) {
    return deny(429, "rate_limited", {
      "Retry-After": String(retryAfter(POSTER_LIMIT_BUCKET, limitKey)),
    });
  }

  // ── 6. Commercial entitlement, AFTER the RBAC decision ───────────────────
  const entitlement = await enforceEntitlement({
    organisationId: organizationId,
    entitlementKey: "video_hub",
    requestedUnits: 1,
    userId: ctx.userId,
  });
  if (!entitlement.ok) return entitlement.response;

  // ── 7. The asset itself, through the org-scoped repository gate ──────────
  const permissions = heldMediaPermissions(ctx.role);
  const loaded = await getMediaAssetById({
    organizationId,
    id: assetId,
    audience: { scope: "EDITORIAL", includeUnpublished: true, permissions },
  });
  if (!loaded.ok) {
    if (loaded.reason === "STORAGE_UNAVAILABLE") return deny(503, "storage_unavailable");
    return deny(404, "not_found");
  }
  if (REFUSED_PROCESSING_STATES.includes(loaded.value.processingState)) {
    return deny(409, "processing_state_conflict");
  }
  const previousKey =
    typeof loaded.value.posterStorageKey === "string" ? loaded.value.posterStorageKey : null;

  // ── 8. Multipart body ────────────────────────────────────────────────────
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return deny(400, "malformed_multipart");
  }

  const fileField = form.get("file");
  if (!(fileField instanceof File)) return deny(400, "file_field_required");
  const file = fileField;

  if (file.size <= 0) return deny(400, "file_empty");
  if (file.size > MAX_MEDIA_POSTER_BYTES) return deny(413, "file_too_large");

  const filename = validateFilename(file.name);
  if (!filename.ok) return deny(400, filename.reason);

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength <= 0) return deny(400, "file_empty");
  if (bytes.byteLength > MAX_MEDIA_POSTER_BYTES) return deny(413, "file_too_large");

  // ── 9. Allow-list + magic-byte verification ──────────────────────────────
  const validated = validateMediaUpload({
    filename: filename.value,
    declaredMimeType: file.type,
    sizeBytes: bytes.byteLength,
    head: bytes.subarray(0, MEDIA_MAGIC_SNIFF_BYTES),
  });
  if (!validated.ok) {
    void recordAuditEvent({
      action: "media.poster.rejected",
      entityType: "MediaAsset",
      entityId: assetId,
      organizationId,
      userId: ctx.userId,
      outcome: "denied",
      correlationId,
      metadata: { reason: validated.reason, declaredType: file.type },
    });
    return deny(validated.reason === "file_too_large" ? 413 : 422, validated.reason);
  }
  // A video or a caption file uploaded here is refused: the poster surface
  // accepts poster bytes and nothing else.
  if (validated.kind !== "poster") return deny(415, "unsupported_media_type");

  // ── 10. Persist bytes under a SERVER-GENERATED key ───────────────────────
  let storageKey: string;
  try {
    storageKey = buildMediaStorageKey({ organizationId, assetId, extension: validated.extension });
    await putMediaObject({ key: storageKey, body: bytes, contentType: validated.contentType });
  } catch {
    return deny(503, "storage_unavailable");
  }

  // ── 11. Point the row at the new object ──────────────────────────────────
  const db = await getPrisma();
  if (!db) return deny(503, "storage_unavailable");
  let affected = 0;
  try {
    const model = (db as Record<string, unknown>).mediaAsset as AssetWriteModel;
    // Tenant-scoped, and pinned to the poster key the read above observed: a
    // concurrent poster write loses rather than both appearing to win.
    const result = await model.updateMany({
      where: { id: assetId, organizationId, posterStorageKey: previousKey },
      data: { posterStorageKey: storageKey, updatedBy: ctx.userId },
    });
    affected = typeof result.count === "number" ? result.count : 0;
  } catch {
    affected = 0;
  }

  if (affected !== 1) {
    // The row does not reference the object just written, so nothing can reach
    // it. Removing it is what stops a lost race from leaving storage growing.
    try {
      await deleteMediaObject(storageKey);
    } catch {
      /* best-effort: an unreferenced object is already unreachable */
    }
    return deny(409, "poster_conflict");
  }

  // The superseded object is unreferenced now that the row points elsewhere.
  if (previousKey && previousKey !== storageKey) {
    try {
      await deleteMediaObject(previousKey);
    } catch {
      /* best-effort */
    }
  }

  void recordAuditEvent({
    action: "media.poster.accepted",
    entityType: "MediaAsset",
    entityId: assetId,
    organizationId,
    userId: ctx.userId,
    outcome: "success",
    correlationId,
    metadata: {
      byteSize: bytes.byteLength,
      contentType: validated.contentType,
      replacedExisting: previousKey !== null,
      displayName: filename.value,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      data: {
        mediaAssetId: assetId,
        contentType: validated.contentType,
        byteSize: bytes.byteLength,
        // The address the poster is now served from. The KEY is never returned.
        posterUrl: `/api/media/assets/${encodeURIComponent(assetId)}/poster`,
        replacedExisting: previousKey !== null,
      },
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
