import { describe, it, expect, vi } from "vitest";

import en from "../../../../messages/en.json";
import de from "../../../../messages/de.json";
import fa from "../../../../messages/fa.json";

/**
 * The article detail page's JSON-LD, read from the real route module.
 *
 * Pins the entity wiring the 2026-11 SEO audit found broken: the Article's
 * publisher was a second, id-less "Hermes Industrial Journal" organisation
 * instead of the company entity the global @graph defines, the Article had no
 * @id / mainEntityOfPage, and no BreadcrumbList was emitted although the page
 * shows a visible breadcrumb.
 */

vi.mock("next-intl/server", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  const catalogues = { en, de, fa } as const;
  return {
    setRequestLocale: () => undefined,
    getTranslations: async ({ locale, namespace }: { locale: keyof typeof catalogues; namespace: string }) =>
      actual.createTranslator({
        locale,
        messages: catalogues[locale],
        namespace: namespace as never,
      }),
  };
});

vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => null }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => null }));
vi.mock("@/lib/articles/engagement", () => ({
  getReactionSummary: async () => ({ counts: {}, viewerReaction: null }),
  listArticleComments: async () => [],
  isArticleSaved: async () => false,
}));
vi.mock("@/components/articles/ArticleDetailClient", () => ({ ArticleDetailClient: () => null }));

vi.mock("@/lib/articles/db", () => ({
  getArticleDetailBySlug: async (slug: string, locale: string) => ({
    id: `${slug}-${locale}`,
    slug,
    language: { fa: "FA", en: "EN", de: "DE" }[locale] ?? "EN",
    status: "PUBLISHED",
    visibility: "PUBLIC",
    noIndex: false,
    title: `TITLE-${locale}`,
    seoTitle: null,
    seoDescription: null,
    excerpt: "EXCERPT",
    coverImageUrl: null,
    ogImageUrl: null,
    publishedAt: "2026-08-16T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    tags: [],
    category: null,
    author: { displayName: "A", handle: "a" },
  }),
  getArticleFeed: async () => ({ latest: [], trending: [] }),
  incrementArticleViewCount: async () => undefined,
}));

const { default: ArticleDetailPage } = await import("@/app/[locale]/articles/[slug]/page");
const { BASE_URL, ORG_ID } = await import("@/lib/seo/config");

type Node = Record<string, unknown>;

async function jsonLd(locale: string, slug: string): Promise<Node[]> {
  const el = (await ArticleDetailPage({ params: Promise.resolve({ locale, slug }) })) as {
    props: { children: Array<{ props: { data?: Node[] } }> };
  };
  const block = el.props.children.find((c) => Array.isArray(c?.props?.data));
  if (!block?.props.data) throw new Error("article page emitted no JSON-LD block");
  return block.props.data;
}

const ofType = (nodes: Node[], type: string) => nodes.find((n) => n["@type"] === type);

describe("article page JSON-LD", () => {
  it("names the company entity as publisher, by @id", async () => {
    const article = ofType(await jsonLd("en", "opc-ua-primer"), "Article")!;
    expect(article.publisher).toEqual({ "@id": ORG_ID });
    expect(JSON.stringify(article)).not.toContain("Hermes Industrial Journal");
  });

  it("gives the Article a stable @id and mainEntityOfPage on its canonical URL", async () => {
    const article = ofType(await jsonLd("fa", "opc-ua-primer"), "Article")!;
    const url = `${BASE_URL}/fa/articles/opc-ua-primer`;
    expect(article["@id"]).toBe(`${url}#article`);
    expect(article.mainEntityOfPage).toBe(url);
    expect(article.url).toBe(url);
  });

  it.each([
    ["en", "Home", "Journal"],
    ["fa", "خانه", "ژورنال"],
    ["de", "Startseite", "Journal"],
  ])("/%s emits a localised Home > Journal > article BreadcrumbList", async (locale, home, journal) => {
    const crumbs = ofType(await jsonLd(locale, "opc-ua-primer"), "BreadcrumbList")!;
    expect(crumbs.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: home,             item: `${BASE_URL}/${locale}` },
      { "@type": "ListItem", position: 2, name: journal,          item: `${BASE_URL}/${locale}/articles` },
      { "@type": "ListItem", position: 3, name: `TITLE-${locale}`, item: `${BASE_URL}/${locale}/articles/opc-ua-primer` },
    ]);
  });

  it("keeps dateModified on the row's updatedAt", async () => {
    const article = ofType(await jsonLd("en", "opc-ua-primer"), "Article")!;
    expect(article.dateModified).toBe("2026-08-20T00:00:00.000Z");
  });
});
