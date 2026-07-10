import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Phase 83 — Journal publishing workflow regression suite.
 *
 * Reproduces the exact user-reported flow end-to-end at the handler + data-loader
 * boundary (no Next server, no real Postgres):
 *
 *   write/submit  → POST /api/articles/submit      (Article model, slug set here)
 *   approve       → POST /api/articles/review/[id]/approve
 *   public view   → getArticleDetailBySlug(slug)   + the /articles/[slug] page gate
 *   public list   → getPublicArticles()
 *   management     → getUserArticles(userId)
 *
 * The Journal uses the global community `Article` model (NOT the org-scoped
 * IndustrialKnowledgeArticle). It is gated by editorial role (admin), has a
 * unique slug, and the public detail route renders only PUBLISHED + PUBLIC.
 *
 * These tests lock: identifier continuity (the slug written at submit is the
 * one returned at approve and resolved publicly), locale-correct links,
 * unpublished isolation, role/permission gates, and no-side-effect denials.
 */

// ── Shared in-memory Prisma fake ─────────────────────────────────────────────

interface Row { [k: string]: unknown }
const store = {
  profiles: [] as Row[],
  articles: [] as Row[],
  modEvents: [] as Row[],
  reviews: [] as Row[],
  categories: [] as Row[],
  seq: 0,
};

function resetStore() {
  store.profiles = [];
  store.articles = [];
  store.modEvents = [];
  store.reviews = [];
  store.categories = [];
  store.seq = 0;
}

function profileUserId(authorId: unknown): unknown {
  return store.profiles.find((p) => p.id === authorId)?.userId;
}

/** Match a plain-scalar where against a row (supports {in}, nested author.userId). */
function matchWhere(row: Row, where: Row = {}): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (k === "OR") continue; // search — not exercised by these tests
    if (k === "author" && v && typeof v === "object") {
      if (profileUserId(row.authorId) !== (v as Row).userId) return false;
    } else if (v && typeof v === "object" && "in" in (v as Row)) {
      if (!(v as { in: unknown[] }).in.includes(row[k])) return false;
    } else if (row[k] !== v) {
      return false;
    }
  }
  return true;
}

function withIncludes(a: Row): Row {
  return {
    ...a,
    author: store.profiles.find((p) => p.id === a.authorId) ?? { id: a.authorId, handle: "author", displayName: "Author" },
    category: null,
    tags: [],
    knowledgeMetadata: null,
  };
}

const articleModel = {
  create: async ({ data }: { data: Row }) => {
    const row: Row = {
      id: `art-${++store.seq}`,
      viewCount: 0, saveCount: 0, reactionCount: 0, commentCount: 0, shareCount: 0,
      publishedAt: null, rejectionReason: null,
      createdAt: new Date(), updatedAt: new Date(),
      ...data,
    };
    store.articles.push(row);
    return row;
  },
  findUnique: async ({ where }: { where: Row }) => store.articles.find((a) => matchWhere(a, where)) ?? null,
  findFirst: async ({ where }: { where: Row }) => {
    const a = store.articles.find((x) => matchWhere(x, where));
    return a ? withIncludes(a) : null;
  },
  findMany: async ({ where }: { where?: Row }) =>
    store.articles.filter((a) => matchWhere(a, where ?? {})).map(withIncludes),
  update: async ({ where, data }: { where: Row; data: Row }) => {
    const a = store.articles.find((x) => matchWhere(x, where));
    if (!a) throw new Error("Record not found");
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === "object" && "increment" in (v as Row)) {
        a[k] = (a[k] as number) + (v as { increment: number }).increment;
      } else {
        a[k] = v;
      }
    }
    a.updatedAt = new Date();
    return a;
  },
};

const db: Record<string, unknown> = {
  articleAuthorProfile: {
    findUnique: async ({ where }: { where: Row }) => store.profiles.find((p) => matchWhere(p, where)) ?? null,
    create: async ({ data }: { data: Row }) => {
      const row: Row = { id: `prof-${++store.seq}`, isActive: true, followerCount: 0, ...data };
      store.profiles.push(row);
      return row;
    },
    findMany: async ({ where }: { where?: Row }) => store.profiles.filter((p) => matchWhere(p, where ?? {})),
  },
  article: articleModel,
  articleModerationEvent: { create: async ({ data }: { data: Row }) => { store.modEvents.push(data); return data; } },
  articleEditorialReview: { create: async ({ data }: { data: Row }) => { store.reviews.push(data); return data; } },
  articleCategory: { findMany: async () => store.categories },
  // tx param is typed loosely; the route under test casts the transaction
  // client to its own TxDB shape. `db` is annotated above to avoid TS7022
  // (self-reference in initializer).
  $transaction: async <T>(fn: (tx: Record<string, unknown>) => Promise<T>): Promise<T> => fn(db),
};

// ── Auth mock ────────────────────────────────────────────────────────────────

type Role = "admin" | "superadmin" | "engineer" | "viewer";
let currentUser: { id: string; name: string; email: string; role: Role } | null = null;
function setUser(role: Role | null, id = "user-1") {
  currentUser = role ? { id, name: "Test User", email: "t@test.io", role } : null;
}

async function load() {
  vi.resetModules();
  vi.doMock("@/lib/auth/session", () => ({ getCurrentUser: async () => currentUser }));
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => db }));
  const submit = await import("../submit/route");
  const approve = await import("../review/[id]/approve/route");
  const articlesDb = await import("@/lib/articles/db");
  return { submitPOST: submit.POST, approvePOST: approve.POST, ...articlesDb };
}

function submitReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/articles/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

/** The exact gate the public /articles/[slug] page + generateMetadata apply. */
function isPubliclyVisible(a: { status?: string; visibility?: string } | null): boolean {
  return !!a && a.status === "PUBLISHED" && a.visibility === "PUBLIC";
}

beforeEach(() => { resetStore(); currentUser = null; vi.resetModules(); });
afterEach(() => { vi.doUnmock("@/lib/auth/session"); vi.doUnmock("@/lib/db/prisma"); });

// ════════════════════════════════════════════════════════════════════════════
// A. Full happy path (English)
// ════════════════════════════════════════════════════════════════════════════

describe("full publish workflow — English", () => {
  it("submit → approve → public detail resolves by the SAME slug; appears in list + management", async () => {
    setUser("admin");
    const api = await load();

    // 1. Submit for review.
    const subRes = await api.submitPOST(submitReq({ title: "Predictive Maintenance Guide", content: "Body.", language: "EN", action: "submit" }));
    expect(subRes.status).toBe(200);
    const sub = await subRes.json();
    expect(sub.article.status).toBe("SUBMITTED");
    expect(sub.article.visibility).toBe("PRIVATE");
    const submittedSlug: string = sub.article.slug;
    const articleId: string = sub.article.id;
    expect(submittedSlug).toBeTruthy();
    expect(submittedSlug).not.toContain("undefined");
    expect(submittedSlug).not.toContain("null");

    // Before approval it is NOT publicly visible.
    const draftDetail = await api.getArticleDetailBySlug(submittedSlug);
    expect(isPubliclyVisible(draftDetail)).toBe(false);
    expect((await api.getPublicArticles()).some((a) => a.id === articleId)).toBe(false);

    // 2. Approve/publish.
    const apRes = await api.approvePOST(new Request("http://localhost/x", { method: "POST" }), idParams(articleId));
    expect(apRes.status).toBe(200);
    const ap = await apRes.json();
    expect(ap.ok).toBe(true);
    expect(ap.article.status).toBe("PUBLISHED");
    // Identifier continuity: approve returns the SAME slug submit persisted.
    expect(ap.article.slug).toBe(submittedSlug);

    // 3. Public detail now resolves the SAME slug and passes the page gate.
    const detail = await api.getArticleDetailBySlug(submittedSlug);
    expect(isPubliclyVisible(detail)).toBe(true);
    expect(detail!.title).toBe("Predictive Maintenance Guide");

    // 4. Appears in the public Journal list.
    expect((await api.getPublicArticles()).some((a) => a.id === articleId && a.slug === submittedSlug)).toBe(true);

    // 5. Remains visible in the author's management list.
    const mine = await api.getUserArticles("user-1");
    const mineRow = mine.find((a) => a.id === articleId);
    expect(mineRow?.status).toBe("PUBLISHED");
    expect(mineRow?.slug).toBe(submittedSlug);
  });

  it("the locale-aware canonical URL a client builds resolves (no /articles/undefined)", async () => {
    setUser("admin");
    const api = await load();
    const sub = await (await api.submitPOST(submitReq({ title: "Motor Bearings 101", content: "x", language: "EN", action: "submit" }))).json();
    await api.approvePOST(new Request("http://localhost/x", { method: "POST" }), idParams(sub.article.id));

    // The exact template every UI link uses: `/${locale}/articles/${slug}`.
    const href = `/en/articles/${sub.article.slug}`;
    expect(href).not.toMatch(/\/(undefined|null)\b/);
    const slugFromHref = href.split("/").pop()!;
    expect(isPubliclyVisible(await api.getArticleDetailBySlug(slugFromHref))).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// B. Persian route
// ════════════════════════════════════════════════════════════════════════════

describe("full publish workflow — Persian", () => {
  it("Persian article publishes; slug is non-empty and resolves under /fa", async () => {
    setUser("superadmin");
    const api = await load();
    const sub = await (await api.submitPOST(submitReq({ title: "راهنمای نگهداری پیشگیرانه", content: "متن مقاله", language: "FA", action: "submit" }))).json();
    expect(sub.article.slug).toBeTruthy();
    expect(sub.article.slug).not.toContain("undefined");

    await api.approvePOST(new Request("http://localhost/x", { method: "POST" }), idParams(sub.article.id));

    const faHref = `/fa/articles/${sub.article.slug}`;
    expect(faHref.startsWith("/fa/articles/")).toBe(true);
    const detail = await api.getArticleDetailBySlug(sub.article.slug);
    expect(isPubliclyVisible(detail)).toBe(true);
    expect(detail!.language).toBe("FA");
    expect(detail!.title).toBe("راهنمای نگهداری پیشگیرانه");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// D. Unpublished isolation
// ════════════════════════════════════════════════════════════════════════════

describe("unpublished isolation", () => {
  it("a DRAFT is not publicly visible and absent from the public list", async () => {
    setUser("admin");
    const api = await load();
    const sub = await (await api.submitPOST(submitReq({ title: "Secret Draft", content: "x", action: "draft" }))).json();
    expect(sub.article.status).toBe("DRAFT");

    expect(isPubliclyVisible(await api.getArticleDetailBySlug(sub.article.slug))).toBe(false);
    expect((await api.getPublicArticles()).some((a) => a.id === sub.article.id)).toBe(false);
  });

  it("a SUBMITTED (in-review) article is not publicly visible", async () => {
    setUser("admin");
    const api = await load();
    const sub = await (await api.submitPOST(submitReq({ title: "Pending Review", content: "x", action: "submit" }))).json();
    expect(isPubliclyVisible(await api.getArticleDetailBySlug(sub.article.slug))).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// E. Missing-identifier protection
// ════════════════════════════════════════════════════════════════════════════

describe("identifier integrity", () => {
  it("submit always persists a usable slug even for a non-latin/degenerate title", async () => {
    setUser("admin");
    const api = await load();
    const sub = await (await api.submitPOST(submitReq({ title: "★☆★", content: "x", action: "submit" }))).json();
    expect(typeof sub.article.slug).toBe("string");
    expect(sub.article.slug.length).toBeGreaterThan(0);
    expect(sub.article.slug).not.toContain("undefined");
    expect(`/en/articles/${sub.article.slug}`).not.toMatch(/\/(undefined|null)\b/);
  });

  it("a nonexistent slug is not publicly visible (page would 404)", async () => {
    setUser("admin");
    const api = await load();
    expect(await api.getArticleDetailBySlug("does-not-exist-zzz")).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// F. Existing published article compatibility
// ════════════════════════════════════════════════════════════════════════════

describe("existing article compatibility", () => {
  it("a pre-existing published article resolves by its slug and lists", async () => {
    // Seed a profile + already-published article directly.
    store.profiles.push({ id: "prof-x", userId: "user-x", handle: "legacy", displayName: "Legacy", isActive: true, followerCount: 0 });
    store.articles.push({
      id: "art-legacy", title: "Legacy Published", slug: "legacy-published-abc123",
      excerpt: "e", content: "c", language: "EN", contentType: "TECHNICAL_ARTICLE",
      status: "PUBLISHED", visibility: "PUBLIC", noIndex: false, authorId: "prof-x",
      viewCount: 5, reactionCount: 0, publishedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    });
    setUser("admin");
    const api = await load();
    expect(isPubliclyVisible(await api.getArticleDetailBySlug("legacy-published-abc123"))).toBe(true);
    expect((await api.getPublicArticles()).some((a) => a.slug === "legacy-published-abc123")).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// G / STEP 12 — Role & security contracts (no side effects on denial)
// ════════════════════════════════════════════════════════════════════════════

describe("workflow security contracts", () => {
  it("anonymous cannot submit (401), nothing persisted", async () => {
    setUser(null);
    const api = await load();
    const res = await api.submitPOST(submitReq({ title: "x", content: "y", action: "submit" }));
    expect(res.status).toBe(401);
    expect(store.articles).toHaveLength(0);
  });

  it("anonymous cannot approve (401)", async () => {
    // Seed a submitted article.
    store.profiles.push({ id: "p1", userId: "u1", handle: "a", displayName: "A" });
    store.articles.push({ id: "art-s", title: "S", slug: "s-1", content: "c", status: "SUBMITTED", visibility: "PRIVATE", authorId: "p1" });
    setUser(null);
    const api = await load();
    const res = await api.approvePOST(new Request("http://localhost/x", { method: "POST" }), idParams("art-s"));
    expect(res.status).toBe(401);
    expect(store.articles[0].status).toBe("SUBMITTED"); // unchanged
    expect(store.modEvents).toHaveLength(0);
  });

  it("a non-admin (engineer) cannot approve (403); article stays submitted, no audit", async () => {
    store.profiles.push({ id: "p1", userId: "u1", handle: "a", displayName: "A" });
    store.articles.push({ id: "art-s", title: "S", slug: "s-1", content: "c", status: "SUBMITTED", visibility: "PRIVATE", authorId: "p1" });
    setUser("engineer", "u2");
    const api = await load();
    const res = await api.approvePOST(new Request("http://localhost/x", { method: "POST" }), idParams("art-s"));
    expect(res.status).toBe(403);
    expect(store.articles[0].status).toBe("SUBMITTED");
    expect(store.articles[0].visibility).toBe("PRIVATE");
    expect(store.modEvents).toHaveLength(0);
    expect(store.reviews).toHaveLength(0);
  });

  it("a viewer cannot approve (403)", async () => {
    store.profiles.push({ id: "p1", userId: "u1", handle: "a", displayName: "A" });
    store.articles.push({ id: "art-s", title: "S", slug: "s-1", content: "c", status: "SUBMITTED", visibility: "PRIVATE", authorId: "p1" });
    setUser("viewer", "u3");
    const api = await load();
    const res = await api.approvePOST(new Request("http://localhost/x", { method: "POST" }), idParams("art-s"));
    expect(res.status).toBe(403);
    expect(store.articles[0].status).toBe("SUBMITTED");
  });

  it("approving a non-reviewable (already published) article is a 409, not a re-publish", async () => {
    store.profiles.push({ id: "p1", userId: "u1", handle: "a", displayName: "A" });
    store.articles.push({ id: "art-p", title: "P", slug: "p-1", content: "c", status: "PUBLISHED", visibility: "PUBLIC", authorId: "p1" });
    setUser("admin");
    const api = await load();
    const res = await api.approvePOST(new Request("http://localhost/x", { method: "POST" }), idParams("art-p"));
    expect(res.status).toBe(409);
  });

  it("approving a nonexistent article returns 404", async () => {
    setUser("admin");
    const api = await load();
    const res = await api.approvePOST(new Request("http://localhost/x", { method: "POST" }), idParams("no-such"));
    expect(res.status).toBe(404);
  });
});
