import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import en from "../../../../../../messages/en.json";
import de from "../../../../../../messages/de.json";
import fa from "../../../../../../messages/fa.json";
import type { ArticleArchivePage } from "@/lib/articles/db";
import type { ArticleFeed, ArticleListItem } from "@/lib/articles/types";

/**
 * The Journal archive at /{locale}/articles/latest: every page reachable by a
 * real link, every non-page a 404, an outage never a 404, and German listings
 * linking German URLs (the component used to derive "fa, else en" from the
 * path, so /de listings linked /en).
 */

const CATALOGS = { en, de, fa } as const;

const h = vi.hoisted(() => ({
  archive: null as ArticleArchivePage | null,
  pathname: "/de/articles/latest",
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  permanentRedirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT_308 ${to}`);
  },
  usePathname: () => h.pathname,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async ({ locale, namespace }: { locale: keyof typeof CATALOGS; namespace: string }) =>
    createTranslator({ locale, messages: CATALOGS[locale], namespace: namespace as never }),
}));

function article(slug: string): ArticleListItem {
  return {
    id: slug, slug, title: `Title ${slug}`, subtitle: null, excerpt: "Excerpt", coverImageUrl: null,
    language: "DE", contentType: "TECHNICAL_ARTICLE", status: "PUBLISHED", visibility: "PUBLIC",
    authorId: "a1",
    author: {
      id: "a1", userId: "u1", handle: "editorial", displayName: "Editorial", headline: null, bio: null,
      company: null, roleTitle: null, expertiseAreas: [], location: null, avatarUrl: null, bannerUrl: null,
      followerCount: 0, articleCount: 0, totalViews: 0, totalSaves: 0, verifiedExpert: false,
      industrialCredibilityScore: null, isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    },
    categoryId: null, category: null, tags: [], readingTimeMinutes: 4,
    publishedAt: "2026-10-01T00:00:00.000Z", rejectionReason: null,
    viewCount: 0, saveCount: 0, reactionCount: 0, commentCount: 0, shareCount: 0,
    createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

const FEED: ArticleFeed = {
  featured: null, editorsPicks: [], trending: [], latest: [article("feed-only")],
  caseStudies: [], categories: [], topAuthors: [], totalArticles: 1,
};

vi.mock("@/lib/articles/db", () => ({
  getArticleFeed: async () => FEED,
  getArticleArchivePage: async () => h.archive,
}));

const { default: LatestPage, generateMetadata } = await import("../page");

type PageProps = { feed: ArticleFeed; pagination?: { page: number; totalPages: number; total: number; basePath: string } };

async function render(locale: string, page?: string | string[]) {
  return (await LatestPage({
    params: Promise.resolve({ locale }),
    searchParams: Promise.resolve(page === undefined ? {} : { page }),
  })) as ReactElement<PageProps>;
}

function archive(page: number, totalPages: number, slugs: string[]): ArticleArchivePage {
  return { items: slugs.map(article), page, totalPages, total: totalPages * 24 };
}

describe("/articles/latest — status contract", () => {
  beforeEach(() => {
    h.archive = archive(1, 3, ["a", "b"]);
  });

  it("serves page 1 at the bare URL with the archive's own items", async () => {
    const el = await render("de");
    expect(el.props.feed.latest.map((a) => a.slug)).toEqual(["a", "b"]);
    expect(el.props.pagination).toEqual({ page: 1, totalPages: 3, total: 72, basePath: "/de/articles/latest" });
  });

  it("serves an existing deeper page", async () => {
    h.archive = archive(2, 3, ["c"]);
    const el = await render("de", "2");
    expect(el.props.pagination?.page).toBe(2);
    expect(el.props.feed.latest.map((a) => a.slug)).toEqual(["c"]);
  });

  it("redirects ?page=1 to the canonical bare URL", async () => {
    await expect(render("en", "1")).rejects.toThrow("NEXT_REDIRECT_308 /en/articles/latest");
  });

  it.each(["0", "abc", "2.5", "02"])("answers 404 for ?page=%s", async (raw) => {
    await expect(render("en", raw)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("answers 404 for a repeated ?page= parameter", async () => {
    await expect(render("en", ["2", "3"])).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("answers 404 past the last page", async () => {
    h.archive = archive(4, 3, []);
    await expect(render("en", "4")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("serves an empty archive's first page instead of a 404", async () => {
    h.archive = { items: [], page: 1, totalPages: 0, total: 0 };
    const el = await render("de");
    expect(el.props.feed.latest).toEqual([]);
  });

  it("fails loudly on a deeper page during an outage — never a 404", async () => {
    h.archive = null;
    await expect(render("en", "2")).rejects.toThrow("Journal archive is unavailable");
  });

  it("keeps the feed's first page during an outage, without pagination", async () => {
    h.archive = null;
    const el = await render("en");
    expect(el.props.pagination).toBeUndefined();
    expect(el.props.feed.latest.map((a) => a.slug)).toEqual(["feed-only"]);
  });
});

describe("/articles/latest — metadata", () => {
  async function meta(locale: string, page?: string) {
    return generateMetadata({
      params: Promise.resolve({ locale }),
      searchParams: Promise.resolve(page === undefined ? {} : { page }),
    });
  }

  it("page 1 keeps the bare canonical and the hreflang cluster", async () => {
    const m = await meta("en");
    expect(m.alternates?.canonical).toBe("https://hermesnovin.com/en/articles/latest");
    expect(m.alternates?.languages).toBeDefined();
  });

  it.each([
    ["en", "Page 2"],
    ["de", "Seite 2"],
    ["fa", "صفحهٔ 2"],
  ])("%s page 2 is self-canonical, titled with its page number, and has no hreflang", async (locale, label) => {
    const m = await meta(locale, "2");
    expect(m.alternates?.canonical).toBe(`https://hermesnovin.com/${locale}/articles/latest?page=2`);
    expect(m.alternates?.languages).toBeUndefined();
    expect(JSON.stringify(m.title)).toContain(label);
  });
});

describe("archive pagination links — rendered HTML", () => {
  function html(locale: "en" | "de" | "fa", pagination: PageProps["pagination"], slugs: string[]) {
    h.pathname = `/${locale}/articles/latest`;
    return import("@/components/articles/ArticlesFeedClient").then(({ ArticlesFeedClient }) =>
      renderToStaticMarkup(
        <NextIntlClientProvider locale={locale} messages={CATALOGS[locale]} timeZone="UTC">
          <ArticlesFeedClient feed={{ ...FEED, latest: slugs.map(article) }} view="latest" pagination={pagination} />
        </NextIntlClientProvider>,
      ),
    );
  }

  it("renders real prev/next/page links on a middle page", async () => {
    const out = await html("de", { page: 2, totalPages: 3, total: 72, basePath: "/de/articles/latest" }, ["c"]);
    expect(out).toContain('href="/de/articles/latest" rel="prev"');
    expect(out).toContain('href="/de/articles/latest?page=3" rel="next"');
    expect(out).toContain('aria-current="page"');
    expect(out).toContain("Vorherige Seite");
    expect(out).toContain("Nächste Seite");
    expect(out).not.toContain("?page=1");
  });

  it("links German articles under /de, never /en", async () => {
    const out = await html("de", { page: 1, totalPages: 1, total: 1, basePath: "/de/articles/latest" }, ["opc-ua-grundlagen"]);
    expect(out).toContain('href="/de/articles/opc-ua-grundlagen"');
    expect(out).not.toMatch(/href="\/en\/articles/);
  });

  it("renders no pagination nav for a single page", async () => {
    const out = await html("en", { page: 1, totalPages: 1, total: 5, basePath: "/en/articles/latest" }, ["a"]);
    expect(out).not.toContain("?page=");
    expect(out).not.toContain('rel="next"');
  });
});
