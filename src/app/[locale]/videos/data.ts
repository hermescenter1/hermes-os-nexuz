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
 * WHY AN ORGANIZATION SLUG IS REQUIRED — AND WHY IT IS A PATH SEGMENT
 * -------------------------------------------------------------------
 * `MediaAsset` is organization-owned (ADR §3) — unlike `Article`, which is
 * deliberately global. It is unique on `(organizationId, slug)` and NEVER on
 * `slug` alone, so the organization is not a filter, it is half of the asset's
 * identity: two tenants may legitimately mint the same slug. Every repository
 * loader takes an `organizationId`, so a public library page has to say *whose*
 * library it is showing.
 *
 * DISCOVERY-2A moved that selector out of `?org=<slug>` and into the path:
 *
 *     /{locale}/videos/{org}            one organization's public library
 *     /{locale}/videos/{org}/{slug}     one public watch page
 *
 * A canonical URL must not depend on a query string — it would otherwise appear
 * inside every `<link rel="canonical">`, every hreflang alternate and every
 * sitemap entry — and `isSubmittablePath()` in `@/lib/seo/indexnow-lifecycle`
 * rejects any path containing `?`. Both paths are minted by the SINGLE pair of
 * helpers in `@/lib/media/seo` that the sitemap already uses, so the route, the
 * internal links, the canonical tag and the sitemap cannot drift apart.
 * `?org=` is preserved as a 308 legacy redirect in `next.config.ts`, and the
 * anonymous JSON API keeps its own `?org=` selector unchanged.
 *
 * The security properties are unchanged by the move: the segment is a selector,
 * never an authorization claim; nothing is returned that is not already
 * published, public and validated; and an unknown organization is answered
 * exactly as an organization with nothing published — an empty library, a 404 on
 * a watch page — so a probe still cannot use these pages to enumerate tenants.
 *
 * POSTERS AND CAPTIONS — WHY THESE URLS ARE REAL NOW
 * --------------------------------------------------
 * This module used to report `posterUrl: null` and `subtitleTracks: []`
 * unconditionally, on the stated grounds that Phase 102 shipped no GET route
 * serving those bytes. That was true when it was written and is no longer:
 * `GET /api/media/assets/[id]/poster` and
 * `GET /api/media/assets/[id]/subtitles/[trackId]` both exist, both run the
 * shared byte-serving chain, and both serve an anonymous caller exactly when the
 * asset is PUBLISHED + PUBLIC + READY — which is the only asset this file can
 * ever see, because every read here uses the default published-only audience.
 * The constant nulls had stopped being an honest absence and become a product
 * defect: the player, the card and the hero all render a poster and a `<track>`
 * when given one, and were being handed nothing.
 *
 * Both URL shapes address the asset by its real id, because that is what the
 * byte routes take. That id is not a new disclosure: the watch page already
 * mints `/api/media/assets/<id>/stream` into its own markup for the same
 * assets, the byte routes re-authorize every request, and an id only ever
 * reaches this file for material that is already published and public. A key
 * whose bytes are NOT public stays unreachable whether or not its id is known.
 *
 * WHAT IS STILL HONESTLY ABSENT
 * -----------------------------
 * Attachments. The column exists; no GET route serves those bytes, so no URL is
 * minted for them (ADR §9) — a fabricated URL is worse than a missing one.
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
  MediaSubtitleTrackView,
} from "@/components/media/view-model";
import { DEFAULT_LOCALE } from "@/i18n/locales";
// DISCOVERY-2A — the ONE place public media paths are minted. Shared with
// `src/app/sitemap.ts`, so an internal link, a canonical tag and a sitemap
// entry for the same asset are the same string by construction.
import { mediaLibraryPath, mediaWatchPath } from "@/lib/media/seo";
import { VIDEO_HUB_PAGE_SIZE } from "@/lib/media/video-library-params";

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
/** One track per platform locale is the design; the cap is the same brake. */
const MAX_SUBTITLE_TRACKS = 8;

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

interface SubtitleTrackRow {
  id: string;
  locale: string;
  label: string | null;
  isDefault: boolean;
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
 * DISCOVERY-2A — the path IS the identity. `MediaAsset` is unique on
 * `(organizationId, slug)`, never on `slug` alone, so the organization is a
 * required component of an asset's address. It now travels as a PATH SEGMENT
 * rather than as `?org=`: a canonical URL must not depend on a query string
 * (it would then appear inside every `<link rel=canonical>`, every hreflang
 * alternate and every sitemap entry), and `isSubmittablePath()` in
 * `@/lib/seo/indexnow-lifecycle` rejects any path containing `?`.
 *
 * `mediaWatchPath` is the ONE minting function — shared with the sitemap and
 * the canonical builder — so the route, the internal link, the canonical tag
 * and the sitemap cannot drift apart. It returns `null` for a slug that could
 * not survive `SLUG_PATTERN`; that can only happen for a row the loaders
 * already refuse, and the callers below treat it as "no link".
 */
function watchHref(locale: string, orgSlug: string, slug: string): string | null {
  const path = mediaWatchPath(orgSlug, slug);
  return path === null ? null : `/${locale}${path}`;
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

/**
 * The same-origin poster URL, or `null` when the asset carries no poster.
 *
 * Presence is decided by the COLUMN, never guessed: an asset with no
 * `posterStorageKey` gets `null` and the components render their own placeholder,
 * exactly as before. The route re-authorizes and re-proves the bytes, so this is
 * an address, not a grant.
 */
function posterSrc(row: MediaAssetRow): string | null {
  if (typeof row.posterStorageKey !== "string" || row.posterStorageKey.length === 0) return null;
  return `/api/media/assets/${encodeURIComponent(row.id)}/poster`;
}

// ── Scope resolution ─────────────────────────────────────────────────────────

export interface VideoHubScope {
  readonly organizationId: string;
  readonly orgSlug: string;
}

/**
 * Resolve an organization slug to an organization id.
 *
 * DISCOVERY-2A: the slug now arrives as the `{org}` PATH SEGMENT instead of
 * `?org=`. The signature is unchanged — it still accepts whatever a Next.js
 * param yields — and so is the security contract: a missing, malformed or
 * unknown slug all return `null`, and every caller then answers the way it
 * would for a real organization with nothing published. That removes the
 * existence oracle: a probe cannot tell "no such organization" from "nothing
 * public here", whether it probes the path or the legacy query string.
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
 *
 * DISCOVERY-2A: returns `null` when the pair could not mint a path, matching
 * `buildMediaSitemapItems` — a row whose slug cannot survive `SLUG_PATTERN` is
 * dropped rather than rendered as a card with a dead or forged link.
 */
function toCardView(
  row: MediaAssetRow,
  translation: TranslationRow | null,
  locale: MediaLocale,
  orgSlug: string,
  routeLocale: string,
  categories: Map<string, CategoryRow>,
  instructors: Map<string, InstructorRow>,
): MediaCardView | null {
  const href = watchHref(routeLocale, orgSlug, row.slug);
  if (href === null) return null;
  return {
    id: row.slug,
    slug: row.slug,
    href,
    title: translation?.title ?? row.slug,
    summary: translation?.summary ?? null,
    posterUrl: posterSrc(row),
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
  return rows
    .map((row) =>
      toCardView(
        row,
        pickTranslation(translations.get(row.id), locale, row.primaryLocale),
        locale,
        orgSlug,
        routeLocale,
        categories,
        instructors,
      ),
    )
    .filter((view): view is MediaCardView => view !== null);
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
  /**
   * DISCOVERY-2A — the locales this asset ACTUALLY has editorial copy in.
   *
   * Derived from the `MediaAssetTranslation` rows plus `primaryLocale`, never
   * from `ACTIVE_LOCALES`. An asset with one English translation must not
   * advertise a Persian and a German alternate that do not exist; the watch
   * page feeds this straight into `buildMetadata({ contentLocales })`.
   *
   * `primaryLocale` leads, so it is the canonical/x-default representation.
   */
  readonly contentLocales: readonly string[];
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

  const [translations, chapters, transcripts, subtitleTracks] = await Promise.all([
    loadTranslations(db, params.scope.organizationId, [asset.id]),
    loadChapters(db, params.scope.organizationId, asset.id, locale),
    loadTranscripts(db, params.scope.organizationId, asset.id),
    loadSubtitleTracks(db, params.scope.organizationId, asset.id),
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

  // DISCOVERY-2A — the canonical address, minted once by the shared helper.
  // `null` joins every other refusal: the caller answers notFound(), so a row
  // whose slug pair cannot mint a URL never reaches a page that would then have
  // to invent a canonical for it.
  const canonicalPath = mediaWatchPath(params.scope.orgSlug, asset.slug);
  const libraryPath = mediaLibraryPath(params.scope.orgSlug);
  if (canonicalPath === null || libraryPath === null) return null;

  // Real editorial locales: primaryLocale first (it is the fallback the reader
  // actually gets), then every OTHER locale that has its own translation row.
  // Nothing here consults ACTIVE_LOCALES.
  const translationLocales = (translations.get(asset.id) ?? []).map((row) => row.locale);
  const contentLocales = [
    asset.primaryLocale,
    ...translationLocales.filter((l) => l !== asset.primaryLocale),
  ].filter((l, i, all) => all.indexOf(l) === i);

  return {
    playback: {
      // The real identifier is needed here and only here: it is what the Range
      // route addresses. It is never rendered into the document.
      id: asset.id,
      slug: asset.slug,
      title: translation?.title ?? asset.slug,
      src: streamSrc(asset),
      contentType: asset.contentType,
      posterUrl: posterSrc(asset),
      durationSeconds: asset.durationSeconds,
      processingState: isMediaProcessingState(asset.processingState)
        ? asset.processingState
        : "READY",
      chapters,
      subtitleTracks,
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
    libraryHref: `/${params.routeLocale}${libraryPath}`,
    canonicalPath,
    contentLocales,
  };
}

/**
 * The caption tracks the player can actually fetch.
 *
 * Every track is addressed by its OWN id through
 * `/api/media/assets/<assetId>/subtitles/<trackId>`, which is the route that
 * exists; `storageKey` is deliberately not selected, so an internal object key
 * cannot reach the document even by accident.
 *
 * Bounded like every other join here: a hostile or broken import cannot turn one
 * anonymous page render into an unbounded read.
 */
async function loadSubtitleTracks(
  db: PrismaLike,
  organizationId: string,
  mediaAssetId: string,
): Promise<MediaSubtitleTrackView[]> {
  try {
    const raw = await db.mediaSubtitleTrack.findMany({
      where: { organizationId, mediaAssetId },
      select: { id: true, locale: true, label: true, isDefault: true },
      orderBy: [{ isDefault: "desc" }, { locale: "asc" }],
      take: MAX_SUBTITLE_TRACKS,
    });
    return ((Array.isArray(raw) ? raw : []) as SubtitleTrackRow[])
      // A row whose locale is outside the platform set would render a `<track
      // srclang>` the browser cannot match. Dropping it is the honest answer.
      .filter((row) => isMediaLocale(row.locale))
      .map((row) => ({
        id: row.id,
        locale: row.locale as MediaLocale,
        label: row.label ?? row.locale,
        src: `/api/media/assets/${encodeURIComponent(mediaAssetId)}/subtitles/${encodeURIComponent(row.id)}`,
        isDefault: row.isDefault === true,
      }));
  } catch {
    return [];
  }
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
