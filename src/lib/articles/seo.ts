/**
 * PHASE 105 — the Journal's public sitemap surface.
 *
 * PHASE 106B extended it into the Journal's TRANSLATION-GROUP authority: the
 * article detail page asks this module which editions of a slug genuinely exist
 * and may be advertised, so page hreflang and sitemap alternates are derived
 * from one predicate instead of two hand-kept copies.
 *
 * THIS MODULE EXTENDS THE EXISTING SEO LAYER — IT DOES NOT REPLACE IT. The
 * domain comes from `@/lib/seo/config`, the locale list from `LOCALES`, and the
 * alternates are built the same way `app/sitemap.ts` builds them for every other
 * route family.
 *
 * It exists because the Journal — the site's largest body of public technical
 * content — was entirely absent from the sitemap: `/articles`, every article
 * detail page and every public author profile were unlisted, so the strongest
 * technical-authority signal the site has was left undiscoverable by crawl.
 *
 * TWO RULES, DELIBERATELY COPIED FROM `@/lib/media/seo`:
 *
 * 1. NOTHING UNPUBLISHED — OR DE-INDEXED — IS EVER DESCRIBED TO A CRAWLER.
 *    The predicate here is a superset of the one the article page itself
 *    applies in `generateMetadata`: `status = PUBLISHED`, `visibility = PUBLIC`
 *    AND `noIndex = false`. That last clause is the reason this module does not
 *    simply reuse `getPublicArticles()`: `ArticleListItem` does not carry
 *    `noIndex`, so a route the editor has explicitly de-indexed would otherwise
 *    be advertised in the sitemap while the page itself serves `noindex` — a
 *    self-contradicting signal.
 *
 * 2. `lastModified` IS A REAL TIMESTAMP OR IT IS ABSENT. `publishedAt` and
 *    `updatedAt` come from the row. Nothing is stamped with "now" or with a
 *    hard-coded release date, because a sitemap that reports every URL as
 *    freshly modified on every request teaches a crawler to ignore the field.
 *
 * The read is capped at `ARTICLE_SITEMAP_MAX` rows so it cannot degrade into an
 * unbounded scan as the Journal grows.
 */

import type { MetadataRoute } from "next";
import { getPrisma } from "@/lib/db/prisma";
import { BASE_URL, DEFAULT_LOCALE, LOCALES } from "@/lib/seo/config";
import { localeForArticleLanguage } from "./locale";
import { normalizeArticleSlug } from "./slug";

/** Hard ceiling on rows pulled into the sitemap. */
export const ARTICLE_SITEMAP_MAX = 5000;

export interface ArticleSitemapItem {
  slug: string;
  /** ISO 8601, or null when the row carries no usable timestamp. */
  lastModified: string | null;
  /**
   * The languages this topic ACTUALLY exists in, lower-cased, deduplicated.
   *
   * DISCOVERY-2A established the rule this field enforces: never advertise a
   * locale the article was not written in, and never emit reciprocal
   * `alternates` for translations that do not exist. At that time an article
   * was necessarily single-language, so the rule was expressed as one scalar
   * language per row.
   *
   * Phase 106 makes the multi-language case real — `ArtLanguage` gains DE and
   * uniqueness moves to `@@unique([slug, language])`, so one slug is now a
   * translation GROUP of up to three genuine editions. The rule is unchanged;
   * only its input is. A legacy single-language topic still yields exactly one
   * URL with no alternates, and a translated topic yields one URL per edition
   * with reciprocal alternates that are now true.
   *
   * Reading a scalar here would have forced a choice between reintroducing
   * fabricated alternates for legacy rows and hiding the Phase 106 editions, so
   * the field carries the set instead of one member of it.
   */
  languages: string[];
}

export interface AuthorSitemapItem {
  handle: string;
}

/**
 * The published-only, indexable-only sitemap predicate for articles.
 *
 * Exported so a test can assert the exact clauses rather than re-describing
 * them, and so it cannot drift away from the page-level check.
 */
export const ARTICLE_SITEMAP_WHERE = {
  status: "PUBLISHED",
  visibility: "PUBLIC",
  noIndex: false,
} as const;

type FindMany = (args: unknown) => Promise<Record<string, unknown>[]>;

function asIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

/**
 * Public, indexable Journal articles. Returns `[]` — never throws — when the
 * database is unavailable, so a build without a DB still produces a valid
 * sitemap for the static routes.
 */
export async function listPublicArticleSitemapItems(): Promise<ArticleSitemapItem[]> {
  const prisma = await getPrisma();
  if (!prisma) return [];
  try {
    const rows = await (prisma as unknown as { article: { findMany: FindMany } }).article.findMany({
      where: ARTICLE_SITEMAP_WHERE,
      // `language` joins the projection so the sitemap can address each article
      // under its OWN locale instead of inventing one URL per active locale.
      select: { slug: true, language: true, publishedAt: true, updatedAt: true },
      orderBy: { publishedAt: "desc" },
      take: ARTICLE_SITEMAP_MAX,
    });
    // ONE ENTRY PER TRANSLATION GROUP, ADDRESSED ONLY IN ITS REAL LANGUAGES.
    //
    // Two corrections meet here and both are required.
    //
    // DISCOVERY-2A: a row may only be advertised under the locale it is written
    // in, so a row whose language is unusable is dropped rather than defaulted
    // onto a locale it may not be written in.
    //
    // Phase 106: a topic is now up to three rows (EN/FA/DE) sharing one slug,
    // and `articleSitemapEntries` expands each item across the locales it is
    // given. Returning one item per ROW would emit the same slug once per
    // edition, so the rows are folded into one item per slug carrying the set of
    // languages that slug genuinely has. Found by the PostgreSQL rehearsal: with
    // a single-language corpus each slug had exactly one row, so the duplication
    // was invisible until real multilingual data existed.
    //
    // The group's `lastModified` is the NEWEST across its editions: translating
    // an article genuinely changes what that URL set offers.
    const byGroup = new Map<string, { lastModified: string | null; languages: string[] }>();
    for (const row of rows) {
      const slug = typeof row.slug === "string" ? row.slug : "";
      const language = typeof row.language === "string" ? row.language.toLowerCase() : "";
      if (slug.length === 0 || language.length === 0) continue;
      const modified = asIso(row.updatedAt) ?? asIso(row.publishedAt);
      const group = byGroup.get(slug);
      if (!group) {
        byGroup.set(slug, { lastModified: modified, languages: [language] });
        continue;
      }
      if (!group.languages.includes(language)) group.languages.push(language);
      if (modified && (!group.lastModified || modified > group.lastModified)) {
        group.lastModified = modified;
      }
    }
    return [...byGroup].map(([slug, group]) => ({
      slug,
      lastModified: group.lastModified,
      languages: group.languages,
    }));  } catch {
    return [];
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * PHASE 106B — THE TRANSLATION GROUP OF ONE SLUG, FOR THE ARTICLE PAGE ITSELF.
 *
 * The sitemap above learned in Phase 106 that one slug is a GROUP of editions.
 * `articles/[slug]/page.tsx` did not: it still passed the single served row's
 * language as `contentLocales`, so a trilingual topic emitted a canonical and
 * NO hreflang at all — production HTML showed `canonical = present,
 * hreflang = NONE` for all 50 Phase 106 topics.
 *
 * The lookup lives HERE, next to `ARTICLE_SITEMAP_WHERE`, precisely so the page
 * and the sitemap cannot disagree about which editions are advertisable: they
 * read the same predicate constant. That is the whole of the coupling — the
 * page does not reuse the sitemap's grouping or URL construction.
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Upper bound on one translation group's rows.
 *
 * `@@unique([slug, language])` already caps a group at one row per article
 * language, so this can never truncate a real group; it exists so a corrupted
 * or future-widened corpus still cannot turn a page render into a scan.
 */
export const ARTICLE_TRANSLATION_GROUP_MAX = LOCALES.length;

/**
 * The locales in which a PUBLIC, INDEXABLE edition of `slug` genuinely exists.
 *
 * PROJECTION: `language` only. An hreflang set needs nothing else, and a detail
 * page must never drag up to three full article bodies through the driver just
 * to learn which languages exist.
 *
 * PREDICATE: `ARTICLE_SITEMAP_WHERE` — PUBLISHED + PUBLIC + not de-indexed. A
 * draft, private or `noIndex` sibling is not an advertisable alternate: linking
 * to one tells a crawler to fetch a page that then refuses to be indexed.
 *
 * The slug is normalised with the SAME helper the detail read uses, so an
 * encoded or NFD route param resolves to the same group the page resolved.
 *
 * Returns `[]` — never throws — when the database is unavailable, so metadata
 * degrades to "no alternates" rather than failing the render.
 */
export async function getPublicArticleLanguagesBySlug(slug: string): Promise<string[]> {
  const lookupSlug = normalizeArticleSlug(slug);
  if (!lookupSlug) return [];

  const prisma = await getPrisma();
  if (!prisma) return [];
  try {
    const rows = await (prisma as unknown as { article: { findMany: FindMany } }).article.findMany({
      where: { ...ARTICLE_SITEMAP_WHERE, slug: lookupSlug },
      select: { language: true },
      take: ARTICLE_TRANSLATION_GROUP_MAX,
    });
    const locales: string[] = [];
    for (const row of rows) {
      // `ArtLanguage` -> locale goes through the one mapping the whole Journal
      // uses, not a `.toLowerCase()` coincidence: a language the platform does
      // not route is not a locale and must not become an hreflang.
      const locale = typeof row.language === "string" ? localeForArticleLanguage(row.language) : null;
      if (!locale || !(LOCALES as readonly string[]).includes(locale)) continue;
      if (!locales.includes(locale)) locales.push(locale);
    }
    return locales;
  } catch {
    return [];
  }
}

/**
 * The `contentLocales` an article detail page must declare.
 *
 * INPUTS
 *  - `servedLanguage` — `Article.language` of the row this request ACTUALLY
 *    rendered. Always a real representation, so it is always in the result:
 *    the page's own canonical has to be able to point at the text it served.
 *  - `siblingLocales` — the indexable group from
 *    {@link getPublicArticleLanguagesBySlug}. The served row is normally a
 *    member; when it is not (an editor de-indexed exactly this edition) the
 *    page still canonicalises to itself while its `noIndex` robots directive
 *    keeps it out of the index. Its siblings, computing their own sets, do not
 *    advertise it.
 *
 * ORDER matters because `buildMetadata` treats the first entry as the primary
 * representation: it is `x-default`, and it is the canonical target for a
 * locale with no edition of its own.
 *
 * Two cases, deliberately different:
 *  - The requested locale owns the served edition (the normal case). Order is
 *    the platform's own locale order, default locale first, so every member of
 *    a group agrees on one stable `x-default`.
 *  - The requested locale has NO edition and is being served a fallback
 *    (`getArticleDetailBySlug` step 2). The served language leads, so the
 *    canonical points at the URL that really serves this text instead of at a
 *    sibling whose prose the reader never saw.
 */
export function resolveArticleContentLocales(opts: {
  requestedLocale: string;
  servedLanguage: string;
  siblingLocales: readonly string[];
}): string[] {
  const served = localeForArticleLanguage(opts.servedLanguage);
  const present = new Set<string>();
  if (served && (LOCALES as readonly string[]).includes(served)) present.add(served);
  for (const locale of opts.siblingLocales) {
    if ((LOCALES as readonly string[]).includes(locale)) present.add(locale);
  }
  if (present.size === 0) return [];

  // Default locale first, then the remaining active locales in platform order —
  // never the order PostgreSQL happened to return rows in.
  const canonicalOrder = [DEFAULT_LOCALE, ...LOCALES].filter(
    (locale, i, all) => all.indexOf(locale) === i && present.has(locale),
  );

  if (served && present.has(served) && served !== opts.requestedLocale) {
    return [served, ...canonicalOrder.filter((locale) => locale !== served)];
  }
  return canonicalOrder;
}

/**
 * Public author profiles that actually have at least one indexable article.
 *
 * An author page with nothing published on it is a thin/soft-404 surface, so it
 * is deliberately not advertised.
 */
export async function listPublicAuthorSitemapItems(): Promise<AuthorSitemapItem[]> {
  const prisma = await getPrisma();
  if (!prisma) return [];
  try {
    const rows = await (prisma as unknown as { article: { findMany: FindMany } }).article.findMany({
      where: ARTICLE_SITEMAP_WHERE,
      select: { author: { select: { handle: true } } },
      // DISCOVERY-2B (query hardening): a `take` with no `orderBy` is a bounded
      // but ARBITRARY slice — two identical crawls could be advertised two
      // different author sets once the Journal exceeds the ceiling. Newest-first
      // matches the article read above.
      orderBy: { publishedAt: "desc" },
      take: ARTICLE_SITEMAP_MAX,
    });
    const handles = new Set<string>();
    for (const row of rows) {
      const author = row.author as { handle?: unknown } | null;
      if (author && typeof author.handle === "string" && author.handle.length > 0) {
        handles.add(author.handle);
      }
    }
    return [...handles].map((handle) => ({ handle }));
  } catch {
    return [];
  }
}

/**
 * Expand one path across the locales it GENUINELY exists in.
 *
 * `contentLocales` defaults to every active locale, which is right for content
 * whose copy is translated with full key parity. A record that exists in one
 * language passes just that one and gets a single URL with NO `alternates` — a
 * lone self-referencing hreflang entry states nothing.
 */
function localeEntries(
  path: string,
  priority: number,
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
  lastModified: string | null,
  contentLocales: readonly string[] = LOCALES,
): MetadataRoute.Sitemap {
  const locales = contentLocales.filter((l) => (LOCALES as readonly string[]).includes(l));
  if (locales.length === 0) return [];
  return locales.map((locale) => ({
    url: `${BASE_URL}/${locale}${path}`,
    ...(lastModified ? { lastModified } : {}),
    changeFrequency,
    priority,
    ...(locales.length > 1
      ? {
          alternates: {
            languages: Object.fromEntries(locales.map((l) => [l, `${BASE_URL}/${l}${path}`])),
          },
        }
      : {}),
  }));
}

/**
 * One URL per article, under the article's own language.
 *
 * DISCOVERY-2A: was three URLs per article with reciprocal alternates. See
 * {@link ArticleSitemapItem.languages} for why that was a false claim, and why
 * the field is now the SET of a slug's real editions rather than one scalar.
 *
 * Phase 106B: `articles/[slug]/page.tsx` derives its own `contentLocales` from
 * {@link getPublicArticleLanguagesBySlug}, which reads the same
 * {@link ARTICLE_SITEMAP_WHERE} predicate this listing does. Page and sitemap
 * therefore describe the same translation group and cannot disagree.
 */
export function articleSitemapEntries(items: ArticleSitemapItem[]): MetadataRoute.Sitemap {
  return items.flatMap((item) =>
    localeEntries(`/articles/${item.slug}`, 0.75, "monthly", item.lastModified, item.languages),
  );
}

/**
 * Author profiles keep every active locale.
 *
 * Unlike an article, a profile carries no language field: it is a structured
 * record (display name, handle, headline, expertise areas) rendered in whatever
 * chrome the locale provides, so each locale URL genuinely is an alternate
 * representation of the same record rather than the same prose reprinted.
 */
export function authorSitemapEntries(items: AuthorSitemapItem[]): MetadataRoute.Sitemap {
  return items.flatMap((item) =>
    localeEntries(`/articles/author/${item.handle}`, 0.5, "weekly", null),
  );
}
