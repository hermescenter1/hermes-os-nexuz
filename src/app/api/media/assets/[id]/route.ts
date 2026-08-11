/**
 * PHASE 102 — Hermes Media & Video Hub: one asset (detail + editorial update).
 *
 * Design authority: docs/phase102/architecture.md §3 (tenancy), §11 (workflow).
 *
 * THE `[id]` SEGMENT IS GENUINELY AN ID.
 * -------------------------------------
 * `src/app/api/articles/[id]/route.ts` names its segment `id` and then hands the
 * value to a by-SLUG loader, and compares `article.authorId` to `user.id` across
 * two disjoint identifier spaces. Both mistakes are avoided here deliberately:
 * the segment is passed only to `getMediaAssetById`, and no ownership comparison
 * is performed at all — authorisation is the org permission plus the tenant
 * predicate in the query, which are the same id space by construction.
 *
 * NOT-FOUND POLICY. A cross-tenant asset answers 404, never 403. `getMediaAssetById`
 * carries `organizationId` in the `where` clause, so another tenant's row is not
 * merely hidden from the response — it is never selected, and the route cannot
 * distinguish "does not exist" from "not yours" even if it wanted to.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAuth } from "@/lib/api/auth";
import { requireOrgActor } from "@/lib/org/context";
import { can, requirePermission, type OrgPermission } from "@/lib/org/rbac";
import type { OrgRole } from "@/lib/org/types";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import { enforceEntitlement } from "@/lib/billing-governance/runtime/require-entitlement";
import {
  isJsonContentType,
  readBoundedTextBody,
  requireTrustedOrigin,
} from "@/lib/security/request-guards";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { getPrisma } from "@/lib/db/prisma";
import { z } from "zod";
import {
  getMediaAssetById,
  listEditorialEventsForAsset,
  type MediaAssetRow,
} from "@/lib/media/db";
import { allowedTransitionsFrom } from "@/lib/media/lifecycle";
import {
  MEDIA_LOCALES,
  MEDIA_SKILL_LEVELS,
  MEDIA_VISIBILITIES,
  isMediaLifecycleStatus,
  type MediaLifecycleStatus,
} from "@/lib/media/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ── Shared vocabulary (mirrors the collection route) ─────────────────────── */

const MEDIA_PERMISSIONS: readonly OrgPermission[] = ["view_media", "manage_media", "review_media"];

function permissionsOf(role: OrgRole): readonly OrgPermission[] {
  return MEDIA_PERMISSIONS.filter((p) => can(role, p));
}

function isEditorialActor(role: OrgRole): boolean {
  return can(role, "manage_media") || can(role, "review_media");
}

const MEDIA_WRITE_LIMIT = "media-authoring-write";
const MAX_BODY_BYTES = 32 * 1024;

/**
 * The ONLY lifecycle states in which an asset's editorial identity may change.
 *
 * Once an asset has been submitted it belongs to the review process, and once it
 * has been published its identity is immutable (ADR §11): a published record is
 * what a viewer, a search engine and the audit trail all refer to. Changing it
 * in place would silently rewrite something already attested. The way back to an
 * editable state is the lifecycle — REJECT or ARCHIVE + RESTORE — which is
 * recorded and attributable.
 */
const EDITABLE_STATUSES: readonly MediaLifecycleStatus[] = ["DRAFT", "REJECTED"];

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function json(body: Record<string, unknown>, status: number, headers?: HeadersInit) {
  return NextResponse.json(body, { status, headers });
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** Same projection as the collection route; see the note there on why it is
 *  duplicated rather than exported (Next.js validates route export surfaces). */
function toMediaAssetDto(row: MediaAssetRow) {
  return {
    id: row.id,
    slug: row.slug,
    primaryLocale: row.primaryLocale,
    status: row.status,
    visibility: row.visibility,
    processingState: row.processingState,
    skillLevel: row.skillLevel,
    categoryId: row.categoryId,
    instructorId: row.instructorId,
    siteId: row.siteId,
    contentType: row.contentType,
    byteSize: row.byteSize,
    durationSeconds: row.durationSeconds,
    hasBytes: row.storageKey !== null && row.storageKey !== undefined,
    hasPoster: row.posterStorageKey !== null && row.posterStorageKey !== undefined,
    viewCount: row.viewCount,
    saveCount: row.saveCount,
    completionCount: row.completionCount,
    publishedAt: toIso(row.publishedAt),
    archivedAt: toIso(row.archivedAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

type AnyModel = Record<string, (...args: unknown[]) => Promise<unknown>>;
type TxModels = Record<string, AnyModel>;
type MaybeTxClient = TxModels & {
  $transaction?: <T>(fn: (tx: TxModels) => Promise<T>) => Promise<T>;
};

async function withTx<T>(client: MaybeTxClient, fn: (tx: TxModels) => Promise<T>): Promise<T> {
  if (typeof client.$transaction === "function") return client.$transaction((tx) => fn(tx));
  return fn(client);
}

interface TranslationRow {
  id: string;
  locale: string;
  title: string;
  summary: string | null;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  keywords: string[] | null;
}

/** Locale copy for one asset, bounded by the platform locale set. */
async function loadTranslations(
  client: MaybeTxClient,
  organizationId: string,
  mediaAssetId: string,
): Promise<TranslationRow[]> {
  const model = client.mediaAssetTranslation;
  if (!model || typeof model.findMany !== "function") return [];
  try {
    const rows = (await model.findMany({
      where: { organizationId, mediaAssetId },
      orderBy: { locale: "asc" },
      take: MEDIA_LOCALES.length,
    })) as unknown;
    return Array.isArray(rows) ? (rows as TranslationRow[]) : [];
  } catch {
    return [];
  }
}

function toTranslationDto(row: TranslationRow) {
  return {
    locale: row.locale,
    title: row.title,
    summary: row.summary ?? null,
    description: row.description ?? null,
    seoTitle: row.seoTitle ?? null,
    seoDescription: row.seoDescription ?? null,
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
  };
}

/**
 * The shared guard chain. Returns the tenant-scoped actor or a ready response.
 *
 * Declared locally rather than exported from a shared module because every file
 * under `src/app/api` in this repository is a `route` module, and Next.js
 * validates the export surface of one.
 */
type Actor = {
  organizationId: string;
  userId: string;
  role: OrgRole;
  /**
   * HOW the caller authenticated. Mutations use it to decide whether a
   * same-origin `Origin` header is required — see `requireTrustedOrigin`. Reads
   * ignore it: a GET carries no CSRF risk and the hub fetches these server-side.
   */
  authMethod: "jwt" | "apikey";
};

async function resolveActor(
  req: NextRequest,
  permission: OrgPermission,
): Promise<{ ok: true; actor: Actor } | { ok: false; response: NextResponse }> {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) {
    return { ok: false, response: json({ error: auth.error, code: "AUTHENTICATION_REQUIRED" }, auth.status) };
  }
  const member = await requireOrgActor(req, auth.ctx.orgId);
  if ("error" in member) {
    return { ok: false, response: json({ error: member.error, code: "ORGANIZATION_SCOPE_REQUIRED" }, member.status) };
  }
  const perm = requirePermission(member.ctx.role, permission);
  if (!perm.ok) {
    return { ok: false, response: json({ error: perm.error, code: "INSUFFICIENT_PERMISSION" }, perm.status) };
  }
  return {
    ok: true,
    actor: {
      organizationId: member.ctx.orgId,
      userId: member.ctx.userId,
      role: member.ctx.role,
      authMethod: auth.ctx.authMethod,
    },
  };
}

/** Map a repository failure to a response that never confirms an inaccessible row. */
function repositoryFailure(reason: string): NextResponse {
  if (reason === "NOT_FOUND") return json({ error: "Not found", code: "NOT_FOUND" }, 404);
  if (reason === "FORBIDDEN") {
    return json({ error: "Insufficient organization permissions", code: "INSUFFICIENT_PERMISSION" }, 403);
  }
  if (reason === "STORAGE_UNAVAILABLE") {
    return json({ error: "Media library is temporarily unavailable", code: "STORAGE_UNAVAILABLE" }, 503);
  }
  return json({ error: "Could not load the media asset", code: "READ_FAILED" }, 500);
}

/* ── GET: detail ──────────────────────────────────────────────────────────── */

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await resolveActor(req, "view_media");
  if (!resolved.ok) return resolved.response;
  const { organizationId, role } = resolved.actor;

  const { id } = await params;
  if (!ID_PATTERN.test(id)) return json({ error: "Not found", code: "NOT_FOUND" }, 404);

  const permissions = permissionsOf(role);
  const editorial = isEditorialActor(role);

  // An authoring actor reads through the typed EDITORIAL opt-out; everyone else
  // reads through the published-only gate, which the repository applies in the
  // database query rather than trusting this caller to remember it.
  const result = await getMediaAssetById({
    organizationId,
    id,
    audience: editorial
      ? { scope: "EDITORIAL", includeUnpublished: true, permissions }
      : { scope: "ORGANIZATION" },
  });
  if (!result.ok) return repositoryFailure(result.reason);
  const asset = result.value;

  const db = (await getPrisma()) as MaybeTxClient | null;
  const translations = db ? await loadTranslations(db, organizationId, id) : [];

  const status = isMediaLifecycleStatus(asset.status) ? asset.status : null;
  const nextMoves = status
    ? allowedTransitionsFrom(status, permissions).map((t) => ({ to: t.to, action: t.action }))
    : [];

  // The editorial history is itself permissioned inside the repository, and is
  // offered only to actors who can act on it.
  let history: Array<Record<string, unknown>> = [];
  if (editorial) {
    const events = await listEditorialEventsForAsset({
      organizationId,
      mediaAssetId: id,
      permissions,
      page: 1,
      pageSize: 20,
    });
    if (events.ok) {
      history = events.value.items.map((row) => ({
        fromStatus: row.fromStatus ?? null,
        toStatus: row.toStatus ?? null,
        action: row.action ?? null,
        actorUserId: row.actorUserId ?? null,
        reason: row.reason ?? null,
        createdAt: toIso(row.createdAt as Date | string | null),
      }));
    }
  }

  return json(
    {
      asset: toMediaAssetDto(asset),
      translations: translations.map(toTranslationDto),
      allowedTransitions: nextMoves,
      editorialEvents: history,
    },
    200,
  );
}

/* ── PATCH: edit a DRAFT or REJECTED asset ────────────────────────────────── */

/**
 * The writable surface. `.strict()` rejects anything else, so `status`,
 * `processingState`, `slug`, `organizationId`, `publishedAt`, `createdBy` and the
 * denormalised counters cannot be written through this route at all — they are
 * moved by the lifecycle, the processing machine and the analytics writer, each
 * of which is a separate, audited act.
 *
 * `slug` is deliberately immutable after creation: it is the identity a link, a
 * bookmark and a search engine hold, and rewriting it silently breaks all three.
 */
const updateAssetSchema = z
  .object({
    locale: z.enum(MEDIA_LOCALES).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    summary: z.string().trim().max(500).nullable().optional(),
    description: z.string().trim().max(20_000).nullable().optional(),
    visibility: z.enum(MEDIA_VISIBILITIES).optional(),
    skillLevel: z.enum(MEDIA_SKILL_LEVELS).nullable().optional(),
    categoryId: z.string().regex(ID_PATTERN).nullable().optional(),
    instructorId: z.string().regex(ID_PATTERN).nullable().optional(),
    siteId: z.string().regex(ID_PATTERN).nullable().optional(),
    durationSeconds: z.number().int().min(0).max(24 * 60 * 60).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "empty_update" });

async function referenceBelongsToOrg(
  client: MaybeTxClient,
  modelName: "mediaCategory" | "mediaInstructor" | "industrialSite",
  id: string,
  organizationId: string,
): Promise<boolean> {
  const model = client[modelName];
  if (!model || typeof model.findFirst !== "function") return false;
  const row = await model.findFirst({ where: { id, organizationId } });
  return Boolean(row);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await resolveActor(req, "manage_media");
  if (!resolved.ok) return resolved.response;
  const { organizationId, userId, role, authMethod } = resolved.actor;

  // Same-origin, for cookie-authenticated writes only. Runs before the id is
  // read, so the refusal is identical for every id and cannot be probed.
  const originGate = requireTrustedOrigin(req, authMethod);
  if (!originGate.ok) return json({ error: "Forbidden", code: "FORBIDDEN" }, 403);

  const { id } = await params;
  if (!ID_PATTERN.test(id)) return json({ error: "Not found", code: "NOT_FOUND" }, 404);

  const limitKey = `${organizationId}:${userId}`;
  if (!(await checkRateLimit(MEDIA_WRITE_LIMIT, limitKey))) {
    return json({ error: "Too many requests", code: "RATE_LIMITED" }, 429, {
      "Retry-After": String(retryAfter(MEDIA_WRITE_LIMIT, limitKey)),
    });
  }

  // Commercial gate, AFTER RBAC — the same order the collection POST uses.
  // Editing an asset's metadata is authoring work, so a tenant without the
  // `video_hub` entitlement may not do it. `requestedUnits: 0` asks whether the
  // capability is AVAILABLE rather than metering another unit: the unit was
  // already consumed when the asset was created, and an edit is not a second
  // asset.
  const entitlement = await enforceEntitlement({
    organisationId: organizationId,
    entitlementKey: "video_hub",
    requestedUnits: 0,
    userId,
  });
  if (!entitlement.ok) return entitlement.response;

  if (!isJsonContentType(req)) {
    return json({ error: "JSON request body required", code: "UNSUPPORTED_MEDIA_TYPE" }, 415);
  }
  const body = await readBoundedTextBody(req, MAX_BODY_BYTES);
  if (body.status === "too_large") {
    return json({ error: "Request body too large", code: "BODY_TOO_LARGE" }, 413);
  }
  if (body.status === "error") {
    return json({ error: "Malformed request body", code: "INVALID_INPUT" }, 400);
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(body.text);
  } catch {
    return json({ error: "Malformed request body", code: "INVALID_INPUT" }, 400);
  }

  const parsed = updateAssetSchema.safeParse(candidate);
  if (!parsed.success) return json({ error: "Invalid media asset update", code: "INVALID_INPUT" }, 400);
  const input = parsed.data;

  // Load through the EDITORIAL opt-out — an unpublished draft is exactly what
  // this handler edits — and answer 404 for another tenant's row.
  const existing = await getMediaAssetById({
    organizationId,
    id,
    audience: { scope: "EDITORIAL", includeUnpublished: true, permissions: permissionsOf(role) },
  });
  if (!existing.ok) return repositoryFailure(existing.reason);

  if (!isMediaLifecycleStatus(existing.value.status) || !EDITABLE_STATUSES.includes(existing.value.status)) {
    return json(
      { error: "This asset is no longer editable", code: "NOT_EDITABLE" },
      409,
    );
  }

  const db = (await getPrisma()) as MaybeTxClient | null;
  if (!db) return json({ error: "Media library is temporarily unavailable", code: "STORAGE_UNAVAILABLE" }, 503);

  for (const [modelName, value] of [
    ["mediaCategory", input.categoryId],
    ["mediaInstructor", input.instructorId],
    ["industrialSite", input.siteId],
  ] as const) {
    if (!value) continue; // `null` clears the link and needs no ownership proof.
    if (!(await referenceBelongsToOrg(db, modelName, value, organizationId))) {
      return json({ error: "Invalid reference", code: "INVALID_REFERENCE" }, 400);
    }
  }

  const now = new Date();
  const assetData: Record<string, unknown> = { updatedBy: userId, updatedAt: now };
  if ("visibility" in input) assetData.visibility = input.visibility;
  if ("skillLevel" in input) assetData.skillLevel = input.skillLevel ?? null;
  if ("categoryId" in input) assetData.categoryId = input.categoryId ?? null;
  if ("instructorId" in input) assetData.instructorId = input.instructorId ?? null;
  if ("siteId" in input) assetData.siteId = input.siteId ?? null;
  if ("durationSeconds" in input) assetData.durationSeconds = input.durationSeconds ?? null;

  const touchesCopy = "title" in input || "summary" in input || "description" in input;
  const locale = input.locale ?? existing.value.primaryLocale;

  try {
    await withTx(db, async (tx) => {
      // COMPARE-AND-SWAP on the lifecycle state, not a read-then-write. A
      // concurrent SUBMIT landing between the load above and this write makes
      // the predicate match nothing, so the edit is refused instead of silently
      // mutating an asset that is now under review.
      const res = (await tx.mediaAsset.updateMany({
        where: { id, organizationId, status: { in: [...EDITABLE_STATUSES] } },
        data: assetData,
      })) as { count?: number };
      if ((typeof res?.count === "number" ? res.count : 0) !== 1) {
        throw new Error("CAS_CONFLICT");
      }

      if (!touchesCopy) return;

      const current = (await tx.mediaAssetTranslation.findFirst({
        where: { organizationId, mediaAssetId: id, locale },
      })) as { id: string } | null;

      const copy: Record<string, unknown> = { updatedAt: now };
      if ("title" in input) copy.title = input.title;
      if ("summary" in input) copy.summary = input.summary ?? null;
      if ("description" in input) copy.description = input.description ?? null;

      if (current) {
        // The tenant predicate is repeated on the write: the row id alone would
        // satisfy Prisma, but it would not prove ownership at the database.
        await tx.mediaAssetTranslation.updateMany({
          where: { id: current.id, organizationId, mediaAssetId: id },
          data: copy,
        });
        return;
      }

      if (typeof copy.title !== "string") {
        // A new locale row cannot be created from a summary alone — `title` is
        // NOT NULL. Refuse rather than invent a placeholder title.
        throw new Error("TITLE_REQUIRED_FOR_NEW_LOCALE");
      }
      await tx.mediaAssetTranslation.create({
        data: {
          organizationId,
          mediaAssetId: id,
          locale,
          title: copy.title,
          summary: copy.summary ?? null,
          description: copy.description ?? null,
          keywords: [],
          createdAt: now,
          updatedAt: now,
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "TITLE_REQUIRED_FOR_NEW_LOCALE") {
      return json({ error: "A title is required for a new locale", code: "TITLE_REQUIRED" }, 400);
    }
    return json({ error: "The asset changed while it was being edited", code: "CONFLICT" }, 409);
  }

  // Field NAMES and closed enums only — never the authored copy itself.
  await recordAuditEvent({
    userId,
    action: "media.asset.updated",
    entityType: "MediaAsset",
    entityId: id,
    organizationId,
    outcome: "success",
    metadata: {
      fields: Object.keys(input).sort(),
      fromStatus: existing.value.status,
      locale: touchesCopy ? locale : null,
    },
  });

  const reread = await getMediaAssetById({
    organizationId,
    id,
    audience: { scope: "EDITORIAL", includeUnpublished: true, permissions: permissionsOf(role) },
  });
  if (!reread.ok) return repositoryFailure(reread.reason);

  return json({ asset: toMediaAssetDto(reread.value) }, 200);
}
