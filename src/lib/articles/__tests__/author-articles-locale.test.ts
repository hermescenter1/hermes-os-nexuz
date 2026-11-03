import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The author profile links each listed article as `/{locale}/articles/{slug}`.
 * `getAuthorArticles` returned every edition in every language, so /en and /de
 * profiles published links to Persian articles under the wrong prefix — the
 * source of the cross-locale URLs Search Console reported (2026-11) as "Page
 * with redirect", "Alternate page with proper canonical tag" and, for Persian
 * slugs, "Server error (5xx)". The oracle is the Prisma argument object.
 */

const calls: Array<Record<string, unknown>> = [];

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => ({
    article: {
      findMany: async (args: Record<string, unknown>) => {
        calls.push(args);
        return [];
      },
    },
  }),
}));

const { getAuthorArticles } = await import("@/lib/articles/db");

describe("getAuthorArticles", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it.each([
    ["fa", "FA"],
    ["en", "EN"],
    ["de", "DE"],
  ])("scopes /%s to %s editions only", async (locale, language) => {
    await getAuthorArticles("editorial", locale);
    expect(calls).toHaveLength(1);
    expect(calls[0].where).toEqual({
      status: "PUBLISHED",
      visibility: "PUBLIC",
      author: { handle: "editorial" },
      language,
    });
  });

  it("does not fall back to other languages when the locale has none", async () => {
    await getAuthorArticles("editorial", "de");
    // One read only: a second, unscoped read is exactly the cross-locale leak.
    expect(calls).toHaveLength(1);
  });

  it("reads the list projection, never full article bodies", async () => {
    await getAuthorArticles("editorial", "en");
    expect(calls[0].include).toBeUndefined();
    const select = calls[0].select as Record<string, unknown>;
    expect(select.excerpt).toBe(true);
    expect(select).not.toHaveProperty("content");
  });

  it("is bounded and deterministically ordered", async () => {
    await getAuthorArticles("editorial", "en");
    expect(calls[0].take).toBeGreaterThan(0);
    expect(calls[0].orderBy).toEqual([{ publishedAt: "desc" }, { id: "asc" }]);
  });
});
