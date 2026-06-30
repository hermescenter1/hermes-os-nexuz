// Phase 72.5 — Article data access layer (Prisma + deterministic mock fallback)

import type {
  ArticleListItem, ArticleDetail, ArticleAuthorProfile,
  ArticleCategory, ArticleTag, ArticleFeed, ArticleFilters,
} from "./types";
import {
  MOCK_ARTICLES, MOCK_AUTHORS, MOCK_CATEGORIES, MOCK_TAGS,
  getArticleBySlug, getArticlesByCategory, getArticlesByTag,
  getArticlesByAuthor, getPublishedArticles, getTrendingArticles,
  getEditorsPicks, getCaseStudies, getAuthorByHandle,
} from "./mock-data";
import { getPrisma } from "@/lib/db/prisma";

function ts<T extends object>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(row)) {
    const v = (row as Record<string, unknown>)[k];
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out as T;
}

// Recursively converts all Date instances to ISO strings.
// ts() is shallow and misses Date objects nested in author/category/tags/knowledgeMetadata.
function deepTs(val: unknown): unknown {
  if (val instanceof Date) return val.toISOString();
  if (Array.isArray(val)) return val.map(deepTs);
  if (val !== null && typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(val as object)) {
      out[k] = deepTs((val as Record<string, unknown>)[k]);
    }
    return out;
  }
  return val;
}

// Uses shared getPrisma() singleton which supplies the PrismaPg driver adapter
// required by Prisma 7 driverAdapters — do NOT create a bare new PrismaClient() here.
async function getDb() {
  return getPrisma();
}

// ── Public feed ───────────────────────────────────────────────────────────────

export async function getArticleFeed(): Promise<ArticleFeed> {
  const db = await getDb();
  if (db) {
    try {
      const [articlesRaw, categoriesRaw, authorsRaw] = await Promise.all([
        (db as never as { article: { findMany: (a: unknown) => Promise<unknown[]> } }).article.findMany({
          where: { status: "PUBLISHED", visibility: "PUBLIC" },
          include: { author: true, category: true, tags: { include: { tag: true } } },
          orderBy: { publishedAt: "desc" },
          take: 50,
        }),
        (db as never as { articleCategory: { findMany: (a: unknown) => Promise<unknown[]> } }).articleCategory.findMany({
          where: { isActive: true }, orderBy: { sortOrder: "asc" },
        }),
        (db as never as { articleAuthorProfile: { findMany: (a: unknown) => Promise<unknown[]> } }).articleAuthorProfile.findMany({
          where: { isActive: true }, orderBy: { followerCount: "desc" }, take: 6,
        }),
      ]);
      const articles = articlesRaw.map(a => ts(a as object)) as ArticleListItem[];
      const categories = categoriesRaw.map(c => ts(c as object)) as ArticleCategory[];
      const topAuthors = authorsRaw.map(a => ts(a as object)) as ArticleAuthorProfile[];
      const sorted = [...articles].sort((a, b) => (b.viewCount + b.reactionCount * 3) - (a.viewCount + a.reactionCount * 3));
      return {
        featured: articles[0] ?? null,
        editorsPicks: articles.slice(0, 6),
        trending: sorted.slice(0, 8),
        latest: articles.slice(0, 12),
        caseStudies: articles.filter(a => a.contentType === "INDUSTRIAL_CASE_STUDY").slice(0, 6),
        categories,
        topAuthors,
        totalArticles: articles.length,
      };
    } catch { /* fall through */ }
  }
  const all = getPublishedArticles();
  return {
    featured: all[6] ?? all[0] ?? null,
    editorsPicks: getEditorsPicks(6),
    trending: getTrendingArticles(8),
    latest: all.slice(0, 12),
    caseStudies: getCaseStudies(6),
    categories: MOCK_CATEGORIES,
    topAuthors: MOCK_AUTHORS,
    totalArticles: all.length,
  };
}

export async function getPublicArticles(filters: ArticleFilters = {}): Promise<ArticleListItem[]> {
  const db = await getDb();
  if (db) {
    try {
      const where: Record<string, unknown> = { status: "PUBLISHED", visibility: "PUBLIC" };
      if (filters.contentType) where.contentType = filters.contentType;
      if (filters.language)    where.language    = filters.language;
      if (filters.search) {
        where.OR = [
          { title: { contains: filters.search, mode: "insensitive" } },
          { excerpt: { contains: filters.search, mode: "insensitive" } },
        ];
      }
      const rows = await (db as never as { article: { findMany: (a: unknown) => Promise<unknown[]> } }).article.findMany({
        where,
        include: { author: true, category: true, tags: { include: { tag: true } } },
        orderBy: { publishedAt: "desc" },
        take: filters.limit ?? 20,
        skip: ((filters.page ?? 1) - 1) * (filters.limit ?? 20),
      });
      return rows.map(r => ts(r as object)) as ArticleListItem[];
    } catch { /* fall through */ }
  }
  let data = getPublishedArticles() as ArticleListItem[];
  if (filters.categorySlug) data = data.filter(a => a.category?.slug === filters.categorySlug);
  if (filters.tagSlug)      data = data.filter(a => a.tags.some(t => t.slug === filters.tagSlug));
  if (filters.authorHandle) data = data.filter(a => a.author.handle === filters.authorHandle);
  if (filters.contentType)  data = data.filter(a => a.contentType  === filters.contentType);
  if (filters.language)     data = data.filter(a => a.language      === filters.language);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    data = data.filter(a =>
      a.title.toLowerCase().includes(q) ||
      (a.excerpt ?? "").toLowerCase().includes(q)
    );
  }
  const limit = filters.limit ?? 20;
  const offset = ((filters.page ?? 1) - 1) * limit;
  return data.slice(offset, offset + limit);
}

export async function getArticleDetailBySlug(slug: string): Promise<ArticleDetail | null> {
  const db = await getDb();
  if (db) {
    try {
      // findFirst is used instead of findUnique for robustness with Prisma 7
      // driverAdapters + complex nested includes. Both use WHERE slug = $1 but
      // findFirst generates a simpler query path in the adapter layer.
      const row = await (db as never as {
        article: { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };
      }).article.findFirst({
        where: { slug },
        include: {
          author:            true,
          category:          true,
          tags:              { include: { tag: true } },
          knowledgeMetadata: true,
        },
      });

      if (!row) return null;

      // Deep-convert all Date objects to ISO strings (ts() only handles the top level;
      // author.createdAt, category.createdAt, tag.createdAt etc. would remain as Dates
      // without this deep conversion, potentially causing RSC serialisation issues).
      const r = deepTs(row) as Record<string, unknown>;

      // Prisma returns tags as ArticleTagOnArticle[] (join-table shape):
      //   [{ articleId, tagId, tag: { id, slug, name, nameFa, createdAt } }]
      // ArticleDetailClient expects the flat ArticleTag[] shape.
      type JoinTag = { tag?: Record<string, unknown> };
      const rawTags  = Array.isArray(r.tags) ? (r.tags as JoinTag[]) : [];
      const tags: ArticleTag[] = rawTags
        .filter((t): t is JoinTag & { tag: Record<string, unknown> } => !!t?.tag)
        .map(t => ({
          id:     String(t.tag.id     ?? ""),
          slug:   String(t.tag.slug   ?? ""),
          name:   String(t.tag.name   ?? ""),
          nameFa: t.tag.nameFa != null ? String(t.tag.nameFa) : null,
        }));

      return { ...r, tags } as ArticleDetail;
    } catch (err) {
      // Log the real DB error so it is visible in server logs.
      // Do NOT fall through to mock-data when the DB is reachable —
      // that would hide valid published articles from the public.
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[db/articles] getArticleDetailBySlug slug="${slug.slice(0, 80)}" error: ${msg}`);
      return null;
    }
  }
  // DB is unavailable — fall back to mock for offline/dev mode.
  return getArticleBySlug(slug) ?? null;
}

export async function getTrendingArticlesList(limit = 8): Promise<ArticleListItem[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await (db as never as { article: { findMany: (a: unknown) => Promise<unknown[]> } }).article.findMany({
        where: { status: "PUBLISHED", visibility: "PUBLIC" },
        include: { author: true, category: true, tags: { include: { tag: true } } },
        orderBy: [{ viewCount: "desc" }, { reactionCount: "desc" }],
        take: limit,
      });
      return rows.map(r => ts(r as object)) as ArticleListItem[];
    } catch { /* fall through */ }
  }
  return getTrendingArticles(limit);
}

export async function getEditorsPicksList(limit = 6): Promise<ArticleListItem[]> {
  return getEditorsPicks(limit);
}

export async function getCaseStudiesList(limit = 8): Promise<ArticleListItem[]> {
  return getCaseStudies(limit);
}

export async function getArticlesByCategory_(categorySlug: string): Promise<ArticleListItem[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await (db as never as { article: { findMany: (a: unknown) => Promise<unknown[]> } }).article.findMany({
        where: { status: "PUBLISHED", visibility: "PUBLIC", category: { slug: categorySlug } },
        include: { author: true, category: true, tags: { include: { tag: true } } },
        orderBy: { publishedAt: "desc" },
      });
      return rows.map(r => ts(r as object)) as ArticleListItem[];
    } catch { /* fall through */ }
  }
  return getArticlesByCategory(categorySlug);
}

export async function getArticlesByTag_(tagSlug: string): Promise<ArticleListItem[]> {
  return getArticlesByTag(tagSlug);
}

export async function getAuthorProfile(handle: string): Promise<ArticleAuthorProfile | null> {
  const db = await getDb();
  if (db) {
    try {
      const row = await (db as never as {
        articleAuthorProfile: { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };
      }).articleAuthorProfile.findFirst({
        where: { handle },
      });
      if (!row) return null;
      return deepTs(row) as ArticleAuthorProfile;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[db/articles] getAuthorProfile handle="${handle}" error: ${msg}`);
      return null;
    }
  }
  return getAuthorByHandle(handle) ?? null;
}

export async function getAllAuthors(): Promise<ArticleAuthorProfile[]> {
  const db = await getDb();
  if (db) {
    try {
      // Only include authors who have at least one PUBLISHED + PUBLIC article.
      // _count.articles computes the real published count (overrides stale articleCount).
      type CountedRow = Record<string, unknown> & { _count: { articles: number } };
      const rows = await (db as never as {
        articleAuthorProfile: { findMany: (a: unknown) => Promise<CountedRow[]> };
      }).articleAuthorProfile.findMany({
        where: {
          isActive: true,
          articles: { some: { status: "PUBLISHED", visibility: "PUBLIC" } },
        },
        include: {
          _count: {
            select: { articles: { where: { status: "PUBLISHED", visibility: "PUBLIC" } } },
          },
        },
        orderBy: { followerCount: "desc" },
      });

      // Phase 75: Aggregate real views, reactions, and latest publication date
      // from PUBLISHED + PUBLIC articles per author. Overrides stale profile counters.
      type AggRow = {
        authorId: string;
        _sum: { viewCount: number | null; reactionCount: number | null };
        _max: { publishedAt: Date | string | null };
      };
      const aggRows = await (db as never as {
        article: { groupBy: (a: unknown) => Promise<AggRow[]> };
      }).article.groupBy({
        by: ["authorId"],
        where: { status: "PUBLISHED", visibility: "PUBLIC" },
        _sum: { viewCount: true, reactionCount: true },
        _max: { publishedAt: true },
      });
      const aggMap = new Map(aggRows.map(r => [r.authorId, r]));

      return rows.map(r => {
        const publishedCount = r._count?.articles ?? 0;
        const id = String((r as Record<string, unknown>).id ?? "");
        const agg = aggMap.get(id);
        const a = deepTs(r) as ArticleAuthorProfile;
        const rawMax = agg?._max?.publishedAt;
        const latestPublishedAt = rawMax instanceof Date
          ? rawMax.toISOString()
          : typeof rawMax === "string" ? rawMax : null;
        return {
          ...a,
          articleCount:    publishedCount,
          totalViews:      agg?._sum?.viewCount      ?? 0,
          totalReactions:  agg?._sum?.reactionCount  ?? 0,
          latestPublishedAt,
        };
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[db/articles] getAllAuthors error: ${msg}`);
    }
  }
  return MOCK_AUTHORS;
}

export async function getAllCategories(): Promise<ArticleCategory[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await (db as never as { articleCategory: { findMany: (a: unknown) => Promise<unknown[]> } }).articleCategory.findMany({
        where: { isActive: true }, orderBy: { sortOrder: "asc" },
      });
      return rows.map(r => ts(r as object)) as ArticleCategory[];
    } catch { /* fall through */ }
  }
  return MOCK_CATEGORIES;
}

export async function getCategoryBySlug(slug: string): Promise<ArticleCategory | null> {
  const all = await getAllCategories();
  return all.find(c => c.slug === slug) ?? null;
}

export async function getAllTags(): Promise<ArticleTag[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await (db as never as { articleTag: { findMany: (a: unknown) => Promise<unknown[]> } }).articleTag.findMany({
        orderBy: { name: "asc" },
      });
      return rows.map(r => ts(r as object)) as ArticleTag[];
    } catch { /* fall through */ }
  }
  return MOCK_TAGS;
}

export async function getTagBySlug(slug: string): Promise<ArticleTag | null> {
  const all = await getAllTags();
  return all.find(t => t.slug === slug) ?? null;
}

// ── Author articles ───────────────────────────────────────────────────────────

export async function getAuthorArticles(handle: string): Promise<ArticleListItem[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await (db as never as {
        article: { findMany: (a: unknown) => Promise<unknown[]> };
      }).article.findMany({
        where: { status: "PUBLISHED", visibility: "PUBLIC", author: { handle } },
        include: { author: true, category: true, tags: { include: { tag: true } } },
        orderBy: { publishedAt: "desc" },
      });
      return rows.map(r => {
        const d = deepTs(r) as Record<string, unknown>;
        type JoinTag = { tag?: Record<string, unknown> };
        const rawTags = Array.isArray(d.tags) ? (d.tags as JoinTag[]) : [];
        const tags: ArticleTag[] = rawTags
          .filter((t): t is JoinTag & { tag: Record<string, unknown> } => !!t?.tag)
          .map(t => ({
            id:     String(t.tag.id     ?? ""),
            slug:   String(t.tag.slug   ?? ""),
            name:   String(t.tag.name   ?? ""),
            nameFa: t.tag.nameFa != null ? String(t.tag.nameFa) : null,
          }));
        return { ...d, tags } as ArticleListItem;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Log and return empty — do NOT fall through to mock when DB is reachable.
      // Mock returns wrong articles for real DB author handles.
      console.error(`[db/articles] getAuthorArticles handle="${handle}" error: ${msg}`);
      return [];
    }
  }
  return getArticlesByAuthor(handle);
}

// ── User article history ──────────────────────────────────────────────────────

export async function getUserArticles(userId: string): Promise<ArticleListItem[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await (db as never as { article: { findMany: (a: unknown) => Promise<unknown[]> } }).article.findMany({
        where: { author: { userId } },
        include: { author: true, category: true, tags: { include: { tag: true } } },
        orderBy: { updatedAt: "desc" },
      });
      return rows.map(r => ts(r as object)) as ArticleListItem[];
    } catch { /* fall through */ }
  }
  return [];
}

// ── Phase 75: View count tracking ────────────────────────────────────────────
// Increments viewCount for a single article by id.
// Must only be called after confirming status=PUBLISHED + visibility=PUBLIC.
// Errors are caught by the caller; this never throws.

export async function incrementArticleViewCount(id: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await (db as never as {
    article: { update: (a: unknown) => Promise<unknown> };
  }).article.update({
    where: { id },
    data:  { viewCount: { increment: 1 } },
  });
}

// ── Moderation helpers ────────────────────────────────────────────────────────

export async function getSubmissionQueue(): Promise<ArticleListItem[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await (db as never as { article: { findMany: (a: unknown) => Promise<unknown[]> } }).article.findMany({
        where: { status: { in: ["SUBMITTED", "IN_REVIEW"] } },
        include: { author: true, category: true, tags: { include: { tag: true } } },
        orderBy: { updatedAt: "desc" },
      });
      return rows.map(r => ts(r as object)) as ArticleListItem[];
    } catch { /* fall through */ }
  }
  return [];
}

export async function getAllArticlesForModeration(): Promise<ArticleListItem[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await (db as never as { article: { findMany: (a: unknown) => Promise<unknown[]> } }).article.findMany({
        include: { author: true, category: true, tags: { include: { tag: true } } },
        orderBy: { updatedAt: "desc" },
        take: 100,
      });
      return rows.map(r => ts(r as object)) as ArticleListItem[];
    } catch { /* fall through */ }
  }
  return MOCK_ARTICLES as ArticleListItem[];
}
