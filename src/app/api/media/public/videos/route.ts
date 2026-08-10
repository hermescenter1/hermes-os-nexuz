/**
 * PHASE 102 — Hermes Media & Video Hub: the ANONYMOUS public library.
 *
 * Design authority: docs/phase102/architecture.md §3, §8, §11.
 *
 * GET /api/media/public/videos?org=<organization-slug>&…
 *
 * Five properties this handler holds, each of which is asserted in
 * `src/app/api/media/public/__tests__`:
 *
 *  1. THE PUBLISHED-ONLY GATE IS NOT HERE. It lives in `src/lib/media/db.ts` and is
 *     applied by default (`PUBLIC_AUDIENCE`). This route never passes the editorial
 *     opt-out and never writes `status` / `visibility` / `processingState` into a
 *     `where` clause of its own. That is ADR §11's deliberate correction of the
 *     `Article` shape, where each caller re-implements the gate and one forgotten
 *     caller leaks a draft. The single exception is the search path, which reuses
 *     `mediaVisibilityWhere()` — the repository's own exported fragment — as a
 *     relation filter rather than restating the rule.
 *  2. THE QUERY SURFACE IS A CLOSED ALLOW-LIST. An unrecognised parameter is a 400,
 *     not something silently ignored, so a client cannot smuggle a Prisma-shaped
 *     key through and cannot discover which filters exist by probing.
 *  3. THE PROJECTION IS AN EXPLICIT WHITELIST. No Prisma row is ever spread. The
 *     asset's database id, `organizationId`, `siteId`, `categoryId`, `instructorId`,
 *     `storageKey`, `posterStorageKey`, `checksumSha256`, `processingState`,
 *     `status`, `visibility`, `rejectionReason`, `processingFailureCode`,
 *     `createdBy` / `updatedBy` and every editorial timestamp stay server-side.
 *     The public handle for an asset is its SLUG; nothing else identifies it.
 *  4. IT IS BOUNDED. Page and page size are clamped by the repository, and the
 *     search path is additionally pinned to one locale so the join can neither
 *     duplicate rows nor produce an inexact total.
 *  5. IT IS RATE LIMITED BY `resolveClientIp` — X-Real-IP only. `X-Forwarded-For`
 *     and `CF-Connecting-IP` are never consulted: nginx appends to XFF but
 *     overwrites X-Real-IP, so keying on XFF is a live, proven bypass.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import { getPrisma } from "@/lib/db/prisma";
import {
  MEDIA_PAGE_SIZE_DEFAULT,
  MEDIA_PAGE_SIZE_MAX,
  PUBLIC_AUDIENCE,
  listMediaAssets,
  mediaVisibilityWhere,
  type MediaAssetRow,
} from "@/lib/media/db";
import { MEDIA_LOCALES, MEDIA_SKILL_LEVELS } from "@/lib/media/types";
import { resolveClientIp, securityError } from "@/lib/security/request-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The anonymous read bucket.
 *
 * `src/lib/auth/rate-limiter.ts` is NOT owned by this slice and its `LIMITS` map is
 * not extensible from here. `checkRateLimit` returns `true` — i.e. UNLIMITED — for
 * an action it does not know, so inventing a `media-public-get` key here would
 * silently produce no limit at all. The closest registered anonymous-read budget is
 * therefore reused deliberately (60 requests / minute, "a cheap public read"). This
 * over-restricts (a visitor browsing the library shares the budget with the public
 * Copilot demo) and can never under-restrict. Registering a dedicated
 * `media-public-*` bucket is a one-line follow-up in the limiter's own slice.
 */
const PUBLIC_READ_LIMIT_ACTION = "copilot-demo-get";

// ── Query surface (rule 2) ───────────────────────────────────────────────────

/**
 * Every parameter this endpoint understands. Anything else is refused.
 *
 * `site` is deliberately absent: filtering the PUBLIC library by an internal
 * industrial site would turn a tenant's site inventory into an anonymous
 * enumeration oracle.
 */
const ALLOWED_QUERY_KEYS = new Set([
  "org",
  "locale",
  "q",
  "category",
  "instructor",
  "level",
  "page",
  "pageSize",
]);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const querySchema = z
  .object({
    /** Organization SLUG — a public namespace selector, never an authorization
     *  claim: nothing is returned that is not already PUBLISHED + PUBLIC + READY. */
    org: z.string().min(1).max(128).regex(SLUG_PATTERN),
    locale: z.enum(MEDIA_LOCALES).optional(),
    q: z.string().min(2).max(100).optional(),
    category: z.string().min(1).max(128).regex(SLUG_PATTERN).optional(),
    instructor: z.string().min(1).max(128).regex(SLUG_PATTERN).optional(),
    level: z.enum(MEDIA_SKILL_LEVELS).optional(),
    page: z.coerce.number().int().min(1).max(400).optional(),
    pageSize: z.coerce.number().int().min(1).max(MEDIA_PAGE_SIZE_MAX).optional(),
  })
  .strict()
  // Free-text search joins the per-locale translation table, whose unique key is
  // (mediaAssetId, locale). Pinning one locale is what keeps the join
  // one-row-per-asset, so `skip`/`take` and the total stay exact. Searching every
  // locale at once would need a DISTINCT that Prisma cannot express here without
  // making pagination approximate, and an approximate total on a public endpoint
  // is a lie the UI would repeat.
  .refine((v) => v.q === undefined || v.locale !== undefined, {
    message: "locale_required_for_search",
  });

// ── Row shapes read back (never spread into a response) ──────────────────────

interface TranslationRow {
  mediaAssetId: string;
  locale: string;
  title: string;
  summary: string | null;
}

type PrismaModel = Record<string, (args?: unknown) => Promise<unknown>>;
type PrismaLike = Record<string, PrismaModel>;

function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ── The public projection (rule 3) ───────────────────────────────────────────

/**
 * THE public card shape. Built field by field from named columns — a spread of the
 * Prisma row is what would leak the next column somebody adds to the model.
 */
interface PublicMediaCard {
  slug: string;
  /** The locale the copy below was actually resolved from. */
  locale: string;
  primaryLocale: string;
  /** `null` when this asset has no translation at all — never a fabricated title. */
  title: string | null;
  summary: string | null;
  skillLevel: string | null;
  /** `null` is honest: there is no duration probe in this platform (ADR §9). */
  durationSeconds: number | null;
  /** Whether bytes exist — the KEY itself is never disclosed. */
  hasPoster: boolean;
  hasVideo: boolean;
  viewCount: number;
  publishedAt: string | null;
}

function toPublicCard(row: MediaAssetRow, t: TranslationRow | null): PublicMediaCard {
  return {
    slug: row.slug,
    locale: t?.locale ?? row.primaryLocale,
    primaryLocale: row.primaryLocale,
    title: t?.title ?? null,
    summary: t?.summary ?? null,
    skillLevel: row.skillLevel,
    durationSeconds: row.durationSeconds,
    hasPoster: typeof row.posterStorageKey === "string" && row.posterStorageKey.length > 0,
    hasVideo: typeof row.storageKey === "string" && row.storageKey.length > 0,
    viewCount: row.viewCount,
    publishedAt: iso(row.publishedAt),
  };
}

// ── Lookups ──────────────────────────────────────────────────────────────────

/**
 * Resolve an organization slug to its id.
 *
 * An unknown slug returns `null`, and every caller then answers exactly as it
 * would for a real organization with no public media — an empty page or a 404.
 * That removes the existence oracle: a probe cannot tell "no such organization"
 * from "nothing published".
 */
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

/** Resolve an org-scoped taxonomy slug to its id, or null when it does not exist. */
async function resolveScopedId(
  model: PrismaModel | undefined,
  organizationId: string,
  slug: string,
): Promise<string | null> {
  if (!model) return null;
  try {
    const row = (await model.findFirst({
      where: { organizationId, slug },
      select: { id: true },
    })) as { id?: unknown } | null;
    return row && typeof row.id === "string" ? row.id : null;
  } catch {
    return null;
  }
}

/**
 * Load the editorial copy for a page of assets in ONE query (no N+1), then resolve
 * each asset to its best available translation: the requested locale first, then the
 * asset's own primary locale, then whatever exists. Bounded by the page size, which
 * the repository already clamped to at most {@link MEDIA_PAGE_SIZE_MAX}.
 */
async function loadTranslations(
  db: PrismaLike,
  organizationId: string,
  assets: readonly MediaAssetRow[],
  preferred: string | undefined,
): Promise<Map<string, TranslationRow>> {
  const out = new Map<string, TranslationRow>();
  if (assets.length === 0) return out;
  let rows: TranslationRow[] = [];
  try {
    const raw = await db.mediaAssetTranslation.findMany({
      where: {
        organizationId,
        mediaAssetId: { in: assets.map((a) => a.id) },
      },
      select: { mediaAssetId: true, locale: true, title: true, summary: true },
    });
    rows = Array.isArray(raw) ? (raw as TranslationRow[]) : [];
  } catch {
    return out;
  }
  const byAsset = new Map<string, TranslationRow[]>();
  for (const row of rows) {
    const list = byAsset.get(row.mediaAssetId);
    if (list) list.push(row);
    else byAsset.set(row.mediaAssetId, [row]);
  }
  for (const asset of assets) {
    const candidates = byAsset.get(asset.id) ?? [];
    const chosen =
      (preferred ? candidates.find((c) => c.locale === preferred) : undefined) ??
      candidates.find((c) => c.locale === asset.primaryLocale) ??
      candidates[0];
    if (chosen) out.set(asset.id, chosen);
  }
  return out;
}

// ── Search path ──────────────────────────────────────────────────────────────

/**
 * Free-text search, executed ENTIRELY in the database.
 *
 * The visibility gate is not restated here: `mediaVisibilityWhere(PUBLIC_AUDIENCE)`
 * is the repository's own exported fragment, applied as a relation filter on the
 * joined asset. If ADR §11's rule ever changes, it changes in one file and this
 * path follows automatically.
 */
async function searchPage(
  db: PrismaLike,
  organizationId: string,
  locale: string,
  q: string,
  assetFilters: Record<string, unknown>,
  page: number,
  pageSize: number,
): Promise<{ items: PublicMediaCard[]; total: number } | null> {
  const gate = mediaVisibilityWhere(PUBLIC_AUDIENCE);
  if (!gate.ok) return null;
  const where = {
    organizationId,
    locale,
    OR: [
      { title: { contains: q, mode: "insensitive" } },
      { summary: { contains: q, mode: "insensitive" } },
    ],
    mediaAsset: { organizationId, ...gate.value, ...assetFilters },
  };
  try {
    const [raw, total] = await Promise.all([
      db.mediaAssetTranslation.findMany({
        where,
        include: { mediaAsset: true },
        orderBy: { title: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.mediaAssetTranslation.count({ where }),
    ]);
    const rows = (Array.isArray(raw) ? raw : []) as Array<
      TranslationRow & { mediaAsset?: MediaAssetRow }
    >;
    const items: PublicMediaCard[] = [];
    for (const row of rows) {
      if (!row.mediaAsset) continue;
      items.push(toPublicCard(row.mediaAsset, row));
    }
    return { items, total: typeof total === "number" ? total : items.length };
  } catch {
    return null;
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

function emptyPage(page: number, pageSize: number): NextResponse {
  return NextResponse.json(
    { items: [], page, pageSize, total: 0, hasMore: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // 1. Rate limit FIRST — before any database work — keyed on the only header the
  //    reverse proxy controls.
  const ip = resolveClientIp(req);
  if (!(await checkRateLimit(PUBLIC_READ_LIMIT_ACTION, ip))) {
    return securityError({ error: "rate limit exceeded" }, 429, {
      "Retry-After": String(retryAfter(PUBLIC_READ_LIMIT_ACTION, ip)),
    });
  }

  // 2. Closed allow-list. An unknown key is refused without echoing it back.
  const url = new URL(req.url);
  const raw: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (!ALLOWED_QUERY_KEYS.has(key)) {
      return securityError({ error: "unsupported query parameter" }, 400);
    }
    raw[key] = value;
  }

  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return securityError({ error: "invalid query" }, 400);
  }
  const { org, locale, q, category, instructor, level } = parsed.data;
  const page = parsed.data.page ?? 1;
  const pageSize = parsed.data.pageSize ?? MEDIA_PAGE_SIZE_DEFAULT;

  const db = (await getPrisma()) as PrismaLike | null;
  if (!db) {
    return securityError({ error: "media library unavailable" }, 503);
  }

  // 3. Scope. An unresolvable organization is indistinguishable from one with
  //    nothing published.
  const organizationId = await resolveOrganizationId(db, org);
  if (!organizationId) return emptyPage(page, pageSize);

  // 4. Taxonomy filters are resolved from public slugs to internal ids server-side,
  //    so no internal id is ever accepted from — or returned to — a client.
  const assetFilters: Record<string, unknown> = {};
  if (category) {
    const categoryId = await resolveScopedId(db.mediaCategory, organizationId, category);
    if (!categoryId) return emptyPage(page, pageSize);
    assetFilters.categoryId = categoryId;
  }
  if (instructor) {
    const instructorId = await resolveScopedId(db.mediaInstructor, organizationId, instructor);
    if (!instructorId) return emptyPage(page, pageSize);
    assetFilters.instructorId = instructorId;
  }
  if (level) assetFilters.skillLevel = level;

  // 5a. Search.
  if (q !== undefined && locale !== undefined) {
    const found = await searchPage(db, organizationId, locale, q, assetFilters, page, pageSize);
    if (!found) return securityError({ error: "media library unavailable" }, 503);
    return NextResponse.json(
      {
        items: found.items,
        page,
        pageSize,
        total: found.total,
        hasMore: (page - 1) * pageSize + found.items.length < found.total,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // 5b. Browse. `audience` is left at its default, so the repository applies the
  //     PUBLISHED + PUBLIC + READY gate. The editorial opt-out is never constructed
  //     in this file.
  const listed = await listMediaAssets({
    organizationId,
    filters: {
      categoryId: assetFilters.categoryId as string | undefined,
      instructorId: assetFilters.instructorId as string | undefined,
      skillLevel: assetFilters.skillLevel as string | undefined,
    },
    page,
    pageSize,
  });
  if (!listed.ok) {
    // Every repository failure collapses to one of two answers. Nothing about the
    // underlying cause (Prisma error, missing tenant, permission shape) is exposed.
    const status = listed.reason === "STORAGE_UNAVAILABLE" ? 503 : 500;
    return securityError({ error: "media library unavailable" }, status);
  }

  const assets = listed.value.items;
  const translations = await loadTranslations(db, organizationId, assets, locale);

  return NextResponse.json(
    {
      items: assets.map((a) => toPublicCard(a, translations.get(a.id) ?? null)),
      page: listed.value.page,
      pageSize: listed.value.pageSize,
      total: listed.value.total,
      hasMore: listed.value.hasMore,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
