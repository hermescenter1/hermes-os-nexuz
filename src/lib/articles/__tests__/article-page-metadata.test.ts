import { describe, it, expect, vi } from "vitest";

/**
 * PHASE 106B — the DETAIL PAGE's own `generateMetadata`, not a re-composition of
 * it.
 *
 * `article-hreflang.test.ts` pins the helpers. This file pins the caller: it
 * imports the real route module and asserts on what it returns, so reverting
 * `page.tsx` to `contentLocales: [article.language.toLowerCase()]` — the exact
 * defect that shipped — turns these red. A test that only exercised the helpers
 * would stay green through that revert.
 */

const ROWS = [
  { slug: "opc-ua-primer", language: "EN", status: "PUBLISHED", visibility: "PUBLIC", noIndex: false },
  { slug: "opc-ua-primer", language: "FA", status: "PUBLISHED", visibility: "PUBLIC", noIndex: false },
  { slug: "opc-ua-primer", language: "DE", status: "PUBLISHED", visibility: "PUBLIC", noIndex: false },
  { slug: "plc-alarm-flood", language: "EN", status: "PUBLISHED", visibility: "PUBLIC", noIndex: false },
];

// The group lookup reads the real `@/lib/articles/seo` module against this fake
// Prisma, which honours the `where` clause it is given.
vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => ({
    article: {
      findMany: async (args: Record<string, unknown>) => {
        const where = (args.where ?? {}) as Record<string, unknown>;
        const select = Object.keys((args.select ?? {}) as Record<string, unknown>);
        return ROWS.filter((r) =>
          Object.entries(where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
        ).map((r) =>
          Object.fromEntries(select.map((k) => [k, (r as unknown as Record<string, unknown>)[k]])),
        );
      },
    },
  }),
}));

/** The edition the detail read resolves for a given locale. */
vi.mock("@/lib/articles/db", () => ({
  getArticleDetailBySlug: async (slug: string, locale: string) => {
    const language = { fa: "FA", en: "EN", de: "DE" }[locale] ?? "EN";
    const row = ROWS.find((r) => r.slug === slug && r.language === language)
      ?? ROWS.find((r) => r.slug === slug);
    if (!row) return null;
    return {
      id: `${row.slug}-${row.language}`,
      slug: row.slug,
      language: row.language,
      status: row.status,
      visibility: row.visibility,
      noIndex: row.noIndex,
      title: `TITLE-${row.language}`,
      seoTitle: null,
      seoDescription: null,
      excerpt: `EXCERPT-${row.language}`,
      coverImageUrl: null,
      ogImageUrl: null,
      publishedAt: "2026-08-16T00:00:00.000Z",
      updatedAt: "2026-08-16T00:00:00.000Z",
      tags: [],
      category: null,
      author: { displayName: "A", handle: "a" },
    };
  },
  getArticleFeed: async () => ({ latest: [], trending: [] }),
  incrementArticleViewCount: async () => undefined,
}));

const { generateMetadata } = await import("@/app/[locale]/articles/[slug]/page");
const { BASE_URL, DEFAULT_LOCALE, LOCALES } = await import("@/lib/seo/config");

function meta(locale: string, slug: string) {
  return generateMetadata({ params: Promise.resolve({ locale, slug }) });
}

function languages(m: Awaited<ReturnType<typeof meta>>): Record<string, string> | undefined {
  return (m as { alternates?: { languages?: Record<string, string> } }).alternates?.languages;
}

describe("generateMetadata — a trilingual topic", () => {
  it.each(LOCALES)("/%s emits its own canonical and all three reciprocal hreflangs", async (locale) => {
    const m = await meta(locale, "opc-ua-primer");
    expect((m as { alternates?: { canonical?: string } }).alternates?.canonical).toBe(
      `${BASE_URL}/${locale}/articles/opc-ua-primer`,
    );
    const langs = languages(m)!;
    expect(langs.en).toBe(`${BASE_URL}/en/articles/opc-ua-primer`);
    expect(langs.fa).toBe(`${BASE_URL}/fa/articles/opc-ua-primer`);
    expect(langs.de).toBe(`${BASE_URL}/de/articles/opc-ua-primer`);
    expect(langs["x-default"]).toBe(`${BASE_URL}/${DEFAULT_LOCALE}/articles/opc-ua-primer`);
  });

  it("still titles the page from the edition actually served", async () => {
    // Only the alternate set changed in Phase 106B.
    expect((await meta("de", "opc-ua-primer")).title).toBe("TITLE-DE");
    expect((await meta("fa", "opc-ua-primer")).title).toBe("TITLE-FA");
  });
});

describe("generateMetadata — a single-language topic", () => {
  it("fabricates no alternates under any locale", async () => {
    for (const locale of LOCALES) {
      const m = await meta(locale, "plc-alarm-flood");
      expect((m as { alternates?: { canonical?: string } }).alternates?.canonical).toBe(
        `${BASE_URL}/en/articles/plc-alarm-flood`,
      );
      expect(languages(m)).toBeUndefined();
      const serialised = JSON.stringify(m);
      expect(serialised).not.toContain("/fa/articles/plc-alarm-flood");
      expect(serialised).not.toContain("/de/articles/plc-alarm-flood");
    }
  });
});
