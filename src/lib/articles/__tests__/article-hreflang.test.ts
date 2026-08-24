import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * PHASE 106B — ARTICLE PAGE HREFLANG TRUTHFULNESS.
 *
 * Production shipped 50 trilingual Journal topics whose HTML carried a
 * canonical and NO hreflang at all: the detail page still declared
 * `contentLocales: [article.language.toLowerCase()]`, a DISCOVERY-2A-era
 * expression of "an article exists in exactly one language" that Phase 106
 * invalidated.
 *
 * The rule these tests defend is unchanged from DISCOVERY-2A — never advertise
 * a translation that does not exist — so they assert it in BOTH directions: a
 * real trilingual group must emit all three reciprocal alternates, and a
 * single-language topic must still emit none.
 *
 * The fake `article.findMany` below genuinely APPLIES the `where` clause it is
 * handed and returns ONLY the projected columns. That is deliberate: a mock
 * that ignored the predicate would hand drafts and de-indexed rows to a caller
 * that had dropped the filter, and every exclusion test here would pass against
 * a broken implementation.
 */

interface Row {
  slug: string;
  language: string;
  status: string;
  visibility: string;
  noIndex: boolean;
  content: string;
  publishedAt: Date;
  updatedAt: Date;
}

function row(over: Partial<Row> & Pick<Row, "slug" | "language">): Row {
  return {
    status: "PUBLISHED",
    visibility: "PUBLIC",
    noIndex: false,
    content: "BODY-MUST-NEVER-BE-SELECTED",
    publishedAt: new Date("2026-08-16T00:00:00Z"),
    updatedAt: new Date("2026-08-16T00:00:00Z"),
    ...over,
  };
}

/** The corpus every test in this file reads. */
const ROWS: Row[] = [
  // A genuine Phase 106 trilingual topic.
  row({ slug: "opc-ua-primer", language: "EN" }),
  row({ slug: "opc-ua-primer", language: "FA" }),
  row({ slug: "opc-ua-primer", language: "DE" }),
  // A legacy single-language topic.
  row({ slug: "plc-alarm-flood", language: "EN" }),
  // A partially translated topic.
  row({ slug: "scada-historian", language: "EN" }),
  row({ slug: "scada-historian", language: "FA" }),
  // One indexable edition plus siblings that must never be advertised.
  row({ slug: "mixed-visibility", language: "EN" }),
  row({ slug: "mixed-visibility", language: "FA", status: "DRAFT" }),
  row({ slug: "mixed-visibility", language: "DE", visibility: "PRIVATE" }),
  // A trilingual topic whose German edition the editor de-indexed.
  row({ slug: "deindexed-sibling", language: "EN" }),
  row({ slug: "deindexed-sibling", language: "FA" }),
  row({ slug: "deindexed-sibling", language: "DE", noIndex: true }),
];

const findMany = vi.fn(async (args: Record<string, unknown>) => {
  const where = (args.where ?? {}) as Record<string, unknown>;
  const select = (args.select ?? {}) as Record<string, unknown>;
  const matched = ROWS.filter((r) =>
    Object.entries(where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
  ).slice(0, typeof args.take === "number" ? args.take : undefined);
  return matched.map((r) =>
    Object.fromEntries(
      Object.keys(select).map((k) => [k, (r as unknown as Record<string, unknown>)[k]]),
    ),
  );
});

vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => ({ article: { findMany } }) }));

const {
  ARTICLE_SITEMAP_WHERE,
  ARTICLE_TRANSLATION_GROUP_MAX,
  articleSitemapEntries,
  getPublicArticleLanguagesBySlug,
  listPublicArticleSitemapItems,
  resolveArticleContentLocales,
} = await import("../seo");
const { buildMetadata } = await import("@/lib/seo/metadata");
const { BASE_URL, DEFAULT_LOCALE, LOCALES } = await import("@/lib/seo/config");

// A BLOCK body, not a concise one: `mockClear()` returns the mock itself, and
// vitest treats a function returned from a hook as that hook's teardown — it
// would call `findMany()` with no arguments after every test.
beforeEach(() => {
  findMany.mockClear();
});

/** The metadata the detail page builds, composed exactly as `page.tsx` does. */
function pageMetadata(opts: {
  locale: string;
  slug: string;
  servedLanguage: string;
  siblingLocales: readonly string[];
  title?: string;
}) {
  return buildMetadata({
    locale: opts.locale,
    path: `/articles/${opts.slug}`,
    title: opts.title ?? "t",
    description: "d",
    ogType: "article",
    contentLocales: resolveArticleContentLocales({
      requestedLocale: opts.locale,
      servedLanguage: opts.servedLanguage,
      siblingLocales: opts.siblingLocales,
    }),
  });
}

function languages(meta: ReturnType<typeof buildMetadata>): Record<string, string> | undefined {
  return meta.alternates?.languages as Record<string, string> | undefined;
}

describe("the translation-group lookup is bounded, projected and predicated", () => {
  it("selects ONLY language — never the article body", async () => {
    await getPublicArticleLanguagesBySlug("opc-ua-primer");
    const args = findMany.mock.calls[0][0] as Record<string, unknown>;
    expect(args.select).toEqual({ language: true });
    expect(args).not.toHaveProperty("include");
    // An hreflang set needs one column. Three full technical article bodies
    // dragged through the driver on every detail render is the regression this
    // pins shut.
    expect(JSON.stringify(args.select)).not.toContain("content");
  });

  it("reads the SAME predicate the sitemap reads, narrowed to one slug", async () => {
    await getPublicArticleLanguagesBySlug("opc-ua-primer");
    const args = findMany.mock.calls[0][0] as Record<string, unknown>;
    expect(args.where).toEqual({ ...ARTICLE_SITEMAP_WHERE, slug: "opc-ua-primer" });
  });

  it("is bounded by the number of active locales", async () => {
    await getPublicArticleLanguagesBySlug("opc-ua-primer");
    const args = findMany.mock.calls[0][0] as Record<string, unknown>;
    expect(args.take).toBe(ARTICLE_TRANSLATION_GROUP_MAX);
    expect(ARTICLE_TRANSLATION_GROUP_MAX).toBe(LOCALES.length);
  });

  it("normalises a percent-encoded route slug to the persisted one", async () => {
    // Phase 83: the group lookup must resolve the same slug the detail read did,
    // or an encoded URL would render an article and advertise nothing.
    const encoded = await getPublicArticleLanguagesBySlug("opc%2Dua%2Dprimer");
    expect([...encoded].sort()).toEqual(["de", "en", "fa"]);
  });

  it("never queries at all for a slug that could not be a path segment", async () => {
    expect(await getPublicArticleLanguagesBySlug("../../etc/passwd")).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("only genuine, public, indexable siblings are returned", () => {
  it("a trilingual topic reports all three editions", async () => {
    expect([...(await getPublicArticleLanguagesBySlug("opc-ua-primer"))].sort()).toEqual([
      "de",
      "en",
      "fa",
    ]);
  });

  it("a single-language topic reports exactly one", async () => {
    expect(await getPublicArticleLanguagesBySlug("plc-alarm-flood")).toEqual(["en"]);
  });

  it("a partially translated topic reports exactly its two editions", async () => {
    expect([...(await getPublicArticleLanguagesBySlug("scada-historian"))].sort()).toEqual([
      "en",
      "fa",
    ]);
  });

  it("excludes an unpublished and a private sibling", async () => {
    expect(await getPublicArticleLanguagesBySlug("mixed-visibility")).toEqual(["en"]);
  });

  it("excludes a de-indexed sibling", async () => {
    expect([...(await getPublicArticleLanguagesBySlug("deindexed-sibling"))].sort()).toEqual([
      "en",
      "fa",
    ]);
  });

  it("returns [] rather than throwing when the database is unreachable", async () => {
    findMany.mockRejectedValueOnce(new Error("connection refused"));
    expect(await getPublicArticleLanguagesBySlug("opc-ua-primer")).toEqual([]);
  });
});

describe("the page's declared content locales", () => {
  it("a trilingual group declares all three, default locale first", () => {
    for (const locale of LOCALES) {
      const served = locale === "fa" ? "FA" : locale === "en" ? "EN" : "DE";
      expect(
        resolveArticleContentLocales({
          requestedLocale: locale,
          servedLanguage: served,
          siblingLocales: ["en", "fa", "de"],
        }),
      ).toEqual([DEFAULT_LOCALE, ...LOCALES.filter((l) => l !== DEFAULT_LOCALE)]);
    }
  });

  it("keeps the served edition even when the editor de-indexed exactly it", () => {
    // The page still has to canonicalise to the text it served; its own
    // `noIndex` robots directive is what keeps it out of the index, and its
    // siblings — computing their own sets — do not link back to it.
    expect(
      resolveArticleContentLocales({
        requestedLocale: "de",
        servedLanguage: "DE",
        siblingLocales: ["en", "fa"],
      }),
    ).toContain("de");
  });

  it("leads with the served edition when the requested locale has none", () => {
    // /de served an English fallback row: the canonical must point at /en, the
    // URL that really serves this text.
    expect(
      resolveArticleContentLocales({
        requestedLocale: "de",
        servedLanguage: "EN",
        siblingLocales: ["en"],
      }),
    ).toEqual(["en"]);
  });

  it("never invents a locale the platform does not route", () => {
    expect(
      resolveArticleContentLocales({
        requestedLocale: "en",
        servedLanguage: "EN",
        siblingLocales: ["en", "ru", "zz"],
      }),
    ).toEqual(["en"]);
  });
});

describe("rendered metadata — reciprocal alternates for a real trilingual topic", () => {
  it.each(LOCALES)(
    "under /%s: canonical is its own locale and all three hreflangs are present",
    async (locale) => {
      const siblingLocales = await getPublicArticleLanguagesBySlug("opc-ua-primer");
      const meta = pageMetadata({
        locale,
        slug: "opc-ua-primer",
        servedLanguage: locale.toUpperCase(),
        siblingLocales,
      });

      expect(meta.alternates?.canonical).toBe(`${BASE_URL}/${locale}/articles/opc-ua-primer`);
      const langs = languages(meta)!;
      expect(langs.en).toBe(`${BASE_URL}/en/articles/opc-ua-primer`);
      expect(langs.fa).toBe(`${BASE_URL}/fa/articles/opc-ua-primer`);
      expect(langs.de).toBe(`${BASE_URL}/de/articles/opc-ua-primer`);
      // x-default must be the SAME for every member of the group.
      expect(langs["x-default"]).toBe(`${BASE_URL}/${DEFAULT_LOCALE}/articles/opc-ua-primer`);
      expect(Object.keys(langs)).toHaveLength(LOCALES.length + 1);
    },
  );

  it("the title stays that of the edition actually served", async () => {
    const siblingLocales = await getPublicArticleLanguagesBySlug("opc-ua-primer");
    const meta = pageMetadata({
      locale: "de",
      slug: "opc-ua-primer",
      servedLanguage: "DE",
      siblingLocales,
      title: "OPC-UA-Grundlagen",
    });
    // Only the alternate set changed in Phase 106B — the served edition still
    // owns title, description and og:.
    expect(meta.title).toBe("OPC-UA-Grundlagen");
    expect(meta.openGraph?.title).toBe("OPC-UA-Grundlagen");
  });
});

describe("rendered metadata — nothing is fabricated", () => {
  it("a single-language topic emits NO alternates under any locale", async () => {
    const siblingLocales = await getPublicArticleLanguagesBySlug("plc-alarm-flood");
    for (const locale of LOCALES) {
      const meta = pageMetadata({
        locale,
        slug: "plc-alarm-flood",
        servedLanguage: "EN",
        siblingLocales,
      });
      expect(meta.alternates?.canonical).toBe(`${BASE_URL}/en/articles/plc-alarm-flood`);
      expect(languages(meta)).toBeUndefined();
      const serialised = JSON.stringify(meta);
      expect(serialised).not.toContain("/fa/articles/plc-alarm-flood");
      expect(serialised).not.toContain("/de/articles/plc-alarm-flood");
    }
  });

  it("a bilingual topic emits exactly its two alternates", async () => {
    const siblingLocales = await getPublicArticleLanguagesBySlug("scada-historian");
    const meta = pageMetadata({
      locale: "en",
      slug: "scada-historian",
      servedLanguage: "EN",
      siblingLocales,
    });
    const langs = languages(meta)!;
    expect(Object.keys(langs).sort()).toEqual(["en", "fa", "x-default"]);
    expect(JSON.stringify(meta)).not.toContain("/de/articles/scada-historian");
  });

  it("a de-indexed sibling never becomes an alternate", async () => {
    const siblingLocales = await getPublicArticleLanguagesBySlug("deindexed-sibling");
    const meta = pageMetadata({
      locale: "en",
      slug: "deindexed-sibling",
      servedLanguage: "EN",
      siblingLocales,
    });
    expect(JSON.stringify(meta)).not.toContain("/de/articles/deindexed-sibling");
  });

  it("an unpublished or private sibling never becomes an alternate", async () => {
    const siblingLocales = await getPublicArticleLanguagesBySlug("mixed-visibility");
    const meta = pageMetadata({
      locale: "en",
      slug: "mixed-visibility",
      servedLanguage: "EN",
      siblingLocales,
    });
    expect(languages(meta)).toBeUndefined();
    const serialised = JSON.stringify(meta);
    expect(serialised).not.toContain("/fa/articles/mixed-visibility");
    expect(serialised).not.toContain("/de/articles/mixed-visibility");
  });
});

describe("page and sitemap describe the same translation group", () => {
  it.each([
    "opc-ua-primer",
    "plc-alarm-flood",
    "scada-historian",
    "deindexed-sibling",
    "mixed-visibility",
  ])("%s: the page's hreflang set equals the sitemap's alternate set", async (slug) => {
    const pageLocales = await getPublicArticleLanguagesBySlug(slug);
    const entries = articleSitemapEntries(await listPublicArticleSitemapItems()).filter((e) =>
      e.url.endsWith(`/articles/${slug}`),
    );

    const sitemapLocales = entries.map((e) => e.url.split("/")[3]);
    expect([...sitemapLocales].sort()).toEqual([...pageLocales].sort());

    // And the reciprocal alternates the sitemap declares agree too.
    for (const entry of entries) {
      const declared = Object.keys(entry.alternates?.languages ?? {});
      expect(declared.sort()).toEqual(pageLocales.length > 1 ? [...pageLocales].sort() : []);
    }
  });
});
