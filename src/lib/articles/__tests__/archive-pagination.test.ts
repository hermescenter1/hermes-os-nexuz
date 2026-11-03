import { describe, it, expect, vi, beforeEach } from "vitest";
import { archivePageHref, parseArchivePage } from "@/lib/articles/archive-page";

/**
 * The Journal archive at /{locale}/articles/latest stopped at the newest 12
 * articles and `?page=2` returned page 1, so most of the corpus was linked
 * from no listing page (live audit, 2026-11-03: 38 of 58). These tests pin the
 * paginated read; the oracle for the database read is the Prisma argument
 * object.
 */

const findManyCalls: Array<Record<string, unknown>> = [];
const countCalls: Array<Record<string, unknown>> = [];
let total = 0;
let prismaAvailable = true;
let failRead = false;

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () =>
    prismaAvailable
      ? {
          article: {
            findMany: async (args: Record<string, unknown>) => {
              findManyCalls.push(args);
              if (failRead) throw new Error("connection reset");
              return [];
            },
            count: async (args: Record<string, unknown>) => {
              countCalls.push(args);
              return total;
            },
          },
        }
      : null,
}));

const { getArticleArchivePage, ARCHIVE_PAGE_SIZE } = await import("@/lib/articles/db");

describe("parseArchivePage", () => {
  it("treats a missing parameter as the canonical first page", () => {
    expect(parseArchivePage(undefined)).toEqual({ kind: "first" });
  });

  it("flags ?page=1 as a duplicate of the canonical first page", () => {
    expect(parseArchivePage("1")).toEqual({ kind: "explicitFirst" });
  });

  it.each(["2", "3", "17", "99999"])("accepts page %s", (raw) => {
    expect(parseArchivePage(raw)).toEqual({ kind: "page", page: Number(raw) });
  });

  it.each(["0", "-1", "2.5", "02", "abc", "", " 2", "1e3", "100000"])("rejects %j", (raw) => {
    expect(parseArchivePage(raw)).toEqual({ kind: "invalid" });
  });

  it("rejects a repeated ?page= parameter", () => {
    expect(parseArchivePage(["2", "3"])).toEqual({ kind: "invalid" });
  });
});

describe("archivePageHref", () => {
  it("gives the first page no parameter, so it has one URL", () => {
    expect(archivePageHref("/de/articles/latest", 1)).toBe("/de/articles/latest");
    expect(archivePageHref("/de/articles/latest", 3)).toBe("/de/articles/latest?page=3");
  });
});

describe("getArticleArchivePage", () => {
  beforeEach(() => {
    findManyCalls.length = 0;
    countCalls.length = 0;
    total = 0;
    prismaAvailable = true;
    failRead = false;
  });

  it.each([
    ["fa", "FA"],
    ["en", "EN"],
    ["de", "DE"],
  ])("scopes /%s to published public %s editions, with no fallback", async (locale, language) => {
    await getArticleArchivePage(locale, 1);
    const where = { status: "PUBLISHED", visibility: "PUBLIC", language };
    expect(findManyCalls).toHaveLength(1);
    expect(countCalls).toHaveLength(1);
    expect(findManyCalls[0].where).toEqual(where);
    expect(countCalls[0].where).toEqual(where);
  });

  it("reads exactly one page, newest first, with a stable tie-break", async () => {
    total = 58;
    const result = await getArticleArchivePage("en", 3);
    expect(findManyCalls[0].skip).toBe(2 * ARCHIVE_PAGE_SIZE);
    expect(findManyCalls[0].take).toBe(ARCHIVE_PAGE_SIZE);
    expect(findManyCalls[0].orderBy).toEqual([{ publishedAt: "desc" }, { id: "asc" }]);
    expect(result).toMatchObject({ page: 3, total: 58, totalPages: Math.ceil(58 / ARCHIVE_PAGE_SIZE) });
  });

  it("reads the list projection, never full article bodies", async () => {
    await getArticleArchivePage("en", 1);
    const select = findManyCalls[0].select as Record<string, unknown>;
    expect(findManyCalls[0].include).toBeUndefined();
    expect(select.excerpt).toBe(true);
    expect(select).not.toHaveProperty("content");
  });

  it("reports an empty archive as zero pages, not as an outage", async () => {
    expect(await getArticleArchivePage("de", 1)).toEqual({ items: [], page: 1, total: 0, totalPages: 0 });
  });

  it("returns null when the database is unavailable", async () => {
    prismaAvailable = false;
    expect(await getArticleArchivePage("en", 2)).toBeNull();
  });

  it("returns null when the read fails", async () => {
    failRead = true;
    expect(await getArticleArchivePage("en", 2)).toBeNull();
  });
});
