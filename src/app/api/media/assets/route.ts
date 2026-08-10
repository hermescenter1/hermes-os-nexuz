/**
 * PHASE 102 — Hermes Media & Video Hub: the org-scoped authoring API (collection).
 *
 * Design authority: docs/phase102/architecture.md §3 (tenancy), §11 (workflow),
 * §12 (gates).
 *
 * AUTHORIZATION CHAIN (identical shape on both handlers, per the repository's
 * established pattern — see src/app/api/knowledge/articles/route.ts):
 *
 *   requirePlatformAuth  → establishes identity and a SERVER-DERIVED orgId
 *   requireOrgActor      → proves ACTIVE membership of that org, yields the role
 *   requirePermission    → the org permission this handler needs
 *   enforceEntitlement   → the commercial gate, AFTER RBAC, on writes only
 *
 * `organizationId` is taken from the membership record resolved above and NEVER
 * from the body, the query string or a header. The request cannot name a tenant.
 *
 * WHY THE QUERY STRING IS AN ALLOW-LIST THAT *REJECTS* UNKNOWN KEYS
 * ----------------------------------------------------------------
 * The shared `parseQuery` helper silently ignores parameters it does not know.
 * That is how a mistyped filter (`?catgoryId=…`) becomes a request that returns
 * the WHOLE library instead of one category — a silent widening the caller never
 * sees. This route answers 400 for any key outside the allow-list, and 400 for a
 * known key carrying an out-of-range value, so a filter either narrows the result
 * set exactly as asked or the request fails loudly.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAuth } from "@/lib/api/auth";
import { requireOrgActor } from "@/lib/org/context";
import { can, requirePermission, type OrgPermission } from "@/lib/org/rbac";
import type { OrgRole } from "@/lib/org/types";
import { enforceEntitlement } from "@/lib/billing-governance/runtime/require-entitlement";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import { isJsonContentType, readBoundedTextBody } from "@/lib/security/request-guards";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { getPrisma } from "@/lib/db/prisma";
import { z } from "zod";
import {
  listMediaAssets,
  MEDIA_PAGE_SIZE_DEFAULT,
  MEDIA_PAGE_SIZE_MAX,
  MEDIA_PAGE_MAX,
  type MediaAssetRow,
} from "@/lib/media/db";
import { MEDIA_INITIAL_PROCESSING_STATE, MEDIA_INITIAL_STATUS } from "@/lib/media/lifecycle";
import {
  MEDIA_LOCALES,
  MEDIA_SKILL_LEVELS,
  MEDIA_VISIBILITIES,
} from "@/lib/media/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ── Shared vocabulary ────────────────────────────────────────────────────── */

/** The three Phase 102 org permissions, used to project a role into a list. */
const MEDIA_PERMISSIONS: readonly OrgPermission[] = ["view_media", "manage_media", "review_media"];

/**
 * The permissions a role actually holds, computed from the real RBAC table.
 *
 * The repository layer takes a permission LIST (it re-checks the editorial gate
 * itself rather than trusting the caller), so this is how a role is projected
 * onto that contract. It is derived — never read from the request.
 */
function permissionsOf(role: OrgRole): readonly OrgPermission[] {
  return MEDIA_PERMISSIONS.filter((p) => can(role, p));
}

/** Holding either authoring permission is what makes an EDITORIAL read legitimate. */
function isEditorialActor(role: OrgRole): boolean {
  return can(role, "manage_media") || can(role, "review_media");
}

/** Rate-limit bucket for authenticated media writes. */
const MEDIA_WRITE_LIMIT = "media-authoring-write";

/** Bodies here are metadata only — the bytes go to the upload route. */
const MAX_BODY_BYTES = 32 * 1024;

function json(body: Record<string, unknown>, status: number, headers?: HeadersInit) {
  return NextResponse.json(body, { status, headers });
}

/* ── Response projection ──────────────────────────────────────────────────── */

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * The wire shape of one asset.
 *
 * `storageKey` / `posterStorageKey` are deliberately NOT exposed. They are
 * server-generated object-storage keys; a client that needs the bytes asks the
 * byte-serving route, which re-authorises. Publishing the key would turn an
 * internal storage layout into a public contract for no gain.
 *
 * Not exported: Next.js validates the export surface of a `route` module, so a
 * helper exported from here would fail the build's route-type check. The
 * [id] route carries its own copy of this projection for the same reason.
 */
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

/* ── GET: the allow-listed, paginated, tenant-scoped listing ──────────────── */

/**
 * Every query parameter this route understands. A key outside this set is a
 * client bug, and answering 400 is the only response that cannot silently
 * widen a result set.
 */
const ALLOWED_QUERY_KEYS = new Set([
  "page",
  "pageSize",
  "scope",
  "categoryId",
  "instructorId",
  "siteId",
  "skillLevel",
]);

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(MEDIA_PAGE_MAX).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(MEDIA_PAGE_SIZE_MAX)
      .default(MEDIA_PAGE_SIZE_DEFAULT),
    /**
     * `published` (the default) reads through the repository's published-only
     * gate. `editorial` is the typed opt-out, and it is additionally gated on
     * holding an authoring permission — `view_media` alone belongs to every role
     * including VIEWER and BILLING_ADMIN, and a VIEWER has no business reading
     * unpublished drafts.
     */
    scope: z.enum(["published", "editorial"]).default("published"),
    categoryId: z.string().regex(ID_PATTERN).optional(),
    instructorId: z.string().regex(ID_PATTERN).optional(),
    siteId: z.string().regex(ID_PATTERN).optional(),
    skillLevel: z.enum(MEDIA_SKILL_LEVELS).optional(),
  })
  .strict();

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return json({ error: auth.error, code: "AUTHENTICATION_REQUIRED" }, auth.status);

  const member = await requireOrgActor(req, auth.ctx.orgId);
  if ("error" in member) return json({ error: member.error, code: "ORGANIZATION_SCOPE_REQUIRED" }, member.status);

  const perm = requirePermission(member.ctx.role, "view_media");
  if (!perm.ok) return json({ error: perm.error, code: "INSUFFICIENT_PERMISSION" }, perm.status);

  const url = new URL(req.url);
  const raw: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (!ALLOWED_QUERY_KEYS.has(key)) {
      // The unknown key is NOT echoed — a 400 that reflects attacker-controlled
      // text is a reflected-content sink for no diagnostic benefit.
      return json({ error: "Unsupported query parameter", code: "UNKNOWN_QUERY_PARAMETER" }, 400);
    }
    raw[key] = value;
  }

  const parsed = listQuerySchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Invalid query", code: "INVALID_QUERY" }, 400);
  const query = parsed.data;

  if (query.scope === "editorial" && !isEditorialActor(member.ctx.role)) {
    return json({ error: "Insufficient organization permissions", code: "INSUFFICIENT_PERMISSION" }, 403);
  }

  const result = await listMediaAssets({
    organizationId: member.ctx.orgId,
    audience:
      query.scope === "editorial"
        ? {
            scope: "EDITORIAL",
            includeUnpublished: true,
            permissions: permissionsOf(member.ctx.role),
          }
        : { scope: "ORGANIZATION" },
    filters: {
      categoryId: query.categoryId,
      instructorId: query.instructorId,
      siteId: query.siteId,
      skillLevel: query.skillLevel,
    },
    page: query.page,
    pageSize: query.pageSize,
  });

  if (!result.ok) {
    if (result.reason === "FORBIDDEN") {
      return json({ error: "Insufficient organization permissions", code: "INSUFFICIENT_PERMISSION" }, 403);
    }
    if (result.reason === "STORAGE_UNAVAILABLE") {
      return json({ error: "Media library is temporarily unavailable", code: "STORAGE_UNAVAILABLE" }, 503);
    }
    return json({ error: "Could not list media assets", code: "LIST_FAILED" }, 500);
  }

  return json(
    {
      assets: result.value.items.map(toMediaAssetDto),
      page: result.value.page,
      pageSize: result.value.pageSize,
      total: result.value.total,
      hasMore: result.value.hasMore,
      scope: query.scope,
    },
    200,
  );
}

/* ── POST: create a DRAFT ─────────────────────────────────────────────────── */

/**
 * The writable surface, and nothing else.
 *
 * `.strict()` is the mass-assignment control: an unknown key is a 400, so a body
 * carrying `organizationId`, `status`, `processingState`, `publishedAt`,
 * `viewCount`, `slug` or `createdBy` is REJECTED rather than being quietly
 * dropped. Rejecting is deliberately louder than stripping — a client trying to
 * set its own tenant or lifecycle should learn that it failed.
 *
 * Deliberately NOT writable here: `industrialDomain`, `linkedAssetType`,
 * `linkedProtocol`, the soft `linked*Id` references, `canonicalUrl` and
 * `noIndex`. The repository's row projection does not surface them, and a field
 * that cannot be read back through this API is a field whose value nobody can
 * verify. They stay at their schema defaults until a slice that also reads them.
 */
const createAssetSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    primaryLocale: z.enum(MEDIA_LOCALES).default("en"),
    summary: z.string().trim().max(500).optional(),
    description: z.string().trim().max(20_000).optional(),
    visibility: z.enum(MEDIA_VISIBILITIES).default("PRIVATE"),
    skillLevel: z.enum(MEDIA_SKILL_LEVELS).optional(),
    categoryId: z.string().regex(ID_PATTERN).optional(),
    instructorId: z.string().regex(ID_PATTERN).optional(),
    siteId: z.string().regex(ID_PATTERN).optional(),
    durationSeconds: z.number().int().min(0).max(24 * 60 * 60).optional(),
  })
  .strict();

/* Minimal structural view of the Prisma client — the same loose-typing
 * accommodation the repository layer makes (src/lib/media/db.ts), because
 * `getPrisma()` deliberately returns an untyped client so the build never
 * requires a generated one. */
type AnyModel = Record<string, (...args: unknown[]) => Promise<unknown>>;
type TxModels = Record<string, AnyModel>;
type MaybeTxClient = TxModels & {
  $transaction?: <T>(fn: (tx: TxModels) => Promise<T>) => Promise<T>;
};

async function withTx<T>(client: MaybeTxClient, fn: (tx: TxModels) => Promise<T>): Promise<T> {
  if (typeof client.$transaction === "function") return client.$transaction((tx) => fn(tx));
  return fn(client);
}

const SLUG_MAX_LENGTH = 80;

/**
 * Server-derived slug.
 *
 * Unicode letters and digits are KEPT (`\p{L}` / `\p{N}`), so a Persian or German
 * title produces a meaningful slug instead of collapsing to nothing; everything
 * else becomes a single hyphen. The client never supplies a slug, so this is not
 * a sanitiser standing between hostile input and a filesystem — the storage key
 * is generated separately and never derived from anything here.
 */
function deriveMediaSlug(title: string): string {
  const normalized = title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
  return normalized;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Find a slug free within THIS organization.
 *
 * Uniqueness is `@@unique([organizationId, slug])`, so two tenants may hold the
 * same slug and a probe here can never reveal another tenant's content: every
 * lookup carries `organizationId`.
 */
async function allocateSlug(
  model: AnyModel,
  organizationId: string,
  base: string,
): Promise<string | null> {
  const root = base || `media-${randomSuffix()}`;
  const candidates = [root, ...[2, 3, 4, 5, 6].map((n) => `${root}-${n}`), `${root}-${randomSuffix()}`];
  for (const candidate of candidates) {
    const existing = await model.findFirst({ where: { organizationId, slug: candidate } });
    if (!existing) return candidate;
  }
  return null;
}

/**
 * Prove that an optional foreign key belongs to the SAME organization.
 *
 * Without this a tenant could attach its asset to another tenant's category,
 * instructor or industrial site: the database's foreign keys constrain existence,
 * not ownership. A miss is reported as an invalid reference — never as
 * "that row exists but is not yours".
 */
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

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return json({ error: auth.error, code: "AUTHENTICATION_REQUIRED" }, auth.status);

  const member = await requireOrgActor(req, auth.ctx.orgId);
  if ("error" in member) return json({ error: member.error, code: "ORGANIZATION_SCOPE_REQUIRED" }, member.status);

  const perm = requirePermission(member.ctx.role, "manage_media");
  if (!perm.ok) return json({ error: perm.error, code: "INSUFFICIENT_PERMISSION" }, perm.status);

  const organizationId = member.ctx.orgId;
  const actorUserId = member.ctx.userId;

  // Keyed by the AUTHENTICATED identity, not by an IP. This handler is reachable
  // only with a valid session, and an identity cannot be rotated per request the
  // way a network address can. Where an IP key IS the right one (anonymous
  // surfaces), `resolveClientIp` — X-Real-IP only — is the sole permitted source:
  // nginx overwrites X-Real-IP but appends to X-Forwarded-For, so keying on XFF
  // is a live, proven rate-limit bypass.
  const limitKey = `${organizationId}:${actorUserId}`;
  if (!(await checkRateLimit(MEDIA_WRITE_LIMIT, limitKey))) {
    return json({ error: "Too many requests", code: "RATE_LIMITED" }, 429, {
      "Retry-After": String(retryAfter(MEDIA_WRITE_LIMIT, limitKey)),
    });
  }

  // Commercial gate, AFTER RBAC. The denial response is returned verbatim so the
  // billing surface owns its own status codes and body shape.
  const entitlement = await enforceEntitlement({
    organisationId: organizationId,
    entitlementKey: "video_hub",
    requestedUnits: 1,
    userId: actorUserId,
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

  const parsed = createAssetSchema.safeParse(candidate);
  if (!parsed.success) return json({ error: "Invalid media asset", code: "INVALID_INPUT" }, 400);
  const input = parsed.data;

  const db = (await getPrisma()) as MaybeTxClient | null;
  if (!db) return json({ error: "Media library is temporarily unavailable", code: "STORAGE_UNAVAILABLE" }, 503);

  // Cross-tenant reference check, before any write.
  for (const [modelName, id] of [
    ["mediaCategory", input.categoryId],
    ["mediaInstructor", input.instructorId],
    ["industrialSite", input.siteId],
  ] as const) {
    if (!id) continue;
    if (!(await referenceBelongsToOrg(db, modelName, id, organizationId))) {
      return json({ error: "Invalid reference", code: "INVALID_REFERENCE" }, 400);
    }
  }

  const assetModel = db.mediaAsset;
  if (!assetModel || typeof assetModel.create !== "function") {
    return json({ error: "Media library is temporarily unavailable", code: "STORAGE_UNAVAILABLE" }, 503);
  }

  const slug = await allocateSlug(assetModel, organizationId, deriveMediaSlug(input.title));
  if (!slug) return json({ error: "Could not allocate a unique slug", code: "SLUG_CONFLICT" }, 409);

  const now = new Date();
  let created: MediaAssetRow;
  try {
    created = await withTx(db, async (tx) => {
      const row = (await tx.mediaAsset.create({
        data: {
          // Tenant and author come from the ACTOR. Neither is representable in
          // the request schema above, so neither can be supplied by a client.
          organizationId,
          createdBy: actorUserId,
          updatedBy: actorUserId,
          slug,
          primaryLocale: input.primaryLocale,
          // A new asset is always a DRAFT awaiting bytes. The lifecycle module
          // owns both initial states; they are not spelled out again here.
          status: MEDIA_INITIAL_STATUS,
          processingState: MEDIA_INITIAL_PROCESSING_STATE,
          visibility: input.visibility,
          skillLevel: input.skillLevel ?? null,
          categoryId: input.categoryId ?? null,
          instructorId: input.instructorId ?? null,
          siteId: input.siteId ?? null,
          durationSeconds: input.durationSeconds ?? null,
          createdAt: now,
          updatedAt: now,
        },
      })) as MediaAssetRow;

      await tx.mediaAssetTranslation.create({
        data: {
          organizationId,
          mediaAssetId: row.id,
          locale: input.primaryLocale,
          title: input.title,
          summary: input.summary ?? null,
          description: input.description ?? null,
          keywords: [],
          createdAt: now,
          updatedAt: now,
        },
      });

      return row;
    });
  } catch {
    // Includes the unique-index race on (organizationId, slug): another request
    // took the slug between the probe and the insert. A conflict, never an
    // overwrite, and never a leaked database error.
    return json({ error: "Could not create the media asset", code: "CREATE_FAILED" }, 409);
  }

  // Identifiers and closed enums only — never the title, summary or description.
  await recordAuditEvent({
    userId: actorUserId,
    action: "media.asset.created",
    entityType: "MediaAsset",
    entityId: created.id,
    organizationId,
    outcome: "success",
    metadata: {
      status: MEDIA_INITIAL_STATUS,
      processingState: MEDIA_INITIAL_PROCESSING_STATE,
      visibility: input.visibility,
      primaryLocale: input.primaryLocale,
      skillLevel: input.skillLevel ?? null,
      hasCategory: Boolean(input.categoryId),
      hasInstructor: Boolean(input.instructorId),
      hasSite: Boolean(input.siteId),
    },
  });

  return json({ asset: toMediaAssetDto(created) }, 201);
}
