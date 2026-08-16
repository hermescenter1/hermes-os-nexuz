/**
 * PHASE 102 — Hermes Media & Video Hub: the public SEO surface.
 *
 * Design authority: docs/phase102/architecture.md, especially §4 (self-hosted
 * playback, no external embed), §9 (what this phase deliberately does NOT build)
 * and §11 (published-only visibility is enforced in the repository, not the caller).
 *
 * THIS MODULE EXTENDS THE EXISTING SEO LAYER — IT DOES NOT REPLACE IT.
 *   - the domain comes from `@/lib/seo/config` (`BASE_URL`), never a literal;
 *   - canonical / hreflang / OpenGraph / Twitter / robots come from
 *     `buildMetadata` and `noIndexMetadata` in `@/lib/seo/metadata`;
 *   - `inLanguage` comes from `schemaLanguageTag` in `@/lib/seo/schemas`, the one
 *     locale→BCP-47 table the whole site already uses;
 *   - the locale list comes from `ACTIVE_LOCALES` via `@/lib/seo/config`, so
 *     hreflang cannot drift from routing;
 *   - the JSON-LD blob is rendered by the existing `<JsonLd />` server component.
 *
 * TWO RULES GOVERN EVERY FUNCTION HERE.
 *
 * 1. NOTHING UNPUBLISHED IS EVER DESCRIBED TO A CRAWLER. `isMediaIndexable` is the
 *    single gate, and it delegates the lifecycle half to `isPubliclyReadable` in
 *    `./types` rather than restating `status`/`visibility`/`processingState`.
 *    A non-indexable asset yields `null` JSON-LD, `noindex, nofollow` metadata with
 *    NO canonical and NO hreflang, and no sitemap entry at all. This is the
 *    deliberate opposite of the Academy course surface, which lists every course row
 *    in the sitemap with no status or soft-delete predicate and then renders it with
 *    indexable canonical metadata (ADR §9, spun out separately).
 *
 * 2. A PROPERTY THE PLATFORM CANNOT BACK IS OMITTED, NEVER GUESSED AND NEVER "".
 *    There is no transcoder, no duration probe, no poster-frame extractor and no
 *    embed surface (ADR §9), so this module never emits `embedUrl`, never describes
 *    renditions, bitrates or dimensions, and drops `thumbnailUrl`, `duration`,
 *    `uploadDate`, `contentUrl`, `encodingFormat`, `description`, `keywords`,
 *    `educationalLevel`, `publisher` and `interactionStatistic` whenever the
 *    backing column is absent. An empty string in structured data is a claim that
 *    the value exists and is empty; omission is the honest statement that it is
 *    unknown.
 *
 * `dateModified` is ALSO deliberately absent. `MediaAsset.updatedAt` is `@updatedAt`
 * and the view counter is incremented with an `update`, so it moves on every single
 * play. Publishing it as "when this video was last modified" would be false.
 */

import type { Metadata } from "next";
import type { MetadataRoute } from "next";
import { getPrisma } from "@/lib/db/prisma";
import { DEFAULT_LOCALE, LOCALES, BASE_URL } from "@/lib/seo/config";
import { buildMetadata, noIndexMetadata } from "@/lib/seo/metadata";
import { schemaLanguageTag } from "@/lib/seo/schemas";
import { isActiveLocale } from "@/i18n/locales";
import { PUBLIC_AUDIENCE, mediaVisibilityWhere } from "./db";
import { isMediaSkillLevel, isPubliclyReadable } from "./types";

/* ── Public URL space ─────────────────────────────────────────────────────── */

/**
 * The public media hub lives under `/{locale}/videos`.
 *
 * `MediaAsset.slug` is unique per `(organizationId, slug)` — NOT globally — so the
 * owning organization's slug is a required path segment. Without it two tenants
 * could mint the same public URL and one would silently shadow the other.
 */
export const MEDIA_PUBLIC_PATH_PREFIX = "/videos";

/**
 * The slug shape the public API already enforces
 * (`src/app/api/media/public/videos/route.ts`). Restated as a mint-time guard: a
 * value that does not match can never be turned into a path here, so a malformed
 * or hostile slug cannot inject an extra segment, a query string or a fragment
 * into a canonical URL or a sitemap entry.
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const MAX_SLUG_LENGTH = 160;

function safeSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > MAX_SLUG_LENGTH) return null;
  return SLUG_PATTERN.test(value) ? value : null;
}

/** `/videos/{org}` — one organization's public library, or null if unmintable. */
export function mediaLibraryPath(organizationSlug: string): string | null {
  const org = safeSlug(organizationSlug);
  return org ? `${MEDIA_PUBLIC_PATH_PREFIX}/${org}` : null;
}

/** `/videos/{org}/{slug}` — one public watch page, or null if unmintable. */
export function mediaWatchPath(organizationSlug: string, slug: string): string | null {
  const org = safeSlug(organizationSlug);
  const asset = safeSlug(slug);
  return org && asset ? `${MEDIA_PUBLIC_PATH_PREFIX}/${org}/${asset}` : null;
}

/** Absolute canonical watch URL for one locale, or null if unmintable. */
export function mediaWatchUrl(
  locale: string,
  organizationSlug: string,
  slug: string,
): string | null {
  const path = mediaWatchPath(organizationSlug, slug);
  if (!path) return null;
  return `${BASE_URL}/${resolveLocale(locale)}${path}`;
}

/* ── Small honest-value helpers ───────────────────────────────────────────── */

function resolveLocale(locale: string): string {
  return isActiveLocale(locale) ? locale : DEFAULT_LOCALE;
}

/** A trimmed non-empty string, or null. Never "". */
function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** The first genuinely present candidate, or null when every one is absent. */
function firstText(...candidates: readonly unknown[]): string | null {
  for (const candidate of candidates) {
    const resolved = text(candidate);
    if (resolved !== null) return resolved;
  }
  return null;
}

/**
 * An absolute URL on THIS deployment's origin, or null.
 *
 * Poster images and video bytes are served by this application (ADR §4 — there is
 * no CDN, no object-storage public bucket and no external embed), so a URL that is
 * not same-origin cannot be one of ours. Refusing it stops a tenant-supplied value
 * from pointing structured data — or a canonical link — at somebody else's host.
 */
function sameOriginUrl(value: unknown): string | null {
  const raw = text(value);
  if (raw === null) return null;
  let parsed: URL;
  let base: URL;
  try {
    parsed = new URL(raw);
    base = new URL(BASE_URL);
  } catch {
    return null;
  }
  if (parsed.protocol !== base.protocol || parsed.host !== base.host) return null;
  return parsed.toString();
}

/** A concrete instant as an ISO 8601 string, or null for absent/unparsable input. */
function isoInstant(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** `video/mp4`-shaped values only; anything else is not a media type we will publish. */
const MIME_PATTERN = /^[a-z]+\/[a-z0-9][a-z0-9.+-]*$/;

function mediaType(value: unknown): string | null {
  const raw = text(value);
  if (raw === null) return null;
  return MIME_PATTERN.test(raw.toLowerCase()) ? raw.toLowerCase() : null;
}

/* ── ISO 8601 duration ────────────────────────────────────────────────────── */

/**
 * Seconds → an ISO 8601 duration (`PT8M30S`, `PT1H2M3S`, `PT2H`), or null.
 *
 * Null — i.e. the `duration` property is OMITTED — for every value that is not a
 * positive whole number of seconds. That deliberately includes `0`: there is no
 * duration probe in this platform (ADR §9), `durationSeconds` is declared by the
 * uploader and stays nullable rather than being fabricated, and `PT0S` would assert
 * that the video is zero seconds long. "Unknown" is expressed by the property not
 * being there, not by a value that happens to be falsy.
 *
 * Components that are zero are dropped, so 3600 is `PT1H` and not `PT1H0M0S`.
 */
export function toIso8601Duration(seconds: number | null | undefined): string | null {
  if (typeof seconds !== "number") return null;
  if (!Number.isFinite(seconds) || !Number.isInteger(seconds)) return null;
  if (seconds <= 0) return null;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  let out = "PT";
  if (hours > 0) out += `${hours}H`;
  if (minutes > 0) out += `${minutes}M`;
  if (secs > 0) out += `${secs}S`;
  return out;
}

/* ── Input shapes ─────────────────────────────────────────────────────────── */

/**
 * The asset fields the SEO surface reads.
 *
 * Structural, not a Prisma type: `MediaAssetRow` (the repository projection) does
 * not carry `canonicalUrl`/`noIndex`, and a public page assembles its own view. The
 * lifecycle triple is REQUIRED so the gate below cannot be called without it.
 */
export interface MediaSeoAsset {
  readonly slug: string;
  /** Slug of the OWNING organization — part of the public URL (see above). */
  readonly organizationSlug: string;
  readonly status: string;
  readonly visibility: string;
  readonly processingState: string;
  /** Editorial opt-out. `true` suppresses indexing even for a published asset. */
  readonly noIndex?: boolean | null;
  /** Editor-declared canonical. Honoured only when it is same-origin absolute. */
  readonly canonicalUrl?: string | null;
  readonly durationSeconds?: number | null;
  readonly publishedAt?: Date | string | null;
  readonly contentType?: string | null;
  readonly skillLevel?: string | null;
  readonly viewCount?: number | null;
  /** Display name of the owning organization; omitted from JSON-LD when absent. */
  readonly organizationName?: string | null;
}

/** Locale-resolved editorial copy for one asset. */
export interface MediaSeoContent {
  readonly locale: string;
  readonly title: string;
  readonly summary?: string | null;
  readonly description?: string | null;
  readonly seoTitle?: string | null;
  readonly seoDescription?: string | null;
  readonly keywords?: readonly string[] | null;
}

/**
 * Real, already-resolved URLs — supplied by the page, never derived from a storage
 * key here. Storage keys are server-side only (`src/app/api/media/**` whitelists
 * every public field and excludes both `storageKey` and `posterStorageKey`), and a
 * URL that is not anonymously fetchable must be passed as null so the corresponding
 * property is omitted rather than published as a dead link.
 */
export interface MediaSeoUrls {
  /** Anonymously fetchable byte URL, or null when nothing is servable. */
  readonly contentUrl?: string | null;
  /** Poster image URL, or null when no poster was uploaded (none is generated). */
  readonly thumbnailUrl?: string | null;
}

/* ── The indexability gate (rule 1) ───────────────────────────────────────── */

/**
 * May this asset be described to a crawler at all?
 *
 * PUBLISHED + PUBLIC + READY (delegated to `isPubliclyReadable`, the ONE definition
 * of public exposure in this slice) AND the editor has not set `noIndex`.
 * Everything else — a draft, a submitted or rejected asset, an archived one, a
 * PRIVATE or ORGANIZATION-visibility one, one whose bytes are still validating or
 * are quarantined — is false.
 */
export function isMediaIndexable(asset: MediaSeoAsset): boolean {
  if (asset.noIndex === true) return false;
  return isPubliclyReadable({
    status: asset.status,
    visibility: asset.visibility,
    processingState: asset.processingState,
  });
}

/* ── VideoObject (rule 2) ─────────────────────────────────────────────────── */

const MAX_KEYWORDS = 25;

function keywordString(keywords: readonly string[] | null | undefined): string | null {
  if (!Array.isArray(keywords)) return null;
  const cleaned: string[] = [];
  for (const raw of keywords) {
    const k = text(raw);
    if (k !== null && !cleaned.includes(k)) cleaned.push(k);
    if (cleaned.length >= MAX_KEYWORDS) break;
  }
  return cleaned.length > 0 ? cleaned.join(", ") : null;
}

export interface MediaVideoObjectInput {
  readonly asset: MediaSeoAsset;
  readonly content: MediaSeoContent;
  readonly urls?: MediaSeoUrls;
}

/**
 * schema.org `VideoObject` for ONE public asset, or `null`.
 *
 * Returns null — meaning the page emits no JSON-LD whatsoever — when the asset is
 * not indexable, when it has no usable title, or when its slugs cannot mint a URL.
 *
 * ALWAYS PRESENT: `@context`, `@type`, `name`, `url`, `inLanguage`.
 * CONDITIONAL (present only when the backing data is): `description`,
 * `thumbnailUrl`, `uploadDate`, `duration`, `contentUrl`, `encodingFormat`,
 * `educationalLevel`, `keywords`, `publisher`, `interactionStatistic`.
 * NEVER PRESENT: `embedUrl` (no embed/iframe surface exists — external embeds are
 * BLOCKED_OWNER behind a CSP `frame-src` relaxation this phase does not make),
 * `hasPart`/`Clip` (the player has no timestamp deep-link, so a key-moment URL
 * would not seek), `width`/`height`/`bitrate`/`videoQuality` (no probe, no
 * transcoder), and `dateModified` (see the module header).
 */
export function buildMediaVideoObject(
  input: MediaVideoObjectInput,
): Record<string, unknown> | null {
  const { asset, content, urls } = input;
  if (!isMediaIndexable(asset)) return null;

  const name = firstText(content.title, content.seoTitle);
  if (name === null) return null;

  const locale = resolveLocale(content.locale);
  const canonical =
    sameOriginUrl(asset.canonicalUrl) ??
    mediaWatchUrl(locale, asset.organizationSlug, asset.slug);
  if (canonical === null) return null;

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name,
    url: canonical,
    inLanguage: schemaLanguageTag(locale),
  };

  const description = firstText(content.seoDescription, content.summary, content.description);
  if (description !== null) schema.description = description;

  const thumbnailUrl = sameOriginUrl(urls?.thumbnailUrl);
  if (thumbnailUrl !== null) schema.thumbnailUrl = thumbnailUrl;

  // `publishedAt` is stamped once and immutably by the publication transition, so
  // it is the only date this platform can honestly call an upload/publication date.
  const uploadDate = isoInstant(asset.publishedAt);
  if (uploadDate !== null) schema.uploadDate = uploadDate;

  const duration = toIso8601Duration(asset.durationSeconds);
  if (duration !== null) schema.duration = duration;

  // A byte URL is published ONLY when the page proved one exists and it is ours.
  // `encodingFormat` rides with it: describing a format for a file nobody can
  // fetch would be a claim about a resource we are not offering.
  const contentUrl = sameOriginUrl(urls?.contentUrl);
  if (contentUrl !== null) {
    schema.contentUrl = contentUrl;
    const encodingFormat = mediaType(asset.contentType);
    if (encodingFormat !== null) schema.encodingFormat = encodingFormat;
  }

  // Stored verbatim: the graded level is an editorial fact, not a derived one.
  if (isMediaSkillLevel(asset.skillLevel)) schema.educationalLevel = asset.skillLevel;

  const keywords = keywordString(content.keywords);
  if (keywords !== null) schema.keywords = keywords;

  // The publisher of a tenant's video is the TENANT, not Hermes Novin — this is an
  // organization-owned record (ADR §3). When the page did not resolve the owning
  // organization's display name, the property is omitted rather than defaulted to
  // the platform operator, which would be a false attribution.
  const publisherName = text(asset.organizationName);
  if (publisherName !== null) {
    const libraryPath = mediaLibraryPath(asset.organizationSlug);
    schema.publisher = {
      "@type": "Organization",
      name: publisherName,
      ...(libraryPath ? { url: `${BASE_URL}/${locale}${libraryPath}` } : {}),
    };
  }

  // Backed by the real `viewCount` column, which only a PLAY event increments.
  if (typeof asset.viewCount === "number" && Number.isInteger(asset.viewCount) && asset.viewCount > 0) {
    schema.interactionStatistic = {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/WatchAction",
      userInteractionCount: asset.viewCount,
    };
  }

  return schema;
}

/* ── Page metadata (canonical + hreflang + robots) ────────────────────────── */

export interface MediaMetadataInput {
  readonly asset: MediaSeoAsset;
  readonly content: MediaSeoContent;
  /** The locale of the PAGE being rendered. */
  readonly locale: string;
  /** Poster image for OG/Twitter; falls back to the site default when absent. */
  readonly ogImage?: string | null;
  /**
   * DISCOVERY-2A — the locales this asset genuinely has editorial copy in,
   * `primaryLocale` first. Omit only when the caller truly cannot tell; passing
   * it is what stops an English-only asset advertising a Persian and a German
   * alternate that do not exist.
   */
  readonly contentLocales?: readonly string[];
}

/**
 * Next.js `Metadata` for one public watch page.
 *
 * A non-indexable asset gets `noIndexMetadata` — `index: false, follow: false`, and
 * critically NO canonical and NO `alternates.languages`. A draft therefore has no
 * indexable address to discover, which is exactly what the Academy course page
 * fails to do.
 *
 * An indexable asset goes through the platform's own `buildMetadata`, so its
 * canonical, its hreflang set, its OpenGraph/Twitter cards and its robots
 * directives are byte-identical in shape to every other public page on the site.
 *
 * DISCOVERY-2A — the hreflang set is the asset's REAL editorial locales, not
 * every `ACTIVE_LOCALES` entry. `contentLocales` is optional so a caller that
 * genuinely does not know keeps the old behaviour, but the watch page and the
 * sitemap both pass the translation rows.
 */
export function buildMediaAssetMetadata(input: MediaMetadataInput): Metadata {
  const { asset, content } = input;
  const locale = resolveLocale(input.locale);
  const title = firstText(content.seoTitle, content.title) ?? "";

  const path = mediaWatchPath(asset.organizationSlug, asset.slug);
  if (!isMediaIndexable(asset) || path === null) {
    return noIndexMetadata(title);
  }

  const description = firstText(content.seoDescription, content.summary, content.description);
  const ogImage = sameOriginUrl(input.ogImage);
  const publishedTime = isoInstant(asset.publishedAt);

  const meta = buildMetadata({
    locale,
    path,
    title,
    // `buildMetadata` requires a string; an absent description is stripped again
    // below so the page never ships `<meta name="description" content="">`.
    description: description ?? "",
    ...(content.keywords && content.keywords.length > 0 ? { keywords: [...content.keywords] } : {}),
    ...(ogImage ? { ogImage } : {}),
    ogType: "article" as const,
    ...(publishedTime ? { publishedTime } : {}),
    ...(input.contentLocales && input.contentLocales.length > 0
      ? { contentLocales: input.contentLocales }
      : {}),
  });

  if (description === null) stripDescription(meta);

  // An editor-declared canonical replaces ONLY the canonical. The hreflang set is
  // left alone: it describes which locales of THIS page exist, which the editorial
  // override does not change.
  const declared = sameOriginUrl(asset.canonicalUrl);
  if (declared !== null && meta.alternates) meta.alternates.canonical = declared;

  return meta;
}

/** Remove the empty description placeholders `buildMetadata` was forced to accept. */
function stripDescription(meta: Metadata): void {
  const root = meta as Record<string, unknown>;
  delete root.description;
  const og = meta.openGraph as Record<string, unknown> | undefined;
  if (og) delete og.description;
  const tw = meta.twitter as Record<string, unknown> | undefined;
  if (tw) delete tw.description;
}

/* ── Sitemap ──────────────────────────────────────────────────────────────── */

/**
 * Hard ceiling on the assets one sitemap generation will read.
 *
 * Multiplied by `ACTIVE_LOCALES` this is 3 000 URLs, comfortably inside the 50 000
 * URL / 50 MB sitemap limits, and it means this code path can never turn into an
 * unbounded table scan the way the Academy course branch of `src/app/sitemap.ts`
 * does (`academyCourse.findMany({ select: { id: true } })` — no predicate, no
 * `take`). When a deployment outgrows it the fix is a paginated sitemap index, not
 * a larger number.
 */
export const MEDIA_SITEMAP_MAX_ASSETS = 1000;

export interface MediaSitemapItem {
  /** Locale-relative path, e.g. `/videos/acme/plc-commissioning`. */
  readonly path: string;
  /** First-publication instant, or null when unknown. Never `updatedAt`. */
  readonly lastModified: string | null;
  /**
   * DISCOVERY-2A — the locales this asset ACTUALLY has editorial copy in,
   * `primaryLocale` first.
   *
   * Derived from the asset's real `MediaAssetTranslation` rows, never from
   * `ACTIVE_LOCALES`. An asset with one English translation used to be listed
   * under /fa, /en and /de with reciprocal `alternates`, claiming two
   * translations that do not exist — and contradicting the watch page, which
   * falls back to `primaryLocale` precisely because the others may be absent.
   */
  readonly contentLocales: readonly string[];
}

interface MediaSitemapRow {
  slug?: unknown;
  publishedAt?: unknown;
  primaryLocale?: unknown;
  translations?: readonly { locale?: unknown }[] | null;
  organization?: { slug?: unknown } | null;
}

/**
 * Turn raw rows into sitemap items. Pure and exported so the exclusion rules can be
 * proven without a database.
 *
 * A row is dropped when either slug is unmintable — a URL is never emitted for a
 * value that could not survive `SLUG_PATTERN`.
 */
export function buildMediaSitemapItems(
  rows: readonly MediaSitemapRow[],
): readonly MediaSitemapItem[] {
  const items: MediaSitemapItem[] = [];
  for (const row of rows) {
    const orgSlug = typeof row.organization?.slug === "string" ? row.organization.slug : "";
    const assetSlug = typeof row.slug === "string" ? row.slug : "";
    const path = mediaWatchPath(orgSlug, assetSlug);
    if (path === null) continue;
    items.push({
      path,
      lastModified: isoInstant(row.publishedAt as Date | string | null | undefined),
      contentLocales: mediaContentLocales(row),
    });
  }
  return items;
}

/**
 * The asset's real editorial locales: `primaryLocale` (the copy every reader
 * falls back to, so it leads and becomes the canonical/x-default target),
 * followed by every OTHER locale that has its own translation row.
 *
 * Values are lower-cased and filtered against the active locale set; a row with
 * nothing usable yields `[]`, and `mediaSitemapEntries` then emits no URL for it
 * rather than guessing a language.
 */
function mediaContentLocales(row: MediaSitemapRow): readonly string[] {
  const primary = typeof row.primaryLocale === "string" ? row.primaryLocale.toLowerCase() : "";
  const translated = Array.isArray(row.translations)
    ? row.translations
        .map((t) => (typeof t?.locale === "string" ? t.locale.toLowerCase() : ""))
        .filter((l) => l.length > 0)
    : [];
  return [primary, ...translated]
    .filter((l) => l.length > 0)
    .filter((l) => (LOCALES as readonly string[]).includes(l))
    .filter((l, i, all) => all.indexOf(l) === i);
}

/**
 * The published, public, indexable media assets, bounded.
 *
 * THE VISIBILITY PREDICATE IS NOT WRITTEN HERE. It is
 * `mediaVisibilityWhere(PUBLIC_AUDIENCE)` — the repository's OWN exported fragment,
 * reused exactly as the public library route reuses it for its search join (ADR
 * §11). This module never constructs the editorial opt-out and never restates
 * `status` / `visibility` / `processingState`, so the day the gate changes, this
 * changes with it.
 *
 * Two further predicates are applied, both editorial statements that this URL is
 * not the indexable home of the content:
 *   - `noIndex: false` — the editor asked for it to stay out of the index;
 *   - `canonicalUrl: null` — the asset declares its canonical elsewhere, so
 *     listing our three locale URLs would contradict the page's own canonical tag.
 *
 * Returns `[]` — never throws and never blocks a build — when the database is
 * unavailable, matching the graceful-degradation contract of every other dynamic
 * branch in `src/app/sitemap.ts`.
 */
export async function listPublicMediaSitemapItems(
  limit: number = MEDIA_SITEMAP_MAX_ASSETS,
): Promise<readonly MediaSitemapItem[]> {
  const gate = mediaVisibilityWhere(PUBLIC_AUDIENCE);
  if (!gate.ok) return [];

  const take = Number.isInteger(limit)
    ? Math.min(Math.max(limit, 1), MEDIA_SITEMAP_MAX_ASSETS)
    : MEDIA_SITEMAP_MAX_ASSETS;

  try {
    const db = (await getPrisma()) as
      | { mediaAsset?: { findMany?: (args: unknown) => Promise<unknown> } }
      | null;
    const model = db?.mediaAsset;
    if (!model || typeof model.findMany !== "function") return [];

    const rows = await model.findMany({
      where: { ...gate.value, noIndex: false, canonicalUrl: null },
      // Slug, publication date and the LANGUAGE FACTS. No storage key, no id, no
      // counters — a sitemap needs an address, a date and the set of languages
      // the address genuinely exists in, and nothing else may leak into one.
      select: {
        slug: true,
        publishedAt: true,
        primaryLocale: true,
        translations: { select: { locale: true } },
        organization: { select: { slug: true } },
      },
      orderBy: { publishedAt: "desc" },
      take,
    });
    return buildMediaSitemapItems(Array.isArray(rows) ? (rows as MediaSitemapRow[]) : []);
  } catch {
    return [];
  }
}

/**
 * Sitemap entries for the public media hub, one per locale the asset REALLY has.
 *
 * DISCOVERY-2A: this used to loop over `ACTIVE_LOCALES` unconditionally and
 * attach a full three-way `alternates.languages` map to every asset. The
 * language set now comes from the row (`MediaSitemapItem.contentLocales`), so an
 * English-only asset produces one URL and no alternates, a fa+en asset produces
 * two mutually-referencing URLs, and only a genuinely trilingual asset produces
 * three. This mirrors exactly what the watch page emits through
 * `buildMetadata({ contentLocales: view.contentLocales })`.
 *
 * An item with no usable locale produces NO entry — a URL is never emitted for
 * an asset whose language cannot be established.
 */
export function mediaSitemapEntries(
  items: readonly MediaSitemapItem[],
  priority = 0.7,
): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const item of items) {
    const locales = item.contentLocales.filter((l) =>
      (LOCALES as readonly string[]).includes(l),
    );
    if (locales.length === 0) continue;
    for (const locale of locales) {
      entries.push({
        url: `${BASE_URL}/${locale}${item.path}`,
        ...(item.lastModified ? { lastModified: item.lastModified } : {}),
        changeFrequency: "weekly" as const,
        priority,
        ...(locales.length > 1
          ? {
              alternates: {
                languages: Object.fromEntries(
                  locales.map((l) => [l, `${BASE_URL}/${l}${item.path}`]),
                ),
              },
            }
          : {}),
      });
    }
  }
  return entries;
}
