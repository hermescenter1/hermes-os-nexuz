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
      select: { slug: true, publishedAt: true, updatedAt: true },
      orderBy: { publishedAt: "desc" },
      take: ARTICLE_SITEMAP_MAX,
    });
    // ONE ENTRY PER TRANSLATION GROUP, NOT PER ROW.
    //
    // Since Phase 106 a topic is up to three rows (EN/FA/DE) sharing one slug,
    // and `articleSitemapEntries` already expands each item across every active
    // locale. Returning one item per ROW therefore emitted the same URL three
    // times — 9 <loc> entries per topic instead of 3 — which a crawler reads as
    // a malformed sitemap. Found by the PostgreSQL rehearsal: with the old
    // single-language corpus each slug had exactly one row, so the duplication
    // was invisible until real multilingual data existed.
    //
    // The group's `lastModified` is the NEWEST across its editions: translating
    // an article genuinely changes what that URL set offers.
    const byGroup = new Map<string, string | null>();
    for (const row of rows) {
      const slug = typeof row.slug === "string" ? row.slug : "";
      if (slug.length === 0) continue;
      const modified = asIso(row.updatedAt) ?? asIso(row.publishedAt);
      const seen = byGroup.get(slug);
      if (seen === undefined) {
        byGroup.set(slug, modified);
        continue;
      }
      if (modified && (!seen || modified > seen)) byGroup.set(slug, modified);
    }
    return [...byGroup].map(([slug, lastModified]) => ({ slug, lastModified }));
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

/** Expand one path across every active locale, with reciprocal alternates. */
function localeEntries(
  path: string,
  priority: number,
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
  lastModified: string | null,
): MetadataRoute.Sitemap {
  return LOCALES.map((locale) => ({
    url: `${BASE_URL}/${locale}${path}`,
    ...(lastModified ? { lastModified } : {}),
    changeFrequency,
    priority,
    alternates: {
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${BASE_URL}/${l}${path}`])),
    },
  }));
}

export function articleSitemapEntries(items: ArticleSitemapItem[]): MetadataRoute.Sitemap {
  return items.flatMap((item) =>
    localeEntries(`/articles/${item.slug}`, 0.75, "monthly", item.lastModified),
  );
}

export function authorSitemapEntries(items: AuthorSitemapItem[]): MetadataRoute.Sitemap {
  return items.flatMap((item) =>
    localeEntries(`/articles/author/${item.handle}`, 0.5, "weekly", null),
  );
}
