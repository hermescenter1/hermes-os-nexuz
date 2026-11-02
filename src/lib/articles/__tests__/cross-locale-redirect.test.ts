import { describe, it, expect, vi } from "vitest";

/**
 * A Persian-slug article requested under /en or /de must redirect to its /fa
 * edition. Live on 2026-11-02 it answered 500 instead: the raw slug went into
 * the Location header, and HTTP header values cannot carry those characters.
 * Search Console listed the failure under "Server error (5xx)"; ASCII slugs on
 * the same route redirected correctly (308), which is why it went unnoticed.
 */

const PERSIAN_SLUG = "راهنمای-جامع-plc؛-هر-آنچه-مهندسان-برق-و-اتوماسیون-باید-بدانند-mr2jshp5wszr";

class RedirectSignal extends Error {
  constructor(readonly url: string) { super("NEXT_REDIRECT"); }
}

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  permanentRedirect: (url: string) => { throw new RedirectSignal(url); },
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => null }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => null }));
vi.mock("@/components/articles/ArticleDetailClient", () => ({ ArticleDetailClient: () => null }));

// Only a Persian edition exists; the DAL's legacy fallback returns it for any locale.
vi.mock("@/lib/articles/db", () => ({
  getArticleDetailBySlug: async () => ({
    id: "a1",
    slug: PERSIAN_SLUG,
    language: "FA",
    status: "PUBLISHED",
    visibility: "PUBLIC",
    noIndex: false,
    title: "T",
    excerpt: "E",
    coverImageUrl: null,
    ogImageUrl: null,
    publishedAt: "2026-08-16T00:00:00.000Z",
    updatedAt: "2026-08-16T00:00:00.000Z",
    tags: [],
    category: null,
    author: { displayName: "A", handle: "a" },
  }),
  getArticleFeed: async () => ({ latest: [], trending: [] }),
  incrementArticleViewCount: async () => undefined,
}));

const { default: ArticleDetailPage } = await import("@/app/[locale]/articles/[slug]/page");

async function redirectTarget(locale: string): Promise<string> {
  try {
    await ArticleDetailPage({ params: Promise.resolve({ locale, slug: PERSIAN_SLUG }) });
  } catch (e) {
    if (e instanceof RedirectSignal) return e.url;
    throw e;
  }
  throw new Error("expected a redirect");
}

describe.each(["en", "de"])("a Persian-slug article requested under /%s", (locale) => {
  it("redirects to the /fa edition", async () => {
    const url = await redirectTarget(locale);
    expect(decodeURIComponent(url)).toBe(`/fa/articles/${PERSIAN_SLUG}`);
  });

  it("produces a Location value that an HTTP header accepts", async () => {
    const url = await redirectTarget(locale);
    expect(url).toMatch(/^[\x21-\x7e]+$/);
    expect(() => new Headers({ location: url })).not.toThrow();
  });
});
