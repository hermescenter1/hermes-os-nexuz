/**
 * PHASE 102 — Hermes Media & Video Hub: the caller's OWN watch progress.
 *
 * Design authority: docs/phase102/architecture.md §8.
 *
 * GET  /api/media/me/progress   — this user's continue-watching list
 * PUT  /api/media/me/progress   — upsert this user's position in one asset
 *
 * PRIVACY IS A QUERY PROPERTY, NOT A RESPONSE PROPERTY (§8).
 * ---------------------------------------------------------
 * Every read and every write reaches Prisma with `userId` in the `where` clause —
 * `listContinueWatchingForUser` and `recordWatchProgressForUser` both take it as a
 * required predicate, and the repository repeats it on the UPDATE even though the
 * row id alone would satisfy Prisma. No row belonging to another subject is ever
 * materialised, so there is nothing for a later refactor to forget to filter out.
 *
 * WHERE THE IDENTIFIERS COME FROM
 * -------------------------------
 *   userId — `requirePlatformAuth`, from the verified session. Never the body.
 *   orgId  — `requirePlatformAuth`, server-derived from the user's ACTIVE
 *            membership, then re-verified by `requireOrgActor`. Never the body.
 *   asset  — addressed by SLUG and resolved through the repository's audience gate,
 *            so the caller never sends, and never learns, a database id.
 *
 * An API-key context is REFUSED. `requirePlatformAuth` returns `userId: null` for
 * key auth (keys are org-scoped, not person-scoped), and per-subject viewing history
 * has no meaning without a subject — treating a key as one would either attribute
 * rows to nobody or, worse, invite a `userId` parameter to fill the gap.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { enforceEntitlement } from "@/lib/billing-governance/runtime/require-entitlement";
import {
  MEDIA_PAGE_SIZE_DEFAULT,
  MEDIA_PAGE_SIZE_MAX,
  getMediaAssetBySlug,
  listContinueWatchingForUser,
  recordWatchProgressForUser,
  type MediaAudience,
} from "@/lib/media/db";
import { requirePlatformAuth } from "@/lib/api/auth";
import { requireOrgActor } from "@/lib/org/context";
import { requirePermission } from "@/lib/org/rbac";
import {
  isAllowedOrigin,
  isJsonContentType,
  readBoundedTextBody,
  securityError,
} from "@/lib/security/request-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A signed-in member sees PUBLISHED assets that are PUBLIC *or* ORGANIZATION
 * visible, and only when their bytes are READY. This is still the repository's gate,
 * not a locally written filter — the audience is a typed selector over rules that
 * live in `src/lib/media/db.ts`. The EDITORIAL opt-out is never constructed here.
 */
const MEMBER_AUDIENCE: MediaAudience = { scope: "ORGANIZATION" };

/** The upper bound the schema enforces before clamping narrows it further. */
const MAX_POSITION_SECONDS = 24 * 60 * 60;

const MAX_BODY_BYTES = 2 * 1024;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ALLOWED_QUERY_KEYS = new Set(["page", "pageSize"]);

const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(400).optional(),
    pageSize: z.coerce.number().int().min(1).max(MEDIA_PAGE_SIZE_MAX).optional(),
  })
  .strict();

/**
 * `.strict()` is the control that makes "user A cannot write user B's progress"
 * unexpressible rather than merely unimplemented: there is no `userId`,
 * `organizationId` or `mediaAssetId` field, and sending one is a 400.
 *
 * The numeric bounds here are a sanity ceiling, not the real limit — the handler
 * CLAMPS afterwards against the asset's own duration, because a value inside these
 * bounds can still be nonsense for a three-minute video.
 */
const upsertSchema = z
  .object({
    slug: z.string().min(1).max(160).regex(SLUG_PATTERN),
    positionSeconds: z.number().finite(),
    progressPct: z.number().finite(),
  })
  .strict();

/** Audit vocabulary for this slice, in the repository's `domain.entity.action` form. */
const MEDIA_PROGRESS_AUDIT = "media.watch_progress.recorded";

type Gate =
  | { ok: true; organizationId: string; userId: string }
  | { ok: false; response: NextResponse };

/**
 * Authentication → org membership → RBAC → entitlement, in that order.
 *
 * The order matters. RBAC runs BEFORE the entitlement check so an unauthorised
 * caller learns nothing about the tenant's commercial plan, and the entitlement
 * denial response is returned verbatim so the billing surface stays the single
 * author of what a denial says.
 */
async function gate(req: NextRequest, units: number): Promise<Gate> {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) {
    return { ok: false, response: securityError({ error: auth.error }, auth.status) };
  }
  const { ctx } = auth;

  // An API key is not a person. Per-subject history requires a subject.
  if (!ctx.userId) {
    return {
      ok: false,
      response: securityError({ error: "a user session is required" }, 403),
    };
  }

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) {
    return { ok: false, response: securityError({ error: member.error }, member.status) };
  }

  const perm = requirePermission(member.ctx.role, "view_media");
  if (!perm.ok) {
    return { ok: false, response: securityError({ error: perm.error }, perm.status) };
  }

  const entitled = await enforceEntitlement({
    organisationId: ctx.orgId,
    entitlementKey: "video_hub",
    requestedUnits: units,
    userId: ctx.userId,
  });
  if (!entitled.ok) return { ok: false, response: entitled.response };

  return { ok: true, organizationId: ctx.orgId, userId: ctx.userId };
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  // `requestedUnits: 0` — an availability check, not a consumption.
  const g = await gate(req, 0);
  if (!g.ok) return g.response;

  const url = new URL(req.url);
  const raw: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (!ALLOWED_QUERY_KEYS.has(key)) {
      return securityError({ error: "unsupported query parameter" }, 400);
    }
    raw[key] = value;
  }
  const parsed = listQuerySchema.safeParse(raw);
  if (!parsed.success) return securityError({ error: "invalid query" }, 400);

  const listed = await listContinueWatchingForUser({
    organizationId: g.organizationId,
    // The authenticated subject. There is no query parameter that can change this.
    userId: g.userId,
    audience: MEMBER_AUDIENCE,
    page: parsed.data.page ?? 1,
    pageSize: parsed.data.pageSize ?? MEDIA_PAGE_SIZE_DEFAULT,
  });
  if (!listed.ok) {
    const status = listed.reason === "STORAGE_UNAVAILABLE" ? 503 : 500;
    return securityError({ error: "watch progress unavailable" }, status);
  }

  // Explicit whitelist. The progress row's own id, its `organizationId` and its
  // `userId` are not echoed: the caller already knows who they are, and the ids are
  // internal handles nothing outside the server needs.
  return NextResponse.json(
    {
      items: listed.value.items.map((row) => ({
        slug: row.mediaAsset?.slug ?? null,
        positionSeconds: row.positionSeconds,
        progressPct: row.progressPct,
        completed: row.completedAt !== null && row.completedAt !== undefined,
        lastWatchedAt: iso(row.lastWatchedAt),
        durationSeconds: row.mediaAsset?.durationSeconds ?? null,
      })),
      page: listed.value.page,
      pageSize: listed.value.pageSize,
      total: listed.value.total,
      hasMore: listed.value.hasMore,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// ── PUT ──────────────────────────────────────────────────────────────────────

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const g = await gate(req, 1);
  if (!g.ok) return g.response;

  // Same-origin validation for a cookie-authenticated, state-changing write — the
  // primary application-layer CSRF guard (SameSite is only a complement).
  if (!isAllowedOrigin(req.headers.get("origin"))) {
    return securityError({ error: "invalid origin" }, 403);
  }
  if (!isJsonContentType(req)) {
    return securityError({ error: "unsupported media type" }, 415);
  }

  const body = await readBoundedTextBody(req, MAX_BODY_BYTES);
  if (body.status === "too_large") return securityError({ error: "payload too large" }, 413);
  if (body.status === "error") return securityError({ error: "invalid body" }, 400);

  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    return securityError({ error: "invalid body" }, 400);
  }
  const parsed = upsertSchema.safeParse(json);
  if (!parsed.success) return securityError({ error: "invalid body" }, 400);

  // Resolve the asset through the repository gate. A slug the member may not see —
  // another tenant's, a draft, a PRIVATE asset, one still validating — is a 404, and
  // nothing is written.
  const asset = await getMediaAssetBySlug({
    organizationId: g.organizationId,
    slug: parsed.data.slug,
    audience: MEMBER_AUDIENCE,
  });
  if (!asset.ok) {
    if (asset.reason === "STORAGE_UNAVAILABLE") {
      return securityError({ error: "watch progress unavailable" }, 503);
    }
    return securityError({ error: "not found" }, 404);
  }

  // CLAMP, do not trust. `progressPct` is pinned to 0..100, and `positionSeconds` to
  // the asset's own duration when the server knows it — an asset with no duration
  // (there is no probe — ADR §9) falls back to the absolute 24-hour ceiling the
  // repository also enforces. A client cannot store a position beyond the end of the
  // video, and cannot claim 900% progress.
  const duration = asset.value.durationSeconds;
  const maxPosition =
    typeof duration === "number" && Number.isFinite(duration) && duration > 0
      ? Math.min(Math.trunc(duration), MAX_POSITION_SECONDS)
      : MAX_POSITION_SECONDS;
  const positionSeconds = clampInt(parsed.data.positionSeconds, 0, maxPosition);
  const progressPct = clampInt(parsed.data.progressPct, 0, 100);

  const written = await recordWatchProgressForUser({
    organizationId: g.organizationId,
    userId: g.userId,
    mediaAssetId: asset.value.id,
    positionSeconds,
    progressPct,
    audience: MEMBER_AUDIENCE,
  });
  if (!written.ok) {
    if (written.reason === "NOT_FOUND") return securityError({ error: "not found" }, 404);
    if (written.reason === "INVALID_INPUT") return securityError({ error: "invalid body" }, 400);
    const status = written.reason === "STORAGE_UNAVAILABLE" ? 503 : 500;
    return securityError({ error: "watch progress not recorded" }, status);
  }

  void recordAuditEvent({
    action: MEDIA_PROGRESS_AUDIT,
    entityType: "MediaWatchProgress",
    entityId: asset.value.id,
    organizationId: g.organizationId,
    userId: g.userId,
    outcome: "success",
    metadata: { slug: asset.value.slug, progressPct, completed: written.value.completed },
  });

  return NextResponse.json(
    {
      slug: asset.value.slug,
      positionSeconds,
      progressPct,
      completed: written.value.completed,
      firstCompletion: written.value.firstCompletion,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
