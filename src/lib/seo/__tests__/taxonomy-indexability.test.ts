import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";
import {
  resolveTaxonomyIndexability,
  taxonomyMetadata,
  TAXONOMY_REFUSAL_ALTERNATES,
} from "../taxonomy-indexability";

/**
 * Journal taxonomy archives — the conservative policy, proved through the REAL
 * routes.
 *
 * WHY THIS FILE DRIVES THE ROUTES AND NOT ONLY THE POLICY FUNCTION
 * ---------------------------------------------------------------
 * A policy function that returns the right answer proves nothing if a route
 * never calls it, or calls it and then overrides the result. So the real
 * `generateMetadata` of both archive routes runs here against a Prisma double,
 * through the real `@/lib/articles/db` — which means the real
 * `withLanguageFallback` too. A regression that reinstates an indexable branch,
 * re-adds an hreflang cluster, or makes indexability depend on an article count
 * again fails here rather than in a search index.
 *
 * WHAT THE POLICY IS, AND WHY
 * ---------------------------
 * Every existing tag and category is `noindex, follow`; a missing row is a real
 * 404. Three repository facts force that, and they are asserted below so the
 * policy cannot quietly outlive them:
 *
 *   · `ArticleTag` has no description field at all;
 *   · `ArticleCategory.description` is a SINGLE non-localized column;
 *   · the category article read falls back to other languages when the
 *     requested language has nothing.
 *
 * So no archive can prove unique, reviewed, locale-specific landing-page
 * content, and this phase refuses to claim otherwise. The prerequisites for a
 * future indexable archive are documented in the policy module and in
 * `docs/release/seo-author-archive-governance.md`; none of them is partially
 * implemented here.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const NOT_FOUND = "NEXT_NOT_FOUND_SENTINEL";
const MESSAGES: Record<string, unknown> = { en, fa, de };

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error(NOT_FOUND);
  },
}));

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => {},
  getTranslations: async ({ locale, namespace }: { locale?: string; namespace?: string } = {}) =>
    createTranslator({
      locale: locale ?? "en",
      messages: (MESSAGES[locale ?? "en"] ?? MESSAGES.en) as never,
      namespace: (namespace ?? "journal") as never,
    }),
}));

// The archive body is a client feed with its own data flow; this suite is about
// what the SERVER asserts around it.
vi.mock("@/components/articles/ArticlesFeedClient", () => ({
  ArticlesFeedClient: () => null,
}));

interface CatRow {
  id: string; slug: string; name: string; nameFa: string; nameDe: string | null;
  description: string | null; color: string; isActive: boolean; sortOrder: number;
}
interface ArtRow {
  id: string; slug: string; title: string; language: string;
  status: string; visibility: string; categorySlug: string | null; tagSlugs: string[];
}

const store = vi.hoisted(() => ({
  categories: [] as unknown[],
  tags: [] as unknown[],
  articles: [] as unknown[],
  /** Every `where` clause an ARTICLE read was given, in order. */
  articleQueries: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => ({
    articleCategory: {
      findMany: async (args: { where?: { isActive?: boolean } }) => {
        const want = args.where?.isActive;
        // The double honours the predicate it was GIVEN rather than
        // re-implementing visibility: a reader that stopped sending
        // `isActive: true` would start seeing hidden rows and fail case 8.
        return (store.categories as CatRow[]).filter(
          (c) => want === undefined || c.isActive === want,
        );
      },
    },
    articleTag: { findMany: async () => store.tags },
    article: {
      findMany: async (args: { where?: Record<string, unknown> }) => {
        const w = (args.where ?? {}) as Record<string, unknown>;
        store.articleQueries.push(w);
        const catSlug = (w.category as { slug?: string } | undefined)?.slug;
        const tagSlug = (w.tags as { some?: { tag?: { slug?: string } } } | undefined)?.some?.tag
          ?.slug;
        return (store.articles as ArtRow[]).filter((a) => {
          if (w.status !== undefined && a.status !== w.status) return false;
          if (w.visibility !== undefined && a.visibility !== w.visibility) return false;
          if (w.language !== undefined && a.language !== w.language) return false;
          if (catSlug !== undefined && a.categorySlug !== catSlug) return false;
          if (tagSlug !== undefined && !a.tagSlugs.includes(tagSlug)) return false;
          return true;
        });
      },
    },
  }),
}));

/* The routes under test, imported after the hoisted mocks above. */
import TagPage, { generateMetadata as tagMetadata } from "@/app/[locale]/articles/tag/[slug]/page";
import CategoryPage, {
  generateMetadata as categoryMetadata,
} from "@/app/[locale]/articles/category/[slug]/page";

const cat = (over: Partial<CatRow>): CatRow => ({
  id: "c", slug: "s", name: "N", nameFa: "ن", nameDe: null,
  description: "Curated editorial copy for this archive.", color: "signal",
  isActive: true, sortOrder: 1, ...over,
});
const art = (over: Partial<ArtRow>): ArtRow => ({
  id: "a", slug: "a", title: "T", language: "EN",
  status: "PUBLISHED", visibility: "PUBLIC", categorySlug: null, tagSlugs: [], ...over,
});

const CURATED = "curated-cat";
const FALLBACK_ONLY = "fallback-only-cat";
const EMPTY = "empty-cat";
const NO_DESC = "no-description-cat";
const HIDDEN = "inactive-cat";
const POPULATED_TAG = "populated-tag";
const BARE_TAG = "bare-tag";

beforeEach(() => {
  store.articleQueries = [];
  store.categories = [
    cat({ id: "c1", slug: CURATED, name: "Curated" }),
    cat({ id: "c2", slug: FALLBACK_ONLY, name: "Fallback Only" }),
    cat({ id: "c3", slug: EMPTY, name: "Empty" }),
    cat({ id: "c4", slug: NO_DESC, name: "No Description", description: null }),
    cat({ id: "c5", slug: HIDDEN, name: "Hidden", isActive: false }),
  ];
  store.tags = [
    { id: "t1", slug: POPULATED_TAG, name: "Populated", nameFa: "پرمقاله" },
    { id: "t2", slug: BARE_TAG, name: "Bare", nameFa: null },
  ];
  store.articles = [
    // A Persian edition, so the curated category genuinely has an article in /fa.
    art({ id: "a1", slug: "a1", language: "FA", categorySlug: CURATED, tagSlugs: [POPULATED_TAG] }),
    art({ id: "a2", slug: "a2", language: "EN", categorySlug: CURATED, tagSlugs: [POPULATED_TAG] }),
    // English only: a /fa or /de request for this category hits the language
    // fallback and still receives rows.
    art({
      id: "a3", slug: "a3", language: "EN", categorySlug: FALLBACK_ONLY, tagSlugs: [POPULATED_TAG],
    }),
    art({ id: "a4", slug: "a4", language: "EN", categorySlug: NO_DESC, tagSlugs: [] }),
  ];
});

type Meta = Awaited<ReturnType<typeof tagMetadata>>;
const params = (locale: string, slug: string) => ({ params: Promise.resolve({ locale, slug }) });

/** The refusal shape, asserted in one place so every case checks the same thing. */
function expectRefusal(meta: Meta) {
  expect(meta.robots).toEqual({
    index: false, follow: true, googleBot: { index: false, follow: true },
  });
  // No canonical, no `languages`, no `x-default` — a noindex URL must not be a
  // member of an hreflang cluster, and must not claim to be anyone's canonical.
  expect(meta.alternates).toEqual({});
  expect(meta.alternates).not.toHaveProperty("canonical");
  expect(meta.alternates).not.toHaveProperty("languages");
}

function expectRealNotFound(meta: Meta, title: string) {
  expect(meta.title).toBe(title);
  expect(meta.robots).toEqual({ index: false, follow: false });
  expect(meta.alternates).toEqual({});
}

describe("the schema facts the policy rests on", () => {
  const schema = read("prisma/schema.prisma");
  const model = (name: string) => {
    const start = schema.indexOf("model " + name + " {");
    return schema.slice(start, schema.indexOf("\n}", start));
  };

  it("gives ArticleTag no field that could hold editorial prose", () => {
    const tag = model("ArticleTag");
    expect(tag).not.toMatch(/\bdescription\b/);
    expect(tag).not.toMatch(/\bbody\b/);
    expect(tag).not.toMatch(/\bsummary\b/);
  });

  it("gives ArticleCategory exactly ONE non-localized description column", () => {
    const c = model("ArticleCategory");
    expect(c).toMatch(/\bdescription\s+String\?/);
    // The localized columns exist for the NAME only; there is no descriptionFa
    // or descriptionDe, which is why no locale can be shown to have copy of its
    // own.
    expect(c).toMatch(/\bnameFa\b/);
    expect(c).not.toMatch(/descriptionFa|descriptionDe|descriptionEn/);
  });

  it("falls back to other languages when the requested language has nothing", () => {
    const db = read("src/lib/articles/db.ts");
    const fn = db.slice(db.indexOf("async function withLanguageFallback"));
    expect(fn.slice(0, fn.indexOf("\n}"))).toContain("scoped.length > 0 ? scoped : run({})");
  });
});

describe("the policy module states one answer and keeps no future-pretending helper", () => {
  const src = read("src/lib/seo/taxonomy-indexability.ts");
  const code = src.split("\n").filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join("\n");

  it("has no INDEX_FOLLOW state at all", () => {
    // `NOINDEX_FOLLOW` contains `INDEX_FOLLOW`, so the needle is the token NOT
    // preceded by `NO` — a plain substring check would always pass.
    expect(code).not.toMatch(/(?<!NO)INDEX_FOLLOW/);
    expect(resolveTaxonomyIndexability({ exists: true })).toBe("NOINDEX_FOLLOW");
    expect(resolveTaxonomyIndexability({ exists: false })).toBe("NOT_FOUND");
  });

  it("exports no helper that only a hypothetical future design would call", () => {
    for (const dead of [
      "eligibleHreflangLocales",
      "hasEditorialCopy",
      "sitemapEligibleForTaxonomy",
      "resolveTagIndexability",
      "resolveCategoryIndexability",
      "noIndexForTaxonomy",
      "CategoryLocaleState",
      "articleCount",
    ]) {
      expect(code, dead + " is dead in this phase and must not be exported").not.toContain(dead);
    }
  });

  it("builds both outcomes from the same call, so a route has one decision point", () => {
    expect(taxonomyMetadata({ exists: false }, { notFoundTitle: "X", title: "Y" })).toEqual({
      title: "X", robots: { index: false, follow: false }, alternates: {},
    });
    expect(
      taxonomyMetadata({ exists: true }, { notFoundTitle: "X", title: "Y", description: "D" }),
    ).toEqual({
      title: "Y", description: "D",
      robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
      alternates: {},
    });
  });

  it("omits an empty description rather than emitting an empty tag", () => {
    const meta = taxonomyMetadata(
      { exists: true },
      { notFoundTitle: "X", title: "Y", description: "" },
    );
    expect(meta).not.toHaveProperty("description");
  });

  it("refuses with an EMPTY alternates object, which is what overrides the chain", () => {
    expect(Object.keys(TAXONOMY_REFUSAL_ALTERNATES)).toEqual([]);
  });
});

describe("tag archives, through the real route", () => {
  it("1/16. a missing tag is a real 404, not an indexable page", async () => {
    expectRealNotFound(await tagMetadata(params("fa", "no-such-tag")), "Tag Not Found");
    await expect(TagPage(params("fa", "no-such-tag"))).rejects.toThrow(NOT_FOUND);
  });

  it("16. an arbitrary, malformed, synthetic slug is also a real 404", async () => {
    for (const slug of ["../../etc/passwd", "%20", "a".repeat(300), "tag?x=1", "<script>"]) {
      expectRealNotFound(await tagMetadata(params("en", slug)), "Tag Not Found");
      await expect(TagPage(params("en", slug))).rejects.toThrow(NOT_FOUND);
    }
  });

  it("2. an existing tag is NOINDEX_FOLLOW in every locale", async () => {
    for (const locale of ["fa", "en", "de"]) {
      const meta = await tagMetadata(params(locale, BARE_TAG));
      expectRefusal(meta);
      expect(String(meta.title)).toContain("Bare");
    }
  });

  it("3. a heavily populated tag is STILL NOINDEX_FOLLOW", async () => {
    expectRefusal(await tagMetadata(params("en", POPULATED_TAG)));
  });

  it("uses the Persian tag name on /fa without becoming indexable", async () => {
    const meta = await tagMetadata(params("fa", POPULATED_TAG));
    expect(String(meta.title)).toContain("پرمقاله");
    expectRefusal(meta);
  });
});

describe("category archives, through the real route", () => {
  it("4/16. a missing category is a real 404", async () => {
    expectRealNotFound(
      await categoryMetadata(params("fa", "no-such-category")),
      "Category Not Found",
    );
    await expect(CategoryPage(params("fa", "no-such-category"))).rejects.toThrow(NOT_FOUND);
  });

  it("5. a category WITH a description AND articles is still NOINDEX_FOLLOW", async () => {
    const meta = await categoryMetadata(params("fa", CURATED));
    expectRefusal(meta);
    expect(String(meta.description)).toContain("Curated editorial copy");
  });

  it("6. a category whose locale falls back to another language is still NOINDEX_FOLLOW", async () => {
    // Proof the fallback is real: the same reader, asked for /fa, returns the
    // English rows. The route must not read that as "this locale has articles".
    const { getArticlesByCategory_ } = await import("@/lib/articles/db");
    const faRows = await getArticlesByCategory_(FALLBACK_ONLY, "fa");
    expect(faRows.length).toBeGreaterThan(0);
    expect(faRows.every((r) => r.language === "EN")).toBe(true);

    for (const locale of ["fa", "de"]) {
      expectRefusal(await categoryMetadata(params(locale, FALLBACK_ONLY)));
    }
  });

  it("7. a category with zero articles is NOINDEX_FOLLOW, not a thin indexable page", async () => {
    expectRefusal(await categoryMetadata(params("en", EMPTY)));
  });

  it("8. an inactive category never becomes indexable — it is absent, so it 404s", async () => {
    // `getAllCategories` sends `isActive: true`, so the row never reaches the
    // policy at all. Availability is unchanged by this hotfix: it was a 404
    // before and it is a 404 now.
    expectRealNotFound(await categoryMetadata(params("en", HIDDEN)), "Category Not Found");
    await expect(CategoryPage(params("en", HIDDEN))).rejects.toThrow(NOT_FOUND);
  });

  it("a category without a description is NOINDEX_FOLLOW and falls back to generic copy", async () => {
    const meta = await categoryMetadata(params("en", NO_DESC));
    expectRefusal(meta);
    expect(String(meta.description)).toContain("Technical articles in");
  });

  it("reads NO article count for metadata, so indexability cannot depend on one", async () => {
    store.articleQueries = [];
    await categoryMetadata(params("fa", CURATED));
    expect(store.articleQueries).toEqual([]);
  });
});

describe("9/10/14. no taxonomy page emits hreflang, x-default or a canonical", () => {
  const tagSrc = read("src/app/[locale]/articles/tag/[slug]/page.tsx");
  const catSrc = read("src/app/[locale]/articles/category/[slug]/page.tsx");
  const codeOnly = (s: string) =>
    s.split("\n").filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join("\n");

  it("emits none of them at runtime, in any locale, for any state", async () => {
    const metas: Meta[] = [];
    for (const locale of ["fa", "en", "de"]) {
      metas.push(await tagMetadata(params(locale, POPULATED_TAG)));
      metas.push(await categoryMetadata(params(locale, CURATED)));
      metas.push(await tagMetadata(params(locale, "missing")));
      metas.push(await categoryMetadata(params(locale, "missing")));
    }
    for (const meta of metas) {
      expect(meta.alternates).toEqual({});
      const json = JSON.stringify(meta);
      expect(json).not.toContain("x-default");
      expect(json).not.toContain("hreflang");
      // 14: no canonical is retained at all, so no canonical can carry a query.
      expect(json).not.toContain("canonical");
      expect(json).not.toContain("?");
    }
  });

  it("builds no alternates map and no canonical path in either route source", () => {
    for (const src of [codeOnly(tagSrc), codeOnly(catSrc)]) {
      expect(src).not.toContain("languages:");
      expect(src).not.toContain("x-default");
      expect(src).not.toContain("canonical");
      // `buildMetadata` is the canonical+hreflang builder. Neither archive route
      // may reach it, which is also what removes the previously dead branch.
      expect(src).not.toContain("buildMetadata");
      expect(src).not.toContain("contentLocales");
    }
  });

  it("13. keeps a missing taxonomy a 404 and introduces no redirect", () => {
    for (const src of [tagSrc, catSrc]) {
      expect(src).toContain("notFound()");
      expect(src).not.toContain("redirect(");
      expect(src).not.toContain("permanentRedirect(");
    }
  });

  it("reaches the policy through exactly one call per route", () => {
    for (const src of [codeOnly(tagSrc), codeOnly(catSrc)]) {
      expect(src.match(/taxonomyMetadata\(/g)).toHaveLength(1);
    }
  });
});

describe("11/12. no taxonomy URL is advertised anywhere", () => {
  it("11. app/sitemap.ts emits neither tag nor category paths", () => {
    const code = read("src/app/sitemap.ts")
      .split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
    expect(code).not.toContain("/articles/tag/");
    expect(code).not.toContain("/articles/category/");
  });

  it("11. the article sitemap helpers expose no taxonomy entry builder", () => {
    const src = read("src/lib/articles/seo.ts");
    expect(src).not.toMatch(/export function tagSitemapEntries/);
    expect(src).not.toMatch(/export function categorySitemapEntries/);
  });

  it("12. the IndexNow lifecycle has no taxonomy path builder to submit", () => {
    const src = read("src/lib/seo/indexnow-lifecycle.ts");
    expect(src).not.toContain("/articles/tag/");
    expect(src).not.toContain("/articles/category/");
    expect(src).not.toMatch(/export function (tag|category)\w*Paths/);
    // The only two surfaces that ARE submitted stay what they were.
    expect(src).toMatch(/export function articlePaths/);
    expect(src).toMatch(/export function authorProfilePaths/);
  });
});

describe("15. robots.txt lets a crawler reach the page that carries the noindex", () => {
  it("disallows no taxonomy prefix and keeps the locale roots crawlable", async () => {
    const robots = (await import("@/app/robots")).default;
    const rules = robots().rules;
    const groups = Array.isArray(rules) ? rules : [rules];

    // Real Robots Exclusion Protocol semantics, not a substring search: a rule
    // matches by PREFIX, and a trailing `$` anchors it to the end of the path.
    // This matters because the repository legitimately disallows the protected
    // editorial paths under `/{locale}/articles/` (moderation, editor), and a
    // naive `/articles` check would flag those.
    const matches = (rule: string, path: string) =>
      rule.endsWith("$") ? path === rule.slice(0, -1) : path.startsWith(rule);

    const samples = ["fa", "en", "de"].flatMap((l) => [
      `/${l}/articles/tag/some-tag`,
      `/${l}/articles/category/some-category`,
    ]);

    for (const g of groups) {
      // The blanket-blocked SEO scrapers deny `/` on purpose and are not search
      // engines; `noindex` delivery is about the crawlers that index.
      const dis = ([g.disallow ?? []].flat().filter(Boolean) as string[]).filter((d) => d !== "/");
      for (const path of samples) {
        for (const d of dis) {
          expect(matches(d, path), `${g.userAgent} blocks ${path} via "${d}"`).toBe(false);
        }
      }
    }

    // A `noindex` is only obeyed if the page may be FETCHED, so the default
    // group must still allow the locale roots the archives live under.
    const star = groups.find((g) => g.userAgent === "*");
    expect([star?.allow ?? []].flat()).toContain("/fa/");
  });
});

describe("17. nothing outside the two archive routes changed", () => {
  it("is imported by exactly the two archive routes", () => {
    for (const f of [
      "src/app/[locale]/articles/tag/[slug]/page.tsx",
      "src/app/[locale]/articles/category/[slug]/page.tsx",
    ]) {
      expect(read(f)).toContain("@/lib/seo/taxonomy-indexability");
    }
    for (const f of [
      "src/app/sitemap.ts",
      "src/app/robots.ts",
      "src/app/[locale]/articles/author/[handle]/page.tsx",
      "src/app/[locale]/articles/page.tsx",
      "src/lib/seo/metadata.ts",
      "src/lib/articles/seo.ts",
      "src/lib/seo/indexnow-lifecycle.ts",
    ]) {
      expect(read(f), f + " must not depend on the taxonomy policy")
        .not.toContain("taxonomy-indexability");
    }
  });

  it("leaves the author route's own metadata contract intact", () => {
    const src = read("src/app/[locale]/articles/author/[handle]/page.tsx");
    // Unchanged by this correction: a normal author still gets a real canonical
    // and hreflang set from `buildMetadata`, and only the retired identity is
    // refused.
    expect(src).toContain("buildMetadata({");
    expect(src).toContain("isRetiredIdentityHandle(handle)");
    expect(src).toContain("alternates: {}");
    expect(src).not.toContain("taxonomy");
  });

  it("leaves the shared metadata builder's single-representation contract intact", () => {
    const src = read("src/lib/seo/metadata.ts");
    expect(src).toContain("alternates: real.length > 1 ? real : null");
  });
});
