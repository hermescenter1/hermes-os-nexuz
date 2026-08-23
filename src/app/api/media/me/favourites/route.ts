/**
 * PHASE 102 — Hermes Media & Video Hub: the caller's OWN favourites.
 *
 * Design authority: docs/phase102/architecture.md §8.
 *
 * GET    /api/media/me/favourites            — this user's saved library
 * POST   /api/media/me/favourites            — save one asset   (body: { slug })
 * DELETE /api/media/me/favourites?slug=…     — unsave one asset
 *
 * PRIVACY IS A QUERY PROPERTY, NOT A RESPONSE PROPERTY (§8).
 * `listSavedMediaForUser`, `saveMediaForUser` and `unsaveMediaForUser` each take
 * `userId` as a required predicate that reaches the `where` clause — the delete is
 * a `deleteMany` scoped by `organizationId` + `userId` + `mediaAssetId`, so a row
 * belonging to another subject is not merely hidden, it is unreachable. Nothing is
 * fetched broadly and narrowed in JavaScript.
 *
 * WHERE THE IDENTIFIERS COME FROM
 * -------------------------------
 *   userId — the verified session (`requirePlatformAuth`). Never the body or query.
 *   orgId  — server-derived from the ACTIVE membership, re-verified by
 *            `requireOrgActor`. Never the body or query.
 *   asset  — addressed by SLUG through the repository's audience gate. The caller
 *            never sends, and never learns, a database id.
 *
 * The request schemas are `.strict()` and the query surface is a closed allow-list,
 * so `userId=<someone-else>` is a 400 on every verb rather than a parameter that is
 * accepted and then quietly ignored — the difference matters, because "ignored" is
 * one refactor away from "honoured".
 *
 * An API-key context is refused for the same reason as the progress plane: a key is
 * org-scoped, not person-scoped, and a favourite without a person is meaningless.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { enforceEntitlement } from "@/lib/billing-governance/runtime/require-entitlement";
import { requirePlatformAuth } from "@/lib/api/auth";
import {
  MEDIA_PAGE_SIZE_DEFAULT,
  MEDIA_PAGE_SIZE_MAX,
  getMediaAssetBySlug,
  listSavedMediaForUser,
  saveMediaForUser,
  unsaveMediaForUser,
  type MediaAudience,
} from "@/lib/media/db";
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

/** PUBLISHED + (PUBLIC | ORGANIZATION) + READY. The repository owns the rule. */
const MEMBER_AUDIENCE: MediaAudience = { scope: "ORGANIZATION" };

const MAX_BODY_BYTES = 2 * 1024;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const LIST_QUERY_KEYS = new Set(["page", "pageSize"]);
const DELETE_QUERY_KEYS = new Set(["slug"]);

const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(400).optional(),
    pageSize: z.coerce.number().int().min(1).max(MEDIA_PAGE_SIZE_MAX).optional(),
  })
  .strict();

const slugSchema = z.string().min(1).max(160).regex(SLUG_PATTERN);

/** No `userId`, no `organizationId`, no `mediaAssetId` — and `.strict()` makes
 *  sending one a 400 rather than a silently discarded field. */
const saveSchema = z.object({ slug: slugSchema }).strict();

const deleteQuerySchema = z.object({ slug: slugSchema }).strict();

const MEDIA_FAVOURITE_ADDED_AUDIT = "media.favourite.added";
const MEDIA_FAVOURITE_REMOVED_AUDIT = "media.favourite.removed";

type Gate =
  | { ok: true; organizationId: string; userId: string }
  | { ok: false; response: NextResponse };

/** Authentication → org membership → RBAC → entitlement, in that order (see the
 *  progress route for why RBAC must precede the entitlement check). */
async function gate(req: NextRequest, units: number): Promise<Gate> {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) {
    return { ok: false, response: securityError({ error: auth.error, code: auth.code }, auth.status) };
  }
  const { ctx } = auth;

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

function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Shared prelude for the two write verbs: origin, then a bounded JSON read. */
function checkWritePreconditions(req: NextRequest): NextResponse | null {
  if (!isAllowedOrigin(req.headers.get("origin"))) {
    return securityError({ error: "invalid origin" }, 403);
  }
  return null;
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const g = await gate(req, 0);
  if (!g.ok) return g.response;

  const url = new URL(req.url);
  const raw: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (!LIST_QUERY_KEYS.has(key)) {
      return securityError({ error: "unsupported query parameter" }, 400);
    }
    raw[key] = value;
  }
  const parsed = listQuerySchema.safeParse(raw);
  if (!parsed.success) return securityError({ error: "invalid query" }, 400);

  const listed = await listSavedMediaForUser({
    organizationId: g.organizationId,
    // The authenticated subject. No parameter can redirect this.
    userId: g.userId,
    audience: MEMBER_AUDIENCE,
    page: parsed.data.page ?? 1,
    pageSize: parsed.data.pageSize ?? MEDIA_PAGE_SIZE_DEFAULT,
  });
  if (!listed.ok) {
    const status = listed.reason === "STORAGE_UNAVAILABLE" ? 503 : 500;
    return securityError({ error: "favourites unavailable" }, status);
  }

  return NextResponse.json(
    {
      items: listed.value.items.map((row) => ({
        slug: row.mediaAsset?.slug ?? null,
        savedAt: iso(row.createdAt),
        durationSeconds: row.mediaAsset?.durationSeconds ?? null,
        skillLevel: row.mediaAsset?.skillLevel ?? null,
      })),
      page: listed.value.page,
      pageSize: listed.value.pageSize,
      total: listed.value.total,
      hasMore: listed.value.hasMore,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const g = await gate(req, 1);
  if (!g.ok) return g.response;

  const precondition = checkWritePreconditions(req);
  if (precondition) return precondition;
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
  const parsed = saveSchema.safeParse(json);
  if (!parsed.success) return securityError({ error: "invalid body" }, 400);

  const asset = await getMediaAssetBySlug({
    organizationId: g.organizationId,
    slug: parsed.data.slug,
    audience: MEMBER_AUDIENCE,
  });
  if (!asset.ok) {
    if (asset.reason === "STORAGE_UNAVAILABLE") {
      return securityError({ error: "favourites unavailable" }, 503);
    }
    return securityError({ error: "not found" }, 404);
  }

  const saved = await saveMediaForUser({
    organizationId: g.organizationId,
    userId: g.userId,
    mediaAssetId: asset.value.id,
    audience: MEMBER_AUDIENCE,
  });
  if (!saved.ok) {
    if (saved.reason === "NOT_FOUND") return securityError({ error: "not found" }, 404);
    const status = saved.reason === "STORAGE_UNAVAILABLE" ? 503 : 500;
    return securityError({ error: "favourite not saved" }, status);
  }

  void recordAuditEvent({
    action: MEDIA_FAVOURITE_ADDED_AUDIT,
    entityType: "MediaSave",
    entityId: asset.value.id,
    organizationId: g.organizationId,
    userId: g.userId,
    outcome: "success",
    metadata: { slug: asset.value.slug, created: saved.value.created },
  });

  // Idempotent: saving twice is a success that does not double-count.
  return NextResponse.json(
    { slug: asset.value.slug, saved: true, created: saved.value.created },
    { status: saved.value.created ? 201 : 200, headers: { "Cache-Control": "no-store" } },
  );
}

// ── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const g = await gate(req, 0);
  if (!g.ok) return g.response;

  const precondition = checkWritePreconditions(req);
  if (precondition) return precondition;

  // The slug travels in the query string: DELETE bodies are dropped by several
  // HTTP client stacks, and a verb whose payload may silently vanish is a bad place
  // to put the only thing that identifies what to remove.
  const url = new URL(req.url);
  const raw: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (!DELETE_QUERY_KEYS.has(key)) {
      return securityError({ error: "unsupported query parameter" }, 400);
    }
    raw[key] = value;
  }
  const parsed = deleteQuerySchema.safeParse(raw);
  if (!parsed.success) return securityError({ error: "invalid query" }, 400);

  const asset = await getMediaAssetBySlug({
    organizationId: g.organizationId,
    slug: parsed.data.slug,
    audience: MEMBER_AUDIENCE,
  });
  if (!asset.ok) {
    if (asset.reason === "STORAGE_UNAVAILABLE") {
      return securityError({ error: "favourites unavailable" }, 503);
    }
    return securityError({ error: "not found" }, 404);
  }

  const removed = await unsaveMediaForUser({
    organizationId: g.organizationId,
    userId: g.userId,
    mediaAssetId: asset.value.id,
  });
  if (!removed.ok) {
    const status = removed.reason === "STORAGE_UNAVAILABLE" ? 503 : 500;
    return securityError({ error: "favourite not removed" }, status);
  }

  if (removed.value.removed) {
    void recordAuditEvent({
      action: MEDIA_FAVOURITE_REMOVED_AUDIT,
      entityType: "MediaSave",
      entityId: asset.value.id,
      organizationId: g.organizationId,
      userId: g.userId,
      outcome: "success",
      metadata: { slug: asset.value.slug },
    });
  }

  // Idempotent: removing something that was never saved is a success, and — because
  // the delete is scoped by userId — it is also a success when ANOTHER user has that
  // asset saved. Their row is untouched and its existence is not disclosed.
  return NextResponse.json(
    { slug: asset.value.slug, saved: false, removed: removed.value.removed },
    { headers: { "Cache-Control": "no-store" } },
  );
}
