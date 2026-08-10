/**
 * PHASE 102 — Hermes Media & Video Hub: the ANONYMOUS public detail read.
 *
 * Design authority: docs/phase102/architecture.md §3, §8, §11.
 *
 * GET /api/media/public/videos/[slug]?org=<organization-slug>&locale=<fa|en|de>
 *
 * The published-only gate is applied by `getMediaAssetBySlug`'s DEFAULT audience —
 * this file never constructs the editorial opt-out and never writes `status`,
 * `visibility` or `processingState` into a `where` clause of its own (ADR §11).
 *
 * Every "cannot see it" answer is the SAME 404: an unknown organization, an
 * organization with no such asset, an asset belonging to a different tenant, an
 * unpublished draft, a PRIVATE/ORGANIZATION asset and one whose bytes are still
 * being validated are indistinguishable from outside. A 403 here would confirm the
 * existence of a resource the caller may not have, which CLAUDE.md forbids.
 *
 * The response is an explicit whitelist. The asset's database id, its
 * `organizationId`, `siteId`, `categoryId`, `instructorId`, `storageKey`,
 * `posterStorageKey`, `checksumSha256`, `processingState`, `status`, `visibility`,
 * `rejectionReason`, `processingFailureCode`, reviewer identity and every editorial
 * timestamp except `publishedAt` stay server-side. The public handle is the SLUG.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import { getPrisma } from "@/lib/db/prisma";
import { getMediaAssetBySlug, type MediaAssetRow } from "@/lib/media/db";
import { MEDIA_LOCALES } from "@/lib/media/types";
import { resolveClientIp, securityError } from "@/lib/security/request-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * See the sibling library route for why a registered bucket is reused rather than
 * invented: `checkRateLimit` treats an UNKNOWN action as unlimited, so a
 * media-specific key would silently remove the limit instead of adding one.
 */
const PUBLIC_READ_LIMIT_ACTION = "copilot-demo-get";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ALLOWED_QUERY_KEYS = new Set(["org", "locale"]);

const querySchema = z
  .object({
    org: z.string().min(1).max(128).regex(SLUG_PATTERN),
    locale: z.enum(MEDIA_LOCALES).optional(),
  })
  .strict();

const slugSchema = z.string().min(1).max(160).regex(SLUG_PATTERN);

/** How many chapter marks a single response may carry. A hostile or broken import
 *  cannot turn one anonymous read into an unbounded row scan. */
const MAX_CHAPTERS = 200;
/** One track per locale is the schema's unique key; the cap is belt-and-braces. */
const MAX_SUBTITLE_TRACKS = 8;

type PrismaModel = Record<string, (args?: unknown) => Promise<unknown>>;
type PrismaLike = Record<string, PrismaModel>;

interface TranslationRow {
  locale: string;
  title: string;
  summary: string | null;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  keywords: string[] | null;
}

interface ChapterRow {
  locale: string;
  orderIndex: number;
  startSeconds: number;
  endSeconds: number | null;
  title: string;
}

interface SubtitleRow {
  locale: string;
  label: string | null;
  format: string;
  isDefault: boolean;
}

function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function notFound(): NextResponse {
  return securityError({ error: "not found" }, 404);
}

/** Unknown organization ⇒ null ⇒ the same 404 as an unpublished asset. */
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

async function loadTranslations(
  db: PrismaLike,
  organizationId: string,
  mediaAssetId: string,
): Promise<TranslationRow[]> {
  try {
    const raw = await db.mediaAssetTranslation.findMany({
      where: { organizationId, mediaAssetId },
      select: {
        locale: true,
        title: true,
        summary: true,
        description: true,
        seoTitle: true,
        seoDescription: true,
        keywords: true,
      },
      take: MEDIA_LOCALES.length,
    });
    return Array.isArray(raw) ? (raw as TranslationRow[]) : [];
  } catch {
    return [];
  }
}

async function loadChapters(
  db: PrismaLike,
  organizationId: string,
  mediaAssetId: string,
  locale: string,
): Promise<ChapterRow[]> {
  try {
    const raw = await db.mediaChapter.findMany({
      where: { organizationId, mediaAssetId, locale },
      select: {
        locale: true,
        orderIndex: true,
        startSeconds: true,
        endSeconds: true,
        title: true,
      },
      orderBy: { orderIndex: "asc" },
      take: MAX_CHAPTERS,
    });
    return Array.isArray(raw) ? (raw as ChapterRow[]) : [];
  } catch {
    return [];
  }
}

async function loadSubtitleTracks(
  db: PrismaLike,
  organizationId: string,
  mediaAssetId: string,
): Promise<SubtitleRow[]> {
  try {
    const raw = await db.mediaSubtitleTrack.findMany({
      where: { organizationId, mediaAssetId },
      // `storageKey` is deliberately NOT selected. A viewer learns that a track
      // exists and in which language; the object key stays server-side.
      select: { locale: true, label: true, format: true, isDefault: true },
      take: MAX_SUBTITLE_TRACKS,
    });
    return Array.isArray(raw) ? (raw as SubtitleRow[]) : [];
  } catch {
    return [];
  }
}

/** The requested locale, then the asset's own primary locale, then whatever exists. */
function pickTranslation(
  rows: readonly TranslationRow[],
  preferred: string | undefined,
  primaryLocale: string,
): TranslationRow | null {
  return (
    (preferred ? rows.find((r) => r.locale === preferred) : undefined) ??
    rows.find((r) => r.locale === primaryLocale) ??
    rows[0] ??
    null
  );
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const ip = resolveClientIp(req);
  if (!(await checkRateLimit(PUBLIC_READ_LIMIT_ACTION, ip))) {
    return securityError({ error: "rate limit exceeded" }, 429, {
      "Retry-After": String(retryAfter(PUBLIC_READ_LIMIT_ACTION, ip)),
    });
  }

  const { slug: rawSlug } = await context.params;
  const slugCheck = slugSchema.safeParse(rawSlug);
  // A malformed slug cannot match anything, so it answers 404 rather than 400 —
  // the response must not distinguish "badly shaped" from "not yours".
  if (!slugCheck.success) return notFound();

  const url = new URL(req.url);
  const raw: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (!ALLOWED_QUERY_KEYS.has(key)) {
      return securityError({ error: "unsupported query parameter" }, 400);
    }
    raw[key] = value;
  }
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) return securityError({ error: "invalid query" }, 400);

  const db = (await getPrisma()) as PrismaLike | null;
  if (!db) return securityError({ error: "media library unavailable" }, 503);

  const organizationId = await resolveOrganizationId(db, parsed.data.org);
  if (!organizationId) return notFound();

  // The DEFAULT audience. No opt-out is constructed here, ever.
  const found = await getMediaAssetBySlug({ organizationId, slug: slugCheck.data });
  if (!found.ok) {
    if (found.reason === "STORAGE_UNAVAILABLE") {
      return securityError({ error: "media library unavailable" }, 503);
    }
    return notFound();
  }
  const asset: MediaAssetRow = found.value;

  const translations = await loadTranslations(db, organizationId, asset.id);
  const chosen = pickTranslation(translations, parsed.data.locale, asset.primaryLocale);
  const resolvedLocale = chosen?.locale ?? asset.primaryLocale;
  const [chapters, subtitleTracks] = await Promise.all([
    loadChapters(db, organizationId, asset.id, resolvedLocale),
    loadSubtitleTracks(db, organizationId, asset.id),
  ]);

  // Explicit whitelist — field by field, never a spread of the row.
  return NextResponse.json(
    {
      video: {
        slug: asset.slug,
        locale: resolvedLocale,
        primaryLocale: asset.primaryLocale,
        availableLocales: translations.map((t) => t.locale),
        title: chosen?.title ?? null,
        summary: chosen?.summary ?? null,
        description: chosen?.description ?? null,
        seoTitle: chosen?.seoTitle ?? null,
        seoDescription: chosen?.seoDescription ?? null,
        keywords: Array.isArray(chosen?.keywords) ? chosen.keywords : [],
        skillLevel: asset.skillLevel,
        durationSeconds: asset.durationSeconds,
        contentType: asset.contentType,
        hasPoster:
          typeof asset.posterStorageKey === "string" && asset.posterStorageKey.length > 0,
        hasVideo: typeof asset.storageKey === "string" && asset.storageKey.length > 0,
        viewCount: asset.viewCount,
        publishedAt: iso(asset.publishedAt),
        chapters: chapters.map((c) => ({
          orderIndex: c.orderIndex,
          startSeconds: c.startSeconds,
          endSeconds: c.endSeconds,
          title: c.title,
        })),
        subtitleTracks: subtitleTracks.map((s) => ({
          locale: s.locale,
          label: s.label,
          format: s.format,
          isDefault: s.isDefault,
        })),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
