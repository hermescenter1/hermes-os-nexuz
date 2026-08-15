/**
 * PHASE 105 — the Journal's public sitemap surface.
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
import { BASE_URL, LOCALES } from "@/lib/seo/config";

/** Hard ceiling on rows pulled into the sitemap. */
export const ARTICLE_SITEMAP_MAX = 5000;

export interface ArticleSitemapItem {
  slug: string;
  /** ISO 8601, or null when the row carries no usable timestamp. */
  lastModified: string | null;
  /**
   * DISCOVERY-2A — the article's OWN language, lower-cased ("fa" | "en").
   *
   * An article exists in exactly one language: `Article.language` is
   * `ArtLanguage`, whose members are EN and FA — there is no DE and there cannot
   * be one. `Article.slug` is globally unique and `getArticleDetailBySlug` has no
   * language filter, so /fa, /en and /de all render the SAME text under different
   * chrome. Emitting three URLs with reciprocal `alternates` therefore claimed
   * two translations that do not exist, tripled the URL count for one document,
   * and contradicted `@/lib/seo/indexnow-lifecycle`, which has always refused to
   * fabricate the very same URLs.
   */
  language: string;
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
    return rows
      .map((row) => ({
        slug: typeof row.slug === "string" ? row.slug : "",
        language: typeof row.language === "string" ? row.language.toLowerCase() : "",
        // `updatedAt` is the more accurate "last modified" of the two; fall
        // back to publication time, and omit entirely if neither is usable.
        lastModified: asIso(row.updatedAt) ?? asIso(row.publishedAt),
      }))
      // A row with no usable language cannot be addressed honestly, so it is
      // dropped rather than defaulted onto a locale it may not be written in.
      .filter((item) => item.slug.length > 0 && item.language.length > 0);
  } catch {
    return [];
  }
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
 * {@link ArticleSitemapItem.language} for why that was a false claim. This now
 * matches exactly what `articles/[slug]/page.tsx` emits through
 * `buildMetadata({ contentLocales: [article.language] })`, so the sitemap and
 * the page's own canonical can no longer disagree.
 */
export function articleSitemapEntries(items: ArticleSitemapItem[]): MetadataRoute.Sitemap {
  return items.flatMap((item) =>
    localeEntries(`/articles/${item.slug}`, 0.75, "monthly", item.lastModified, [item.language]),
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
