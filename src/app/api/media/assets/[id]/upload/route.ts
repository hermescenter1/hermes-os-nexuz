/**
 * PHASE 102 — Hermes Media & Video Hub: the video byte-upload surface.
 *
 * Design authority: docs/phase102/architecture.md §5 and §7.
 *
 * POST /api/media/assets/[id]/upload  (multipart/form-data, field `file`)
 *
 * WHAT THIS ROUTE GUARANTEES
 * --------------------------
 *  1. The acting organization is DERIVED from the asset, then proven by
 *     membership. Nothing about tenancy is read from the request.
 *  2. The declared MIME type is NOT trusted: `validateMediaUpload()` requires the
 *     declared type, the filename extension AND the actual leading bytes to agree
 *     before a single byte is persisted.
 *  3. The storage key is server-generated (`buildMediaStorageKey()` mints
 *     `media/<org>/<asset>/<uuid>.<ext>`). A client filename never reaches the
 *     filesystem — not even sanitised — and is never accepted as a key.
 *  4. Bytes are written ONLY through `putMediaObject()`, which delegates to
 *     `getDocumentObjectStorage()` so the seam's unexported `sanitizeKey()`
 *     traversal guard applies. There is no second, weaker sanitiser here.
 *  5. The state change is a compare-and-swap. There is no background job runner
 *     in this platform (ADR §2.2), so nothing advances the asset behind the
 *     request, and two concurrent uploads cannot both win.
 *
 * SIZE CEILING — READ BEFORE RAISING IT
 * -------------------------------------
 * `MAX_MEDIA_UPLOAD_BYTES` is 50 MB, and raising it ALONE is a silent no-op:
 * nginx terminates every request in front of Next.js with
 * `client_max_body_size 50M` (deploy/nginx/default.conf:43), so a larger body is
 * rejected with a 413 before this file ever observes it. The real ceiling is an
 * infrastructure change with a documented impact assessment (ADR §2.1, §9).
 *
 * WHY A FAILED VALIDATION LANDS IN `FAILED`, NOT `QUARANTINED`
 * ------------------------------------------------------------
 * `QUARANTINED` is TERMINAL and reachable only on an OPERATOR edge
 * (src/lib/media/lifecycle.ts) — an HTTP request may never place an asset there,
 * because nothing over HTTP has inspected bytes the way an operator tool can.
 * This route therefore records the refusal as `processingState = FAILED` with a
 * `processingFailureCode` naming the exact validation reason. Nothing is deleted
 * and nothing is hidden: validation runs BEFORE `putMediaObject()`, so a rejected
 * upload never becomes stored bytes in the first place, and the refusal itself is
 * the evidence — durable on the row and in the audit log. Promotion to
 * `QUARANTINED` remains the operator CLI's accountable act.
 *
 * STATIC CI GATE
 * --------------
 * scripts/security/phase99/static-invariants.mjs:380-400 scans every route that
 * calls `.formData(` (comments stripped first) and requires one live token from
 * each of four sets. This handler proves them with:
 *   size     → `file.size > MAX_MEDIA_UPLOAD_BYTES`   (`.size >`)
 *   type     → `fileField instanceof File`            (`instanceof File`)
 *   filename → `validateFilename(...)`                (`validateFilename`)
 *   auth     → `requireOrgActor` / `requirePermission`
 */

import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import { enforceEntitlement } from "@/lib/billing-governance/runtime/require-entitlement";
import { getPrisma } from "@/lib/db/prisma";
import { resolveRequestId } from "@/lib/logger/correlation";
import { getMediaAssetById } from "@/lib/media/db";
import { evaluateProcessingTransition } from "@/lib/media/lifecycle";
import { buildMediaStorageKey, deleteMediaObject, putMediaObject } from "@/lib/media/storage";
import {
  MAX_MEDIA_UPLOAD_BYTES,
  MEDIA_MAGIC_SNIFF_BYTES,
  mediaExtensionOf,
  isAllowedMediaExtension,
  sanitizeMediaDisplayName,
  validateMediaUpload,
  type MediaValidationReason,
} from "@/lib/media/validation";
import { requirePlatformAuth } from "@/lib/api/auth";
import { requireOrgActor } from "@/lib/org/context";
import { can, requirePermission, type OrgPermission } from "@/lib/org/rbac";
import type { OrgRole } from "@/lib/org/types";
import { requireTrustedOrigin, resolveClientIp } from "@/lib/security/request-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Rate-limit policy borrowed from the `engineering-import` bucket (10 requests /
 * 60 s) — the closest existing budget for an expensive authenticated write.
 *
 * The IDENTIFIER is namespaced (`media-upload:<ip>`), so media uploads get their
 * OWN Redis counter and never consume, or get blocked by, the engineering-import
 * budget of the same caller. Only the max/window policy is shared.
 *
 * Borrowing was originally defensive: an undeclared bucket used to make
 * `checkRateLimit` return `true` unconditionally, so naming a bucket that was
 * not in `LIMITS` was worse than not limiting at all. That fail-open is gone —
 * the limiter's action type is derived from `LIMITS`, so an undeclared bucket is
 * now a compile error and refuses at runtime. This route keeps the shared policy
 * because 10 requests / 60 s is the right budget for an expensive byte upload,
 * not because it has to.
 */
const UPLOAD_LIMIT_BUCKET = "engineering-import";
const UPLOAD_LIMIT_KEY_PREFIX = "media-upload";

/**
 * Multipart framing (boundaries, part headers, trailing CRLFs) makes the request
 * larger than the file it carries, so the early Content-Length rejection allows a
 * fixed envelope on top of the byte ceiling. The authoritative check is still the
 * per-file one below; this one exists only to refuse an obviously oversized body
 * before it is buffered.
 */
const MULTIPART_ENVELOPE_SLACK_BYTES = 64 * 1024;

/** The media permissions whose grant is decided by the actor's org role. */
const MEDIA_PERMISSIONS: readonly OrgPermission[] = ["view_media", "manage_media", "review_media"];

/** Only `PENDING_UPLOAD` accepts bytes: it is the sole REQUEST-driven inbound edge. */
const UPLOADABLE_PROCESSING_STATE = "PENDING_UPLOAD";

// ── Local types over the Prisma client ───────────────────────────────────────

interface AssetWriteModel {
  findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
  updateMany: (args: unknown) => Promise<{ count?: number }>;
}

// ── Small helpers (declared before the handler on purpose: the Phase 99 static
//    analysers slice a handler body from its `export` to the next one) ────────

const assetIdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

/** A stable, non-leaking error body. Never carries an exception or a filename. */
function deny(status: number, code: string, extraHeaders?: Record<string, string>): NextResponse {
  return NextResponse.json(
    { ok: false, error: code },
    { status, headers: { "Cache-Control": "no-store", ...(extraHeaders ?? {}) } },
  );
}

/**
 * THE UNIFORM REFUSAL FOR EVERYTHING DECIDED AFTER THE UN-SCOPED LOOKUP.
 *
 * This used to map `requireOrgActor`'s 401 straight through, which made the
 * status an existence oracle: the un-scoped `resolveOwningOrganizationId` ran
 * BEFORE any authentication, so an anonymous caller got `401` for an id that
 * existed in ANY tenant and `404` for one that did not, and could enumerate
 * every `MediaAsset` id in the product with no credentials at all.
 *
 * Authentication now happens BEFORE that lookup, so an honest `401` is still
 * available to a caller with no session — and it is returned identically for
 * every id, because no row has been read at that point. Once the lookup HAS
 * run, every remaining refusal collapses to `404`: not a member, membership no
 * longer active, session revoked between the two checks. This mirrors the
 * disclosure policy the byte-serving chain already enforces
 * (src/lib/media/byte-serving-auth.ts).
 */
function denyAfterLookup(): NextResponse {
  return deny(404, "not_found");
}

/**
 * THE FILENAME CONTROL.
 *
 * The client filename never reaches the filesystem — the storage key is minted
 * server-side — so this governs the extension we are willing to consider and the
 * human-readable name recorded in the audit trail. It rejects (rather than
 * silently rewrites) control characters, NUL, path separators, `..` and
 * bidirectional overrides such as U+202E, so a disguise attempt is visible to an
 * operator instead of being quietly normalised away.
 */
function validateFilename(
  raw: unknown,
): { ok: true; value: string } | { ok: false; reason: MediaValidationReason } {
  if (typeof raw !== "string") return { ok: false, reason: "filename_required" };
  const sanitized = sanitizeMediaDisplayName(raw);
  if (!sanitized.ok) return sanitized;
  // Cheap allow-list check on the extension before any byte is inspected.
  const extension = mediaExtensionOf(sanitized.value);
  if (!extension || !isAllowedMediaExtension(extension)) {
    return { ok: false, reason: "unsupported_media_type" };
  }
  return sanitized;
}

/** Media permissions the actor's role actually grants. Derived, never supplied. */
function heldMediaPermissions(role: OrgRole): OrgPermission[] {
  return MEDIA_PERMISSIONS.filter((permission) => can(role, permission));
}

/**
 * Resolve the organization that OWNS an asset.
 *
 * Deliberately not tenant-scoped — it cannot be: the caller's organization is
 * exactly what is being established. Only the opaque owning id is selected, it is
 * never returned to the client, and membership in it is then proven by
 * `requireOrgActor` before anything else happens. Every subsequent read goes
 * through the org-scoped repository loader.
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

/**
 * Record a validation refusal on the row without deleting anything.
 *
 * Uses the legal REQUEST edge `PENDING_UPLOAD → FAILED` (evaluated against the
 * closed transition table first, so the route cannot invent an edge) and stamps
 * the exact reason code. Best-effort: a refusal that could not be recorded still
 * refuses the upload.
 */
async function recordValidationFailure(params: {
  assetId: string;
  organizationId: string;
  actorUserId: string;
  permissions: readonly OrgPermission[];
  reason: MediaValidationReason;
}): Promise<void> {
  const decision = evaluateProcessingTransition({
    from: "PENDING_UPLOAD",
    to: "FAILED",
    driver: "REQUEST",
    permissions: params.permissions,
  });
  if (!decision.ok) return;
  const db = await getPrisma();
  if (!db) return;
  try {
    const model = (db as Record<string, unknown>).mediaAsset as AssetWriteModel;
    await model.updateMany({
      where: {
        id: params.assetId,
        organizationId: params.organizationId,
        processingState: UPLOADABLE_PROCESSING_STATE,
      },
      data: {
        processingState: "FAILED",
        processingFailureCode: params.reason,
        updatedBy: params.actorUserId,
      },
    });
  } catch {
    /* best-effort: the HTTP refusal below is the authoritative outcome */
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

  // ── 1. Cheap request-shape refusals, before any database work ──────────────
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return deny(415, "multipart_required");
  }
  const declaredLength = Number(req.headers.get("content-length") ?? "");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_MEDIA_UPLOAD_BYTES + MULTIPART_ENVELOPE_SLACK_BYTES
  ) {
    return deny(413, "file_too_large");
  }

  // ── 2. Authentication, BEFORE the un-scoped lookup ─────────────────────────
  // This ordering is the whole point. `resolveOwningOrganizationId` below is
  // necessarily un-scoped, so anything that runs AFTER it and varies with the
  // outcome describes the row. Proving the caller is authenticated first is
  // id-independent — the same 401 for an id that exists and one that does not.
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return deny(auth.status, auth.code);

  // ── 3. Same-origin, for cookie-authenticated writes ────────────────────────
  const originGate = requireTrustedOrigin(req, auth.ctx.authMethod);
  if (!originGate.ok) return deny(403, "forbidden");

  // ── 4. Tenancy, then authorization ─────────────────────────────────────────
  const organizationId = await resolveOwningOrganizationId(assetId);
  if (!organizationId) return denyAfterLookup();

  const actor = await requireOrgActor(req, organizationId);
  if ("error" in actor) return denyAfterLookup();
  const { ctx } = actor;

  const permitted = requirePermission(ctx.role, "manage_media");
  if (!permitted.ok) return deny(403, "forbidden");

  // ── 5. Abuse brake, keyed ONLY on the proxy-controlled X-Real-IP ───────────
  // `resolveClientIp` reads X-Real-IP and nothing else, by design: nginx
  // overwrites that header but merely APPENDS to the forwarded-for chain, so
  // keying on the forwarded chain would let a caller rotate buckets per request
  // and bypass the limit entirely.
  const clientIp = resolveClientIp(req);
  const limitKey = `${UPLOAD_LIMIT_KEY_PREFIX}:${clientIp}`;
  if (!(await checkRateLimit(UPLOAD_LIMIT_BUCKET, limitKey))) {
    return deny(429, "rate_limited", {
      "Retry-After": String(retryAfter(UPLOAD_LIMIT_BUCKET, limitKey)),
    });
  }

  // ── 6. Commercial entitlement, AFTER the RBAC decision ────────────────────
  const entitlement = await enforceEntitlement({
    organisationId: organizationId,
    entitlementKey: "video_hub",
    requestedUnits: 1,
    userId: ctx.userId,
  });
  if (!entitlement.ok) return entitlement.response;

  // ── 7. The asset itself, through the org-scoped repository gate ───────────
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
  const asset = loaded.value;
  if (asset.processingState !== UPLOADABLE_PROCESSING_STATE) {
    // Includes the terminal QUARANTINED state: a quarantined asset never accepts
    // replacement bytes, because the remedy is a fresh asset, not a re-upload.
    return deny(409, "processing_state_conflict");
  }

  // The transition must be legal on the closed table BEFORE work is done.
  const edge = evaluateProcessingTransition({
    from: "PENDING_UPLOAD",
    to: "UPLOADED",
    driver: "REQUEST",
    permissions,
  });
  if (!edge.ok) return deny(403, "forbidden");

  // ── 8. Multipart body ─────────────────────────────────────────────────────
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
  if (file.size > MAX_MEDIA_UPLOAD_BYTES) return deny(413, "file_too_large");

  const filename = validateFilename(file.name);
  if (!filename.ok) return deny(400, filename.reason);

  const bytes = Buffer.from(await file.arrayBuffer());
  // Defence in depth: `File.size` is metadata, the buffer length is the fact.
  if (bytes.byteLength <= 0) return deny(400, "file_empty");
  if (bytes.byteLength > MAX_MEDIA_UPLOAD_BYTES) return deny(413, "file_too_large");

  // ── 9. Allow-list + magic-byte verification ───────────────────────────────
  const validated = validateMediaUpload({
    filename: filename.value,
    declaredMimeType: file.type,
    sizeBytes: bytes.byteLength,
    head: bytes.subarray(0, MEDIA_MAGIC_SNIFF_BYTES),
  });
  if (!validated.ok) {
    await recordValidationFailure({
      assetId,
      organizationId,
      actorUserId: ctx.userId,
      permissions,
      reason: validated.reason,
    });
    void recordAuditEvent({
      action: "media.upload.rejected",
      entityType: "MediaAsset",
      entityId: assetId,
      organizationId,
      userId: ctx.userId,
      outcome: "denied",
      correlationId,
      metadata: { reason: validated.reason, declaredType: file.type, byteSize: bytes.byteLength },
    });
    const status = validated.reason === "file_too_large" ? 413 : 422;
    return deny(status, validated.reason);
  }
  if (validated.kind !== "video") {
    // Posters and subtitle tracks have their own surfaces; this one serves the
    // playable rendition, so accepting anything else here would let a caller
    // store a still image behind a `video/*` Content-Type.
    return deny(415, "unsupported_media_type");
  }

  // ── 10. Persist bytes under a SERVER-GENERATED key ─────────────────────────
  let storageKey: string;
  try {
    storageKey = buildMediaStorageKey({
      organizationId,
      assetId,
      extension: validated.extension,
    });
    await putMediaObject({ key: storageKey, body: bytes, contentType: validated.contentType });
  } catch {
    // The storage seam fails loudly rather than degrading (a `MediaStorageError`
    // for a refused key, a rejected `minio`/`s3` adapter, or a filesystem fault).
    // The client learns only that storage is unavailable — never which.
    return deny(503, "storage_unavailable");
  }

  const checksum = createHash("sha256").update(bytes).digest("hex");

  // ── 11. Compare-and-swap the row, carrying the byte metadata atomically ────
  // `transitionMediaProcessingState` cannot express the storage columns, so the
  // predicate form is applied here directly: the expected state is pinned in the
  // `where` clause, and `count !== 1` means another replica won the race.
  const db = await getPrisma();
  if (!db) return deny(503, "storage_unavailable");
  let affected = 0;
  try {
    const model = (db as Record<string, unknown>).mediaAsset as AssetWriteModel;
    const result = await model.updateMany({
      where: {
        id: assetId,
        organizationId,
        processingState: UPLOADABLE_PROCESSING_STATE,
      },
      data: {
        processingState: "UPLOADED",
        storageKey,
        contentType: validated.contentType,
        byteSize: bytes.byteLength,
        checksumSha256: checksum,
        processingFailureCode: null,
        updatedBy: ctx.userId,
      },
    });
    affected = typeof result?.count === "number" ? result.count : 0;
  } catch {
    affected = 0;
  }

  if (affected !== 1) {
    // Nothing references these bytes — the row still points elsewhere — so the
    // orphan is removed. This is not evidence: the upload passed validation and
    // merely lost a race, and leaving unreferenced objects behind would grow the
    // durable volume without bound.
    try {
      await deleteMediaObject(storageKey);
    } catch {
      /* orphan cleanup is best-effort; an unreferenced object is unreachable */
    }
    return deny(409, "processing_state_conflict");
  }

  void recordAuditEvent({
    action: "media.upload.accepted",
    entityType: "MediaAsset",
    entityId: assetId,
    organizationId,
    userId: ctx.userId,
    outcome: "success",
    correlationId,
    metadata: {
      contentType: validated.contentType,
      byteSize: bytes.byteLength,
      checksumSha256: checksum,
      displayName: filename.value,
      processingState: "UPLOADED",
    },
  });

  return NextResponse.json(
    {
      ok: true,
      data: {
        id: assetId,
        processingState: "UPLOADED",
        contentType: validated.contentType,
        byteSize: bytes.byteLength,
        checksumSha256: checksum,
      },
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
