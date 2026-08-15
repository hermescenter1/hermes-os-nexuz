import { describe, it, expect } from "vitest";
import {
  ARTICLE_SITEMAP_WHERE,
  ARTICLE_SITEMAP_MAX,
  articleSitemapEntries,
  authorSitemapEntries,
} from "../seo";
import { BASE_URL, LOCALES } from "@/lib/seo/config";

/**
 * PHASE 105 — the Journal's sitemap surface.
 *
 * The Journal was entirely absent from the sitemap. These assertions pin the
 * two properties that make adding it safe: nothing unpublished or de-indexed is
 * ever advertised, and no timestamp is invented.
 */

describe("published-only, indexable-only predicate", () => {
  it("requires PUBLISHED + PUBLIC + not de-indexed", () => {
    expect(ARTICLE_SITEMAP_WHERE).toEqual({
      status: "PUBLISHED",
      visibility: "PUBLIC",
      noIndex: false,
    });
  });

  it("the noIndex clause is present — a de-indexed article must never be listed", () => {
    // The sitemap advertising a URL whose page serves `noindex` is a
    // self-contradicting signal; this is the clause that prevents it, and the
    // reason the public feed helper cannot be reused here.
    expect(ARTICLE_SITEMAP_WHERE.noIndex).toBe(false);
  });

  it("the read is bounded", () => {
    expect(ARTICLE_SITEMAP_MAX).toBeGreaterThan(0);
    expect(Number.isFinite(ARTICLE_SITEMAP_MAX)).toBe(true);
  });
});

describe("article entries", () => {
  /**
   * DISCOVERY-2A — CONTRACT CHANGE, recorded deliberately.
   *
   * This block previously asserted "one canonical URL per active locale" and
   * "reciprocal alternates for every locale". Both pinned a false claim: an
   * article exists in exactly ONE language (`Article.language` is `ArtLanguage`,
   * whose members are EN and FA — there is no DE), `Article.slug` is globally
   * unique, and `getArticleDetailBySlug` has no language filter, so /fa, /en and
   * /de all served the SAME text. The old expectations are replaced with the
   * one-URL-per-article invariant, which is strictly more specific.
   */
  const entries = articleSitemapEntries([
    { slug: "opc-ua-basics", language: "en", lastModified: "2026-03-04T10:00:00.000Z" },
    { slug: "no-timestamp", language: "fa", lastModified: null },
  ]);

  it("emits exactly one canonical URL per article, under its own language", () => {
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.url)).toEqual([
      `${BASE_URL}/en/articles/opc-ua-basics`,
      `${BASE_URL}/fa/articles/no-timestamp`,
    ]);
  });

  it("never fabricates a locale variant of a single-language article", () => {
    const urls = entries.map((e) => e.url);
    expect(urls).not.toContain(`${BASE_URL}/fa/articles/opc-ua-basics`);
    expect(urls).not.toContain(`${BASE_URL}/de/articles/opc-ua-basics`);
    expect(urls).not.toContain(`${BASE_URL}/en/articles/no-timestamp`);
    expect(urls).not.toContain(`${BASE_URL}/de/articles/no-timestamp`);
  });

  it("every URL is absolute on the canonical host", () => {
    for (const e of entries) {
      expect(e.url.startsWith(`${BASE_URL}/`)).toBe(true);
      expect(e.url).not.toMatch(/localhost|staging|www\./i);
    }
  });

  it("carries NO alternates — a single representation has no alternate", () => {
    for (const e of entries) {
      expect(e.alternates).toBeUndefined();
    }
  });

  it("a language outside the active set is dropped rather than guessed at", () => {
    expect(articleSitemapEntries([{ slug: "x", language: "pt", lastModified: null }])).toEqual([]);
    expect(articleSitemapEntries([{ slug: "x", language: "", lastModified: null }])).toEqual([]);
  });

  it("uses the row's real timestamp, and omits lastModified when there is none", () => {
    const dated = entries.filter((e) => e.url.includes("opc-ua-basics"));
    for (const e of dated) expect(e.lastModified).toBe("2026-03-04T10:00:00.000Z");
    const undated = entries.filter((e) => e.url.includes("no-timestamp"));
    for (const e of undated) expect("lastModified" in e).toBe(false);
  });

  it("never invents a timestamp for an undated article", () => {
    const undated = articleSitemapEntries([{ slug: "x", language: "en", lastModified: null }]);
    for (const e of undated) expect(e.lastModified).toBeUndefined();
  });
});

describe("author entries", () => {
  const entries = authorSitemapEntries([{ handle: "h-forozandeh" }]);

  it("emits one profile URL per locale with no fabricated lastModified", () => {
    // DISCOVERY-2A deliberately leaves this one alone. Unlike an article, an
    // author profile carries no language field: it is a structured record
    // (display name, handle, headline, expertise areas) rendered in whatever
    // chrome the locale supplies, so each locale URL genuinely is an alternate
    // representation rather than the same prose reprinted three times.
    expect(entries).toHaveLength(LOCALES.length);
    for (const e of entries) {
      expect(e.url).toContain("/articles/author/h-forozandeh");
      expect("lastModified" in e).toBe(false);
    }
  });
});

describe("no private surface is ever advertised", () => {
  it("article and author paths never touch an authenticated Journal route", () => {
    const all = [
      ...articleSitemapEntries([{ slug: "a", language: "en", lastModified: null }]),
      ...authorSitemapEntries([{ handle: "b" }]),
    ].map((e) => e.url);
    for (const url of all) {
      expect(url).not.toMatch(
        /\/articles\/(write|drafts|saved|following|my-articles|settings|moderation|review-queue|reports|editorial-board|editor|submissions)\b/,
      );
      expect(url).not.toMatch(/\/dashboard|\/admin|\/api\/|\/auth\//);
    }
  });
});
