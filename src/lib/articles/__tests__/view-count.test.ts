import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A page view must not mark an article as modified.
 *
 * `Article.updatedAt` is `@updatedAt`, which the Prisma CLIENT stamps on every
 * `update`. The view counter used `article.update`, so each read rewrote
 * updatedAt — and updatedAt is what sitemap <lastmod>, Article.dateModified and
 * article:modified_time publish. Live on 2026-11-02, 166 of 179 article URLs
 * carried a lastmod from the last two days on articles published in August.
 */

const calls: { raw: Array<{ sql: string; values: unknown[] }>; update: unknown[] } = { raw: [], update: [] };

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => ({
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.raw.push({ sql: strings.join("?"), values });
      return 1;
    },
    article: {
      update: async (args: unknown) => {
        calls.update.push(args);
        return {};
      },
    },
  }),
}));

const { incrementArticleViewCount } = await import("@/lib/articles/db");

describe("incrementArticleViewCount", () => {
  beforeEach(() => {
    calls.raw.length = 0;
    calls.update.length = 0;
  });

  it("increments viewCount with a raw statement bound to the article id", async () => {
    await incrementArticleViewCount("art_1");
    expect(calls.raw).toHaveLength(1);
    expect(calls.raw[0].sql).toBe('UPDATE "Article" SET "viewCount" = "viewCount" + 1 WHERE "id" = ?');
    expect(calls.raw[0].values).toEqual(["art_1"]);
  });

  it("never goes through article.update, which would stamp @updatedAt", async () => {
    await incrementArticleViewCount("art_1");
    expect(calls.update).toHaveLength(0);
  });

  it("does not touch updatedAt in the statement it sends", async () => {
    await incrementArticleViewCount("art_1");
    expect(calls.raw[0].sql).not.toMatch(/updatedAt/i);
  });
});
