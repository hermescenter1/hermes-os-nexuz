import { describe, it, expect, vi } from "vitest";
import {
  ARTICLE_SITEMAP_WHERE,
  ARTICLE_SITEMAP_MAX,
  articleSitemapEntries,
  authorSitemapEntries,
} from "../seo";
import { BASE_URL, LOCALES } from "@/lib/seo/config";

/**
 * Rows as PostgreSQL returns them once a topic is trilingual: three Article
 * rows sharing one slug. Declared here so the dedup test below reproduces the
 * exact shape that produced duplicate sitemap URLs in the rehearsal.
 */
const TRILINGUAL_ROWS = [
  { slug: "topic-a", publishedAt: new Date("2026-08-16T00:00:00Z"), updatedAt: new Date("2026-08-16T01:00:00Z") },
  { slug: "topic-a", publishedAt: new Date("2026-08-16T00:00:00Z"), updatedAt: new Date("2026-08-16T03:00:00Z") },
  { slug: "topic-a", publishedAt: new Date("2026-08-16T00:00:00Z"), updatedAt: new Date("2026-08-16T02:00:00Z") },
  { slug: "topic-b", publishedAt: new Date("2026-08-15T00:00:00Z"), updatedAt: new Date("2026-08-15T05:00:00Z") },
];

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => ({ article: { findMany: async () => TRILINGUAL_ROWS } }),
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
  const entries = articleSitemapEntries([
    { slug: "opc-ua-basics", lastModified: "2026-03-04T10:00:00.000Z" },
    { slug: "no-timestamp", lastModified: null },
  ]);

  it("emits one canonical URL per active locale", () => {
    expect(entries).toHaveLength(2 * LOCALES.length);
    for (const locale of LOCALES) {
      expect(entries.map((e) => e.url)).toContain(
        `${BASE_URL}/${locale}/articles/opc-ua-basics`,
      );
    }
  });

  it("every URL is absolute on the canonical host", () => {
    for (const e of entries) {
      expect(e.url.startsWith(`${BASE_URL}/`)).toBe(true);
      expect(e.url).not.toMatch(/localhost|staging|www\./i);
    }
  });

  it("carries reciprocal alternates for every locale", () => {
    const languages = entries[0].alternates?.languages ?? {};
    expect(Object.keys(languages).sort()).toEqual([...LOCALES].sort());
  });

  it("uses the row's real timestamp, and omits lastModified when there is none", () => {
    const dated = entries.filter((e) => e.url.includes("opc-ua-basics"));
    for (const e of dated) expect(e.lastModified).toBe("2026-03-04T10:00:00.000Z");
    const undated = entries.filter((e) => e.url.includes("no-timestamp"));
    for (const e of undated) expect("lastModified" in e).toBe(false);
  });

  it("never invents a timestamp for an undated article", () => {
    const undated = articleSitemapEntries([{ slug: "x", lastModified: null }]);
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

  it("takes the NEWEST lastModified across the group's editions", async () => {
    const { listPublicArticleSitemapItems } = await import("../seo");
    const items = await listPublicArticleSitemapItems();
    const a = items.find((i) => i.slug === "topic-a");
    // Translating an article changes what that URL set offers, so the group's
    // freshness is its most recently touched edition — not whichever row the
    // query happened to return first.
    expect(a?.lastModified).toBe("2026-08-16T03:00:00.000Z");
  });

  it("produces exactly one URL per locale per topic once expanded", async () => {
    const { listPublicArticleSitemapItems } = await import("../seo");
    const entries = articleSitemapEntries(await listPublicArticleSitemapItems());
    expect(entries).toHaveLength(2 * LOCALES.length);
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size, "sitemap must contain no duplicate <loc>").toBe(urls.length);
  });
});

describe("author entries", () => {
  const entries = authorSitemapEntries([{ handle: "h-forozandeh" }]);

  it("emits one profile URL per locale with no fabricated lastModified", () => {
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
      ...articleSitemapEntries([{ slug: "a", lastModified: null }]),
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
