/**
 * PHASE 102 — Hermes Media & Video Hub: the ANONYMOUS view/progress beacon.
 *
 * Design authority: docs/phase102/architecture.md §8.
 *
 * POST /api/media/public/videos/[slug]/view?org=<organization-slug>
 *
 * This is the only anonymous WRITE in the media hub, so it is the narrowest thing
 * in the phase. What it can do is bounded by construction:
 *
 *  - It appends ONE `MediaViewEvent`. It never touches `MediaWatchProgress` and
 *    never touches `MediaSave`, so no request that arrives here can move — let
 *    alone inflate — any subject's private viewing history. Watch progress is
 *    writable only through the authenticated per-subject plane.
 *  - `userId` is derived from the caller's OWN session cookie or is `null`. The
 *    request body has no `userId` field at all, and the schema is `.strict()`, so
 *    sending one is a 400 rather than something quietly ignored. Attributing a view
 *    to another account is therefore not expressible.
 *  - It stores an `ipHash`, NEVER a raw address (§8). The digest is salted with a
 *    server-side secret so it is not recoverable by hashing a guessed IP, and when
 *    no secret is configured the hash is OMITTED rather than written unsalted —
 *    an unsalted digest of an IPv4 address is trivially reversible and would be
 *    personal data stored in the clear under a different name.
 *  - The body is bounded in BYTES before it is parsed, the content type must be
 *    JSON, and the endpoint is rate limited on `resolveClientIp` (X-Real-IP only).
 *
 * The asset is resolved through `getMediaAssetBySlug`'s DEFAULT audience, so a
 * beacon for a draft, a PRIVATE asset, an unvalidated one, or another tenant's
 * asset all answer the same 404 and write nothing.
 */

import { createHash } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import { getPrisma } from "@/lib/db/prisma";
import { getMediaAssetBySlug, recordMediaViewEvent } from "@/lib/media/db";
import { MEDIA_LOCALES, MEDIA_VIEW_EVENT_TYPES } from "@/lib/media/types";
import { getUserIdFromRequest } from "@/lib/org/context";
import {
  isJsonContentType,
  readBoundedTextBody,
  resolveClientIp,
  securityError,
} from "@/lib/security/request-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The anonymous WRITE bucket — the tightest registered anonymous-POST budget
 * (12 / minute / IP). `src/lib/auth/rate-limiter.ts` is not owned by this slice and
 * `checkRateLimit` returns TRUE for an unregistered action, so inventing a
 * `media-view-beacon` key would silently mean "no limit". A player that emits a
 * progress beacon every 15 s uses a third of this budget.
 */
const BEACON_LIMIT_ACTION = "copilot-demo-post";

/** A beacon is four short fields. Anything larger is not a beacon. */
const MAX_BEACON_BODY_BYTES = 2 * 1024;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slugSchema = z.string().min(1).max(160).regex(SLUG_PATTERN);

const ALLOWED_QUERY_KEYS = new Set(["org"]);
const querySchema = z
  .object({ org: z.string().min(1).max(128).regex(SLUG_PATTERN) })
  .strict();

/**
 * The complete beacon vocabulary.
 *
 * `.strict()` is load-bearing, not stylistic: it is what turns `userId`,
 * `organizationId`, `ipHash` or `mediaAssetId` in the body into a 400. There is no
 * field here through which a caller can name a subject, a tenant, or a row.
 */
const beaconSchema = z
  .object({
    eventType: z.enum(MEDIA_VIEW_EVENT_TYPES),
    positionSeconds: z.number().int().min(0).max(24 * 60 * 60).optional(),
    locale: z.enum(MEDIA_LOCALES).optional(),
  })
  .strict();

type PrismaModel = Record<string, (args?: unknown) => Promise<unknown>>;
type PrismaLike = Record<string, PrismaModel>;

function notFound(): NextResponse {
  return securityError({ error: "not found" }, 404);
}

async function resolveOrganizationId(db: PrismaLike, slug: string): Promise<string | null> {
  try {
    const row = (await db.organization.findFirst({
      where: { slug },
      select: { id: true },
    })) as { id?: unknown } | null;
    return row && typeof row.id === "string" ? row.id : null;
  } catch {
    return null;
  }
}

/**
 * Salted SHA-256 of the client address, matching the repository's existing
 * `ArticleView.ipHash` derivation (`src/app/api/auth/access-request/route.ts:36`,
 * `src/app/api/sales/leads/route.ts:58`) — same secret, same algorithm — but kept at
 * the FULL 64-character digest because `recordMediaViewEvent` enforces
 * `/^[0-9a-f]{64}$/` and rejects anything shorter. That regex is the reason a caller
 * that forgot to hash gets `INVALID_INPUT` instead of silently persisting an address.
 *
 * Returns `null` when no secret is configured: an unsalted hash of a 32-bit address
 * space is reversible by brute force in seconds, so storing one would be storing the
 * IP. `MediaViewEvent.ipHash` is nullable precisely so this can fail open on
 * analytics rather than closed on privacy.
 */
function hashClientIp(ip: string): string | null {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) return null;
  if (ip === "unknown") return null;
  return createHash("sha256").update(`${ip}:${secret}`).digest("hex");
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  // 1. Rate limit before anything else touches the database.
  const ip = resolveClientIp(req);
  if (!(await checkRateLimit(BEACON_LIMIT_ACTION, ip))) {
    return securityError({ error: "rate limit exceeded" }, 429, {
      "Retry-After": String(retryAfter(BEACON_LIMIT_ACTION, ip)),
    });
  }

  // 2. Content type before any parse.
  if (!isJsonContentType(req)) {
    return securityError({ error: "unsupported media type" }, 415);
  }

  // 3. Bounded read — a real byte ceiling, enforced while streaming.
  const body = await readBoundedTextBody(req, MAX_BEACON_BODY_BYTES);
  if (body.status === "too_large") return securityError({ error: "payload too large" }, 413);
  if (body.status === "error") return securityError({ error: "invalid body" }, 400);

  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    return securityError({ error: "invalid body" }, 400);
  }
  const beacon = beaconSchema.safeParse(json);
  if (!beacon.success) return securityError({ error: "invalid body" }, 400);

  // 4. Path + query.
  const { slug: rawSlug } = await context.params;
  const slugCheck = slugSchema.safeParse(rawSlug);
  if (!slugCheck.success) return notFound();

  const url = new URL(req.url);
  const rawQuery: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (!ALLOWED_QUERY_KEYS.has(key)) {
      return securityError({ error: "unsupported query parameter" }, 400);
    }
    rawQuery[key] = value;
  }
  const query = querySchema.safeParse(rawQuery);
  if (!query.success) return securityError({ error: "invalid query" }, 400);

  const db = (await getPrisma()) as PrismaLike | null;
  if (!db) return securityError({ error: "media library unavailable" }, 503);

  const organizationId = await resolveOrganizationId(db, query.data.org);
  if (!organizationId) return notFound();

  // 5. Resolve the asset under the DEFAULT (public) audience. A draft, a PRIVATE
  //    asset, an unvalidated one and another tenant's asset are all 404 here, and
  //    nothing is written for any of them.
  const found = await getMediaAssetBySlug({ organizationId, slug: slugCheck.data });
  if (!found.ok) {
    if (found.reason === "STORAGE_UNAVAILABLE") {
      return securityError({ error: "media library unavailable" }, 503);
    }
    return notFound();
  }

  // 6. Identity comes from the caller's OWN cookie, or is null. The body cannot
  //    carry a subject (see `beaconSchema`), so the worst a hostile client can do is
  //    attribute its own view to itself.
  const userId = await getUserIdFromRequest(req);

  const recorded = await recordMediaViewEvent({
    organizationId,
    mediaAssetId: found.value.id,
    userId,
    ipHash: hashClientIp(ip),
    eventType: beacon.data.eventType,
    positionSeconds: beacon.data.positionSeconds ?? null,
    locale: beacon.data.locale ?? null,
  });
  if (!recorded.ok) {
    if (recorded.reason === "NOT_FOUND") return notFound();
    const status = recorded.reason === "STORAGE_UNAVAILABLE" ? 503 : 500;
    return securityError({ error: "beacon not recorded" }, status);
  }

  return NextResponse.json(
    { recorded: true },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
