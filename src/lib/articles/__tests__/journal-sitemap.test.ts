import { describe, it, expect, vi } from "vitest";
import {
  ARTICLE_SITEMAP_WHERE,
  ARTICLE_SITEMAP_MAX,
  articleSitemapEntries,
  authorSitemapEntries,
} from "../seo";
import { BASE_URL, LOCALES } from "@/lib/seo/config";

/**
 * Rows as PostgreSQL returns them AFTER Phase 106 merged into a database that
 * already held single-language articles — which is the population production
 * will actually have. `topic-a` is a trilingual translation group (three rows,
 * one slug); `topic-b` is a legacy article that exists in one language only.
 *
 * Both cases must hold simultaneously: the group must collapse to one item and
 * expand to one URL per real edition, and the legacy row must still produce a
 * single URL with no fabricated alternates.
 */
const MIXED_POPULATION_ROWS = [
  { slug: "topic-a", language: "EN", publishedAt: new Date("2026-08-16T00:00:00Z"), updatedAt: new Date("2026-08-16T01:00:00Z") },
  { slug: "topic-a", language: "FA", publishedAt: new Date("2026-08-16T00:00:00Z"), updatedAt: new Date("2026-08-16T03:00:00Z") },
  { slug: "topic-a", language: "DE", publishedAt: new Date("2026-08-16T00:00:00Z"), updatedAt: new Date("2026-08-16T02:00:00Z") },
  { slug: "topic-b", language: "EN", publishedAt: new Date("2026-08-15T00:00:00Z"), updatedAt: new Date("2026-08-15T05:00:00Z") },
];

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => ({ article: { findMany: async () => MIXED_POPULATION_ROWS } }),
}));

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
    { slug: "opc-ua-basics", languages: ["en"], lastModified: "2026-03-04T10:00:00.000Z" },
    { slug: "no-timestamp", languages: ["fa"], lastModified: null },
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
    expect(articleSitemapEntries([{ slug: "x", languages: ["pt"], lastModified: null }])).toEqual([]);
    expect(articleSitemapEntries([{ slug: "x", languages: [""], lastModified: null }])).toEqual([]);
    expect(articleSitemapEntries([{ slug: "x", languages: [], lastModified: null }])).toEqual([]);
  });

  it("uses the row's real timestamp, and omits lastModified when there is none", () => {
    const dated = entries.filter((e) => e.url.includes("opc-ua-basics"));
    for (const e of dated) expect(e.lastModified).toBe("2026-03-04T10:00:00.000Z");
    const undated = entries.filter((e) => e.url.includes("no-timestamp"));
    for (const e of undated) expect("lastModified" in e).toBe(false);
  });

  it("never invents a timestamp for an undated article", () => {
    const undated = articleSitemapEntries([{ slug: "x", languages: ["en"], lastModified: null }]);
    for (const e of undated) expect(e.lastModified).toBeUndefined();
  });
});

describe("one entry per translation group, not per row (Phase 106)", () => {
  /**
   * REGRESSION: a topic is up to three Article rows sharing one slug, and
   * `articleSitemapEntries` already expands each item across every locale.
   * Returning one item per ROW emitted the same URL three times — 9 <loc>
   * entries per topic. Caught by the PostgreSQL rehearsal, because with a
   * single-language corpus each slug had exactly one row and the bug was
   * invisible.
   */
  it("collapses three language rows of one slug into a single item", async () => {
    const { listPublicArticleSitemapItems } = await import("../seo");
    const items = await listPublicArticleSitemapItems();
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.slug).sort()).toEqual(["topic-a", "topic-b"]);
  });

  it("carries the languages the group really has, lower-cased", async () => {
    const { listPublicArticleSitemapItems } = await import("../seo");
    const items = await listPublicArticleSitemapItems();
    expect(items.find((i) => i.slug === "topic-a")?.languages.sort()).toEqual(["de", "en", "fa"]);
    // The legacy single-language row keeps exactly one language: the merge must
    // not widen it into a translation group it does not have.
    expect(items.find((i) => i.slug === "topic-b")?.languages).toEqual(["en"]);
  });

  it("takes the NEWEST lastModified across the group's editions", async () => {
    const { listPublicArticleSitemapItems } = await import("../seo");
    const items = await listPublicArticleSitemapItems();
    const a = items.find((i) => i.slug === "topic-a");
    // Translating an article changes what that URL set offers, so the group's
    // freshness is its most recently touched edition — not whichever row the
    // query happened to return first.
    expect(a?.lastModified).toBe("2026-08-16T03:00:00.000Z");
  });

  it("expands each topic across its OWN editions only", async () => {
    const { listPublicArticleSitemapItems } = await import("../seo");
    const entries = articleSitemapEntries(await listPublicArticleSitemapItems());
    // topic-a is trilingual (3 URLs, reciprocal alternates); topic-b is a legacy
    // single-language article (1 URL, no alternates). Asserting the total pins
    // both halves of the reconciliation in one number.
    expect(entries).toHaveLength(LOCALES.length + 1);
    const a = entries.filter((e) => e.url.includes("topic-a"));
    const b = entries.filter((e) => e.url.includes("topic-b"));
    expect(a).toHaveLength(LOCALES.length);
    for (const e of a) expect(Object.keys(e.alternates?.languages ?? {}).sort()).toEqual(["de", "en", "fa"]);
    expect(b).toHaveLength(1);
    expect(b[0].url).toBe(`${BASE_URL}/en/articles/topic-b`);
    expect(b[0].alternates).toBeUndefined();
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size, "sitemap must contain no duplicate <loc>").toBe(urls.length);
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
      ...articleSitemapEntries([{ slug: "a", languages: ["en"], lastModified: null }]),
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
