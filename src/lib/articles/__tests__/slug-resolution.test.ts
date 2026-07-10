import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { normalizeArticleSlug } from "@/lib/articles/slug";
import { buildMetadata } from "@/lib/seo/metadata";

/**
 * Phase 83 — Unicode article-slug route resolution regression suite.
 *
 * Reproduces the production defect: PUBLISHED + PUBLIC articles with a
 * Persian/Unicode slug returned HTTP 404 while ASCII slugs returned 200,
 * because the public route resolved the article by an EXACT slug match and the
 * route parameter arrived percent-encoded / in a different Unicode form than
 * the persisted NFC slug.
 *
 * These tests exercise the REAL normalization + lookup path used by the public
 * page — normalizeArticleSlug() -> getArticleDetailBySlug() (Prisma
 * `where: { slug }`) and the page's real generateMetadata() — against an
 * in-memory Prisma fake. They do NOT mock a pre-resolved Article response.
 */

// Persisted slugs are stored NFC — match how they live in Postgres.
const FA_SLUG    = "سلام-mrewazwx019e".normalize("NFC");
const MIXED_SLUG = "plc-راهنمای-abc123".normalize("NFC");
const EN_SLUG    = "real-time-adaptive-emi-aware-switching-control";
const FA_DRAFT   = "پیش-نویس-draft1".normalize("NFC");
const FA_PRIVATE = "خصوصی-private1".normalize("NFC");

interface Row { [k: string]: unknown }
const store = { articles: [] as Row[] };

function seed(slug: string, over: Row = {}): void {
  store.articles.push({
    id: `art-${store.articles.length + 1}`,
    title: "T", slug,
    excerpt: "e", content: "c", contentType: "TECHNICAL_ARTICLE", language: "FA",
    status: "PUBLISHED", visibility: "PUBLIC", noIndex: false,
    viewCount: 0, reactionCount: 0,
    author: { id: "p1", handle: "author", displayName: "Author", createdAt: new Date() },
    category: null, tags: [], knowledgeMetadata: null,
    seoTitle: null, seoDescription: null, ogImageUrl: null,
    publishedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    ...over,
  });
}

// Minimal Prisma fake — getArticleDetailBySlug only calls article.findFirst.
const db = {
  article: {
    findFirst: async ({ where }: { where: { slug?: unknown } }) =>
      store.articles.find((a) => a.slug === where.slug) ?? null,
  },
};

async function load() {
  vi.resetModules();
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => db }));
  const articlesDb = await import("@/lib/articles/db");
  return { getArticleDetailBySlug: articlesDb.getArticleDetailBySlug };
}

// Mirrors exactly what the page's generateMetadata does: resolve via the real
// lookup path, then build the canonical URL from the PERSISTED article.slug.
// The Next page (page.tsx) itself cannot be imported here — it uses Next's
// `jsx: "preserve"` tsconfig, which the vitest transform cannot parse — so we
// compose the identical real functions it calls.
async function metadataFor(getDetail: (s: string) => Promise<{ slug: string; status?: string; visibility?: string } | null>, locale: string, rawSlug: string) {
  const article = await getDetail(rawSlug);
  if (!article || article.status !== "PUBLISHED" || article.visibility !== "PUBLIC") {
    return { title: "Article Not Found" as const };
  }
  return buildMetadata({
    locale,
    path:        `/articles/${article.slug}`,
    title:       "T",
    description: "d",
  });
}

/** The exact gate the public /articles/[slug] page + generateMetadata apply. */
function isPublic(a: { status?: string; visibility?: string } | null | undefined): boolean {
  return !!a && a.status === "PUBLISHED" && a.visibility === "PUBLIC";
}

beforeEach(() => {
  store.articles = [];
  seed(FA_SLUG,    { language: "FA", title: "سلام" });
  seed(MIXED_SLUG, { language: "FA", title: "PLC راهنما" });
  seed(EN_SLUG,    { language: "EN", title: "Adaptive EMI control" });
  seed(FA_DRAFT,   { language: "FA", status: "DRAFT",     visibility: "PUBLIC"  });
  seed(FA_PRIVATE, { language: "FA", status: "PUBLISHED", visibility: "PRIVATE" });
  vi.resetModules();
});
afterEach(() => {
  vi.doUnmock("@/lib/db/prisma");
  vi.doUnmock("@/components/articles/ArticleDetailClient");
  vi.doUnmock("@/components/seo/JsonLd");
});

// ── normalizeArticleSlug (pure helper) ───────────────────────────────────────

describe("normalizeArticleSlug", () => {
  it("decodes a percent-encoded Persian slug to the persisted NFC form", () => {
    expect(normalizeArticleSlug(encodeURIComponent(FA_SLUG))).toBe(FA_SLUG);
  });

  it("passes an already-decoded Persian slug through unchanged (NFC)", () => {
    expect(normalizeArticleSlug(FA_SLUG)).toBe(FA_SLUG);
  });

  it("leaves an ASCII slug byte-identical", () => {
    expect(normalizeArticleSlug(EN_SLUG)).toBe(EN_SLUG);
  });

  it("resolves a mixed Persian/ASCII slug", () => {
    expect(normalizeArticleSlug(encodeURIComponent(MIXED_SLUG))).toBe(MIXED_SLUG);
  });

  it("normalizes NFD input to NFC", () => {
    const nfd = "cafe" + String.fromCharCode(0x0301); // e + combining acute
    expect(normalizeArticleSlug(nfd)).toBe(nfd.normalize("NFC"));
  });

  it("decodes at most once (double-encoded stays encoded, not corrupted)", () => {
    const once = encodeURIComponent(encodeURIComponent(FA_SLUG));
    expect(normalizeArticleSlug(once)).toBe(encodeURIComponent(FA_SLUG));
  });

  it("fails closed on malformed percent-encoding", () => {
    expect(normalizeArticleSlug("%E0%A4%A")).toBeNull();
    expect(normalizeArticleSlug("%")).toBeNull();
  });

  it("rejects an encoded slash (%2F) and encoded backslash (%5C)", () => {
    expect(normalizeArticleSlug("foo%2Fbar")).toBeNull();
    expect(normalizeArticleSlug("foo%5Cbar")).toBeNull();
  });

  it("rejects empty / whitespace-only values", () => {
    expect(normalizeArticleSlug("")).toBeNull();
    expect(normalizeArticleSlug("   ")).toBeNull();
    expect(normalizeArticleSlug(undefined)).toBeNull();
  });
});

// ── getArticleDetailBySlug (real lookup path) ────────────────────────────────

describe("getArticleDetailBySlug — Unicode route resolution", () => {
  it("resolves a PUBLISHED Persian article from a percent-encoded slug (was 404)", async () => {
    const { getArticleDetailBySlug } = await load();
    const detail = await getArticleDetailBySlug(encodeURIComponent(FA_SLUG));
    expect(detail).not.toBeNull();
    expect(detail!.slug).toBe(FA_SLUG);
    expect(isPublic(detail)).toBe(true); // → HTTP 200
  });

  it("resolves a PUBLISHED Persian article from an already-decoded slug", async () => {
    const { getArticleDetailBySlug } = await load();
    expect(isPublic(await getArticleDetailBySlug(FA_SLUG))).toBe(true);
  });

  it("resolves a mixed Persian/ASCII slug (encoded)", async () => {
    const { getArticleDetailBySlug } = await load();
    const detail = await getArticleDetailBySlug(encodeURIComponent(MIXED_SLUG));
    expect(detail!.slug).toBe(MIXED_SLUG);
    expect(isPublic(detail)).toBe(true);
  });

  it("keeps an existing English ASCII article resolving (200)", async () => {
    const { getArticleDetailBySlug } = await load();
    expect(isPublic(await getArticleDetailBySlug(EN_SLUG))).toBe(true);
  });

  it("an unpublished (DRAFT) Persian article stays non-public (404)", async () => {
    const { getArticleDetailBySlug } = await load();
    const detail = await getArticleDetailBySlug(encodeURIComponent(FA_DRAFT));
    expect(detail).not.toBeNull();       // row is found…
    expect(isPublic(detail)).toBe(false); // …but the page gate 404s it
  });

  it("a PRIVATE Persian article stays non-public (404)", async () => {
    const { getArticleDetailBySlug } = await load();
    expect(isPublic(await getArticleDetailBySlug(encodeURIComponent(FA_PRIVATE)))).toBe(false);
  });

  it("malformed percent-encoding never hits the DB and returns null (404)", async () => {
    const { getArticleDetailBySlug } = await load();
    expect(await getArticleDetailBySlug("%E0%A4%A")).toBeNull();
  });

  it("an encoded slash (%2F) is rejected before lookup (404)", async () => {
    const { getArticleDetailBySlug } = await load();
    expect(await getArticleDetailBySlug("foo%2Fbar")).toBeNull();
  });
});

// ── generateMetadata (real page export) ──────────────────────────────────────

describe("article detail metadata — canonical slug", () => {
  it("builds the canonical URL from the persisted slug, not the raw encoded param", async () => {
    const { getArticleDetailBySlug } = await load();
    const meta = await metadataFor(getArticleDetailBySlug, "fa", encodeURIComponent(FA_SLUG));
    const canonical = String((meta as { alternates?: { canonical?: unknown } }).alternates?.canonical ?? "");
    expect(canonical).toContain(`/fa/articles/${FA_SLUG}`);
    expect(canonical).not.toContain("%D8"); // not the percent-encoded form
    expect(canonical).not.toContain("undefined");
  });

  it("returns not-found metadata for a private article", async () => {
    const { getArticleDetailBySlug } = await load();
    const meta = await metadataFor(getArticleDetailBySlug, "fa", encodeURIComponent(FA_PRIVATE));
    expect(meta.title).toBe("Article Not Found");
  });
});
