/**
 * PHASE 102 — server-side loading for the PUBLIC Video Hub pages.
 *
 * Design authority: docs/phase102/architecture.md §3, §4, §8, §9, §11.
 *
 * WHY THE PUBLISHED-ONLY GATE IS NOT IN THIS FILE
 * ----------------------------------------------
 * It is in `src/lib/media/db.ts`, and it is the DEFAULT. Nothing here passes an
 * `audience`, so `getMediaAssetBySlug` and `listMediaAssets` apply
 * `PUBLISHED + PUBLIC + READY` inside the Prisma `where` clause and an unpublished
 * row is never materialised. This is ADR §11's deliberate correction of the
 * `Article` shape, where `getArticleDetailBySlug` has no status filter and every
 * caller re-implements the gate — one forgotten caller away from serving a draft.
 * The rule for this module is therefore absolute: no `status`, `visibility` or
 * `processingState` key may ever be written into a `where` clause here, and the
 * typed editorial opt-out is never constructed.
 *
 * WHY AN ORGANIZATION SLUG IS REQUIRED
 * ------------------------------------
 * `MediaAsset` is organization-owned (ADR §3) — unlike `Article`, which is
 * deliberately global. Every repository loader takes an `organizationId`, so a
 * public library page has to say *whose* library it is showing. `?org=<slug>` is
 * the same public namespace selector the anonymous API uses
 * (`src/app/api/media/public/videos/route.ts`), and it is a selector, never an
 * authorization claim: nothing is returned that is not already published, public
 * and validated. An unknown slug is answered exactly as an organization with
 * nothing published — an empty library, a 404 on a watch page — so a probe cannot
 * use these pages to enumerate tenants.
 *
 * WHAT IS HONESTLY ABSENT
 * -----------------------
 * Poster images, subtitle tracks and attachments all exist as columns, but Phase
 * 102 ships no GET route that serves those bytes (only the video stream route
 * answers Range requests). Rather than mint URLs that would 404, this module
 * reports `posterUrl: null`, `subtitleTracks: []` and no attachments — the
 * components are built to render that absence honestly (ADR §9), and a fabricated
 * URL would be worse than a missing one.
 */

import { getPrisma } from "@/lib/db/prisma";
import {
  getMediaAssetBySlug,
  listMediaAssets,
  type MediaAssetRow,
} from "@/lib/media/db";
import {
  isMediaLifecycleStatus,
  isMediaLocale,
  isMediaProcessingState,
  isMediaSkillLevel,
  type MediaLocale,
} from "@/lib/media/types";
import type {
  MediaCardView,
  MediaCategoryView,
  MediaChapterView,
  MediaInstructorView,
  MediaPlaybackView,
} from "@/components/media/view-model";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import {
  VIDEO_HUB_ORG_PARAM,
  VIDEO_HUB_PAGE_SIZE,
} from "@/lib/media/video-library-params";

// ── Public contract of the route ─────────────────────────────────────────────
//
// The URL parameter names now live in `@/lib/media/video-library-params`, a
// dependency-free module. They are NOT re-exported from here on purpose: this
// file reaches Prisma, so a client component that imported them from here would
// pull `pg` (and `node:tls`) into the browser bundle — the exact failure this
// split fixes. Client code must import them from the pure module.

/** How many "more like this" cards the watch page asks for. */
const RELATED_LIMIT = 3;
/** A hostile or broken import cannot turn one anonymous read into a table scan. */
const MAX_CHAPTERS = 200;

/** The same shape the anonymous API accepts — lowercase, hyphen separated. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ── Narrow local view of the Prisma client ───────────────────────────────────

type PrismaModel = Record<string, (args?: unknown) => Promise<unknown>>;
type PrismaLike = Record<string, PrismaModel>;

async function prisma(): Promise<PrismaLike | null> {
  return (await getPrisma()) as PrismaLike | null;
}

// ── Row shapes read back (never spread into a view) ──────────────────────────

interface TranslationRow {
  mediaAssetId: string;
  locale: string;
  title: string;
  summary: string | null;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

interface CategoryRow {
  id: string;
  slug: string;
  nameFa: string;
  nameEn: string;
  nameDe: string;
}

interface InstructorRow {
  id: string;
  slug: string;
  displayName: string;
  headline: string | null;
}

interface ChapterRow {
  id: string;
  orderIndex: number;
  startSeconds: number;
  title: string;
}

interface TranscriptRow {
  locale: string;
  body: string;
}

// ── Small helpers ────────────────────────────────────────────────────────────

/** A route/search param, normalised to a single trimmed string or `null`. */
export function readParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** A param that must look like a public slug, or `null`. Never a Prisma key. */
export function readSlugParam(value: string | string[] | undefined): string | null {
  const raw = readParam(value);
  if (raw === null || raw.length > 160 || !SLUG_PATTERN.test(raw)) return null;
  return raw;
}

/** 1-based page number, clamped. A hostile `page` cannot ask for a deep scan. */
export function readPageParam(value: string | string[] | undefined): number {
  const raw = readParam(value);
  const parsed = raw === null ? NaN : Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 400);
}

/** The route locale, narrowed to the media storage vocabulary. */
export function mediaLocaleOf(locale: string): MediaLocale {
  return isMediaLocale(locale) ? locale : (DEFAULT_LOCALE as MediaLocale);
}

function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function categoryName(row: CategoryRow, locale: MediaLocale): string {
  if (locale === "fa") return row.nameFa;
  if (locale === "de") return row.nameDe;
  return row.nameEn;
}

/**
 * The locale-prefixed watch route for one asset.
 *
 * The organization selector is carried forward so a link out of the library
 * lands on the same namespace it came from. Both components are already
 * slug-shaped (validated above), so this cannot smuggle a query separator.
 */
function watchHref(locale: string, orgSlug: string, slug: string): string {
  return `/${locale}/videos/${encodeURIComponent(slug)}?${VIDEO_HUB_ORG_PARAM}=${encodeURIComponent(orgSlug)}`;
}

/**
 * The byte-serving URL for one asset, or `null` when nothing is servable.
 *
 * `/api/media/assets/[id]/stream` is the only route in the platform that answers
 * `Range:` with `206 Partial Content`, which is what makes the scrub bar work
 * (ADR §4). It re-applies the full public gate itself and refuses anything that
 * is not `PUBLISHED + PUBLIC + READY`, so the identifier in this URL grants
 * nothing the library page did not already show. `null` is a first-class answer:
 * an asset with no stored object has no source and the player says so.
 */
function streamSrc(row: MediaAssetRow): string | null {
  if (typeof row.storageKey !== "string" || row.storageKey.length === 0) return null;
  return `/api/media/assets/${encodeURIComponent(row.id)}/stream`;
}

// ── Scope resolution ─────────────────────────────────────────────────────────

export interface VideoHubScope {
  readonly organizationId: string;
  readonly orgSlug: string;
}

/**
 * Resolve `?org=<slug>` to an organization id.
 *
 * A missing, malformed or unknown slug all return `null`, and every caller then
 * answers the way it would for a real organization with nothing published. That
 * removes the existence oracle: a probe cannot tell "no such organization" from
 * "nothing public here".
 */
export async function resolveVideoHubScope(
  value: string | string[] | undefined,
): Promise<VideoHubScope | null> {
  const orgSlug = readSlugParam(value);
  if (orgSlug === null) return null;
  const db = await prisma();
  if (!db) return null;
  try {
    const row = (await db.organization.findFirst({
      where: { slug: orgSlug },
      select: { id: true },
    })) as { id?: unknown } | null;
    if (!row || typeof row.id !== "string") return null;
    return { organizationId: row.id, orgSlug };
  } catch {
    return null;
  }
}

// ── Batched joins (no N+1) ───────────────────────────────────────────────────

async function loadTranslations(
  db: PrismaLike,
  organizationId: string,
  assetIds: readonly string[],
): Promise<Map<string, TranslationRow[]>> {
  const out = new Map<string, TranslationRow[]>();
  if (assetIds.length === 0) return out;
  let rows: TranslationRow[] = [];
  try {
    const raw = await db.mediaAssetTranslation.findMany({
      where: { organizationId, mediaAssetId: { in: [...assetIds] } },
      select: {
        mediaAssetId: true,
        locale: true,
        title: true,
        summary: true,
        description: true,
        seoTitle: true,
        seoDescription: true,
      },
    });
    rows = Array.isArray(raw) ? (raw as TranslationRow[]) : [];
  } catch {
    return out;
  }
  for (const row of rows) {
    const list = out.get(row.mediaAssetId);
    if (list) list.push(row);
    else out.set(row.mediaAssetId, [row]);
  }
  return out;
}

/** Requested locale first, then the asset's own primary locale, then whatever exists. */
function pickTranslation(
  rows: readonly TranslationRow[] | undefined,
  preferred: MediaLocale,
  primaryLocale: string,
): TranslationRow | null {
  if (!rows || rows.length === 0) return null;
  return (
    rows.find((r) => r.locale === preferred) ??
    rows.find((r) => r.locale === primaryLocale) ??
    rows[0] ??
    null
  );
}

async function loadCategories(
  db: PrismaLike,
  organizationId: string,
  ids: readonly string[],
): Promise<Map<string, CategoryRow>> {
  const out = new Map<string, CategoryRow>();
  if (ids.length === 0) return out;
  try {
    const raw = await db.mediaCategory.findMany({
      where: { organizationId, id: { in: [...ids] } },
      select: { id: true, slug: true, nameFa: true, nameEn: true, nameDe: true },
    });
    for (const row of (Array.isArray(raw) ? raw : []) as CategoryRow[]) out.set(row.id, row);
  } catch {
    return out;
  }
  return out;
}

async function loadInstructors(
  db: PrismaLike,
  organizationId: string,
  ids: readonly string[],
): Promise<Map<string, InstructorRow>> {
  const out = new Map<string, InstructorRow>();
  if (ids.length === 0) return out;
  try {
    const raw = await db.mediaInstructor.findMany({
      where: { organizationId, id: { in: [...ids] } },
      select: { id: true, slug: true, displayName: true, headline: true },
    });
    for (const row of (Array.isArray(raw) ? raw : []) as InstructorRow[]) out.set(row.id, row);
  } catch {
    return out;
  }
  return out;
}

// ── Projections ──────────────────────────────────────────────────────────────

function toCategoryView(row: CategoryRow | undefined, locale: MediaLocale): MediaCategoryView | null {
  if (!row) return null;
  return { id: row.slug, slug: row.slug, name: categoryName(row, locale), count: null };
}

function toInstructorView(row: InstructorRow | undefined): MediaInstructorView | null {
  if (!row) return null;
  return {
    id: row.slug,
    name: row.displayName,
    headline: row.headline,
    // No avatar-serving route exists, and no instructor profile page is part of
    // this phase — both are null rather than a placeholder face or a dead link.
    avatarUrl: null,
    href: null,
    videoCount: null,
  };
}

/**
 * The card projection.
 *
 * `id` is the SLUG, not the database id: the slug is the public handle for an
 * asset everywhere else in Phase 102 (`src/app/api/media/public/videos/route.ts`),
 * and `VideoHero` renders this value into a DOM `id` attribute. `progress` and
 * `saved` are null because these pages are anonymous — private viewing history is
 * never inferred, only ever read back for the authenticated subject (ADR §8).
 */
function toCardView(
  row: MediaAssetRow,
  translation: TranslationRow | null,
  locale: MediaLocale,
  orgSlug: string,
  routeLocale: string,
  categories: Map<string, CategoryRow>,
  instructors: Map<string, InstructorRow>,
): MediaCardView {
  return {
    id: row.slug,
    slug: row.slug,
    href: watchHref(routeLocale, orgSlug, row.slug),
    title: translation?.title ?? row.slug,
    summary: translation?.summary ?? null,
    posterUrl: null,
    durationSeconds: row.durationSeconds,
    skillLevel: isMediaSkillLevel(row.skillLevel) ? row.skillLevel : null,
    status: isMediaLifecycleStatus(row.status) ? row.status : "PUBLISHED",
    processingState: isMediaProcessingState(row.processingState) ? row.processingState : "READY",
    instructor: toInstructorView(row.instructorId ? instructors.get(row.instructorId) : undefined),
    category: toCategoryView(row.categoryId ? categories.get(row.categoryId) : undefined, locale),
    viewCount: row.viewCount,
    progress: null,
    saved: null,
  };
}

async function toCardViews(
  db: PrismaLike,
  organizationId: string,
  rows: readonly MediaAssetRow[],
  locale: MediaLocale,
  orgSlug: string,
  routeLocale: string,
): Promise<MediaCardView[]> {
  if (rows.length === 0) return [];
  const [translations, categories, instructors] = await Promise.all([
    loadTranslations(db, organizationId, rows.map((r) => r.id)),
    loadCategories(
      db,
      organizationId,
      rows.map((r) => r.categoryId).filter((v): v is string => typeof v === "string"),
    ),
    loadInstructors(
      db,
      organizationId,
      rows.map((r) => r.instructorId).filter((v): v is string => typeof v === "string"),
    ),
  ]);
  return rows.map((row) =>
    toCardView(
      row,
      pickTranslation(translations.get(row.id), locale, row.primaryLocale),
      locale,
      orgSlug,
      routeLocale,
      categories,
      instructors,
    ),
  );
}

// ── Library ──────────────────────────────────────────────────────────────────

export interface VideoLibraryView {
  readonly items: readonly MediaCardView[];
  readonly categories: readonly MediaCategoryView[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly hasMore: boolean;
  /** True when a category or level narrowed the query — drives the empty reason. */
  readonly filtered: boolean;
}

export interface VideoLibraryQuery {
  readonly scope: VideoHubScope;
  /** The route locale (`fa` | `en` | `de`), used for hrefs and copy resolution. */
  readonly routeLocale: string;
  readonly page?: number;
  /** A public category SLUG. An unknown slug yields an empty, filtered page. */
  readonly categorySlug?: string | null;
  readonly level?: string | null;
}

/** An empty library page, used for "no such category" and for storage failures. */
function emptyLibrary(page: number, filtered: boolean): VideoLibraryView {
  return { items: [], categories: [], page, pageSize: VIDEO_HUB_PAGE_SIZE, total: 0, hasMore: false, filtered };
}

/**
 * One bounded, tenant-scoped, published-only page of the library.
 *
 * `audience` is deliberately absent from the `listMediaAssets` call: the
 * repository default is the gate. Returns `null` ONLY when media storage itself
 * is unavailable, which the page renders as an error state rather than as an
 * empty library — "nothing published" and "we could not ask" are different
 * answers and must not look the same.
 */
export async function loadVideoLibrary(query: VideoLibraryQuery): Promise<VideoLibraryView | null> {
  const locale = mediaLocaleOf(query.routeLocale);
  const page = query.page ?? 1;
  const level = query.level && isMediaSkillLevel(query.level) ? query.level : undefined;
  const filtered = Boolean(query.categorySlug) || Boolean(level);

  const db = await prisma();
  if (!db) return null;

  // Public category slugs are resolved to internal ids server-side, so no internal
  // id is ever accepted from — or handed to — a visitor.
  let categoryId: string | undefined;
  if (query.categorySlug) {
    try {
      const row = (await db.mediaCategory.findFirst({
        where: { organizationId: query.scope.organizationId, slug: query.categorySlug },
        select: { id: true },
      })) as { id?: unknown } | null;
      if (!row || typeof row.id !== "string") return emptyLibrary(page, true);
      categoryId = row.id;
    } catch {
      return null;
    }
  }

  const listed = await listMediaAssets({
    organizationId: query.scope.organizationId,
    filters: { categoryId, skillLevel: level },
    page,
    pageSize: VIDEO_HUB_PAGE_SIZE,
  });
  if (!listed.ok) {
    // "Nothing to show" is never inferred from a failure. Only a genuine empty
    // result set produces an empty library.
    return null;
  }

  const items = await toCardViews(
    db,
    query.scope.organizationId,
    listed.value.items,
    locale,
    query.scope.orgSlug,
    query.routeLocale,
  );

  return {
    items,
    categories: await loadLibraryCategories(db, query.scope.organizationId, locale),
    page: listed.value.page,
    pageSize: listed.value.pageSize,
    total: listed.value.total,
    hasMore: listed.value.hasMore,
    filtered,
  };
}

/** The org's active category taxonomy, for the filter chips. Bounded. */
async function loadLibraryCategories(
  db: PrismaLike,
  organizationId: string,
  locale: MediaLocale,
): Promise<MediaCategoryView[]> {
  try {
    const raw = await db.mediaCategory.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, slug: true, nameFa: true, nameEn: true, nameDe: true },
      orderBy: { orderIndex: "asc" },
      take: 40,
    });
    return ((Array.isArray(raw) ? raw : []) as CategoryRow[])
      .map((row) => toCategoryView(row, locale))
      .filter((v): v is MediaCategoryView => v !== null);
  } catch {
    return [];
  }
}

// ── Watch ────────────────────────────────────────────────────────────────────

export interface VideoWatchView {
  /** Everything the player needs. `src === null` means nothing is servable. */
  readonly playback: MediaPlaybackView;
  readonly title: string;
  readonly summary: string | null;
  readonly description: string | null;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  /** The locale the copy above was actually resolved from. */
  readonly resolvedLocale: string;
  readonly publishedAt: string | null;
  readonly viewCount: number;
  readonly skillLevel: MediaCardView["skillLevel"];
  readonly category: MediaCategoryView | null;
  readonly instructor: MediaInstructorView | null;
  /** Plain transcript text in the resolved locale, or null. Not cue-timed. */
  readonly transcript: string | null;
  readonly related: readonly MediaCardView[];
  readonly libraryHref: string;
  readonly canonicalPath: string;
}

/**
 * Load one published, public, validated asset by slug — or `null`.
 *
 * `null` covers every "you cannot see this" case identically: an unknown slug, a
 * draft, a PRIVATE or ORGANIZATION-visibility asset, another tenant's asset, one
 * whose bytes are still being validated or are quarantined, and a storage
 * failure. The caller answers all of them with `notFound()`. Distinguishing them
 * would confirm the existence of a resource the visitor may not have.
 */
export async function loadVideoWatch(params: {
  scope: VideoHubScope;
  slug: string;
  routeLocale: string;
}): Promise<VideoWatchView | null> {
  const locale = mediaLocaleOf(params.routeLocale);
  const slug = readSlugParam(params.slug);
  if (slug === null) return null;

  // The DEFAULT audience. The editorial opt-out is never constructed in this file.
  const found = await getMediaAssetBySlug({
    organizationId: params.scope.organizationId,
    slug,
  });
  if (!found.ok) return null;
  const asset = found.value;

  const db = await prisma();
  if (!db) return null;

  const [translations, chapters, transcripts] = await Promise.all([
    loadTranslations(db, params.scope.organizationId, [asset.id]),
    loadChapters(db, params.scope.organizationId, asset.id, locale),
    loadTranscripts(db, params.scope.organizationId, asset.id),
  ]);

  const translation = pickTranslation(translations.get(asset.id), locale, asset.primaryLocale);
  const resolvedLocale = translation?.locale ?? asset.primaryLocale;

  const [categories, instructors] = await Promise.all([
    loadCategories(db, params.scope.organizationId, asset.categoryId ? [asset.categoryId] : []),
    loadInstructors(db, params.scope.organizationId, asset.instructorId ? [asset.instructorId] : []),
  ]);

  const transcript =
    transcripts.find((t) => t.locale === resolvedLocale)?.body ??
    transcripts.find((t) => t.locale === asset.primaryLocale)?.body ??
    null;

  return {
    playback: {
      // The real identifier is needed here and only here: it is what the Range
      // route addresses. It is never rendered into the document.
      id: asset.id,
      slug: asset.slug,
      title: translation?.title ?? asset.slug,
      src: streamSrc(asset),
      contentType: asset.contentType,
      posterUrl: null,
      durationSeconds: asset.durationSeconds,
      processingState: isMediaProcessingState(asset.processingState)
        ? asset.processingState
        : "READY",
      chapters,
      // No GET route serves a `.vtt` in this phase, so there is no same-origin
      // caption URL to hand the player. An empty list is the honest answer.
      subtitleTracks: [],
      // Anonymous surface: there is no viewer whose progress could be read, and
      // one is never invented.
      progress: null,
    },
    title: translation?.title ?? asset.slug,
    summary: translation?.summary ?? null,
    description: translation?.description ?? null,
    seoTitle: translation?.seoTitle ?? null,
    seoDescription: translation?.seoDescription ?? null,
    resolvedLocale,
    publishedAt: iso(asset.publishedAt),
    viewCount: asset.viewCount,
    skillLevel: isMediaSkillLevel(asset.skillLevel) ? asset.skillLevel : null,
    category: toCategoryView(asset.categoryId ? categories.get(asset.categoryId) : undefined, locale),
    instructor: toInstructorView(asset.instructorId ? instructors.get(asset.instructorId) : undefined),
    transcript,
    related: await loadRelated(db, params, asset, locale),
    libraryHref: `/${params.routeLocale}/videos?${VIDEO_HUB_ORG_PARAM}=${encodeURIComponent(params.scope.orgSlug)}`,
    canonicalPath: `/videos/${asset.slug}`,
  };
}

async function loadChapters(
  db: PrismaLike,
  organizationId: string,
  mediaAssetId: string,
  locale: MediaLocale,
): Promise<MediaChapterView[]> {
  try {
    const raw = await db.mediaChapter.findMany({
      where: { organizationId, mediaAssetId, locale },
      select: { id: true, orderIndex: true, startSeconds: true, title: true },
      orderBy: { orderIndex: "asc" },
      take: MAX_CHAPTERS,
    });
    return ((Array.isArray(raw) ? raw : []) as ChapterRow[]).map((row) => ({
      id: row.id,
      title: row.title,
      startSeconds: row.startSeconds,
    }));
  } catch {
    return [];
  }
}

async function loadTranscripts(
  db: PrismaLike,
  organizationId: string,
  mediaAssetId: string,
): Promise<TranscriptRow[]> {
  try {
    const raw = await db.mediaTranscript.findMany({
      where: { organizationId, mediaAssetId },
      select: { locale: true, body: true },
      take: 3,
    });
    return (Array.isArray(raw) ? raw : []) as TranscriptRow[];
  } catch {
    return [];
  }
}

/**
 * "More like this" — same category, same tenant, same published-only gate.
 *
 * Relatedness is computed server-side because it is a database query under the
 * repository's own visibility rule; a client-side similarity score would need the
 * whole library in the browser, which is both a leak and a payload.
 */
async function loadRelated(
  db: PrismaLike,
  params: { scope: VideoHubScope; routeLocale: string },
  asset: MediaAssetRow,
  locale: MediaLocale,
): Promise<MediaCardView[]> {
  if (!asset.categoryId) return [];
  const listed = await listMediaAssets({
    organizationId: params.scope.organizationId,
    filters: { categoryId: asset.categoryId },
    page: 1,
    pageSize: RELATED_LIMIT + 1,
  });
  if (!listed.ok) return [];
  const siblings = listed.value.items.filter((row) => row.id !== asset.id).slice(0, RELATED_LIMIT);
  return toCardViews(
    db,
    params.scope.organizationId,
    siblings,
    locale,
    params.scope.orgSlug,
    params.routeLocale,
  );
}
