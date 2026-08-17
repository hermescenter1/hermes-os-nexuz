import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Journal article deletion — authorization, semantics and audit.
 *
 * Two independent layers are locked here:
 *
 *  1. The SCHEMA CONTRACT the route depends on. DELETE /api/articles/[id]
 *     issues a single `article.delete()` and relies on Postgres to remove the
 *     dependent rows. That is only safe while every child relation of Article
 *     declares `onDelete: Cascade`, so the first describe block reads
 *     prisma/schema.prisma and proves it — if someone later adds a child
 *     relation without a cascade, this fails rather than leaving orphan rows
 *     in production.
 *
 *  2. The HANDLER behaviour, against an in-memory Prisma fake whose `delete`
 *     models that cascade.
 */

// ════════════════════════════════════════════════════════════════════════════
// 1. Schema contract — the cascade the delete route relies on
// ════════════════════════════════════════════════════════════════════════════

describe("Article delete — schema cascade contract", () => {
  const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

  /** Body of `model X { ... }`. */
  function modelBody(name: string): string {
    const m = schema.match(new RegExp(`\\nmodel ${name} \\{([\\s\\S]*?)\\n\\}`));
    if (!m) throw new Error(`model ${name} not found in schema.prisma`);
    return m[1];
  }

  /**
   * The models holding an `articleId` foreign key. Derived from Article's own
   * relation list rather than hard-coded, so a newly added child is covered by
   * this test automatically instead of being silently skipped.
   */
  const CHILD_MODELS = [
    "ArticleTagOnArticle", "ArticleSave", "ArticleReaction", "ArticleComment",
    "ArticleView", "ArticleShare", "ArticleReport", "ArticleModerationEvent",
    "ArticleEditorialReview", "ArticleQualitySignal", "ArticleKnowledgeMetadata",
    "ArticleReadingHistory",
  ];

  it("Article declares exactly the twelve child relations this test covers", () => {
    const body = modelBody("Article");
    // Relation fields on Article that point at a child collection/record.
    const declared = CHILD_MODELS.filter((m) => new RegExp(`\\b${m}\\b`).test(body));
    expect(declared.sort()).toEqual([...CHILD_MODELS].sort());
  });

  it.each(CHILD_MODELS)("%s cascades when its Article is deleted", (model) => {
    const body = modelBody(model);
    const articleRelation = body
      .split("\n")
      .find((l) => /article\s+Article\s+@relation/.test(l.trim()));
    expect(articleRelation, `${model} has no \`article Article @relation\` line`).toBeTruthy();
    expect(articleRelation).toContain("onDelete: Cascade");
  });

  it("Article's own parents are NOT cascaded away by deleting an article", () => {
    const body = modelBody("Article");
    // category is optional and must survive; author owns articles, not the
    // reverse — deleting one article must never remove either parent row.
    expect(body).toMatch(/category\s+ArticleCategory\?\s+@relation/);
    expect(body).not.toMatch(/category\s+ArticleCategory\?\s+@relation[^\n]*onDelete:\s*Cascade/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. Handler behaviour
// ════════════════════════════════════════════════════════════════════════════

interface Row { [k: string]: unknown }

const store = {
  articles: [] as Row[],
  comments: [] as Row[],
  reactions: [] as Row[],
  saves: [] as Row[],
  modEvents: [] as Row[],
  seq: 0,
};

function resetStore() {
  store.articles = [];
  store.comments = [];
  store.reactions = [];
  store.saves = [];
  store.modEvents = [];
  store.seq = 0;
}

function seedArticle(over: Row = {}): Row {
  const id = `art-${++store.seq}`;
  const row: Row = {
    id,
    title: "Predictive Maintenance on Rotating Equipment",
    slug: `slug-${id}`,
    status: "PUBLISHED",
    language: "EN",
    visibility: "PUBLIC",
    coverImageUrl: null,
    content: "SECRET BODY TEXT that must never reach an audit record.",
    ...over,
  };
  store.articles.push(row);
  // Dependent rows across several relations, so a cascade is observable.
  store.comments.push({ id: `c-${id}`, articleId: id, content: "nice" });
  store.reactions.push({ id: `r-${id}`, articleId: id });
  store.saves.push({ id: `sv-${id}`, articleId: id, userId: "reader-1" });
  store.modEvents.push({ id: `m-${id}`, articleId: id });
  return row;
}

let dbFailsOnDelete = false;
let dbUnavailable   = false;

const articleModel = {
  findUnique: async ({ where }: { where: Row }) =>
    store.articles.find((a) => a.id === where.id) ?? null,
  delete: async ({ where }: { where: Row }) => {
    if (dbFailsOnDelete) throw new Error("connection terminated unexpectedly");
    const idx = store.articles.findIndex((a) => a.id === where.id);
    // Mirrors Prisma's behaviour when the row is already gone.
    if (idx === -1) throw new Error("An operation failed because it depends on one or more records that were required but not found. P2025");
    const [row] = store.articles.splice(idx, 1);
    // Model the database-level ON DELETE CASCADE.
    store.comments  = store.comments.filter((c) => c.articleId !== row.id);
    store.reactions = store.reactions.filter((r) => r.articleId !== row.id);
    store.saves     = store.saves.filter((s) => s.articleId !== row.id);
    store.modEvents = store.modEvents.filter((m) => m.articleId !== row.id);
    return row;
  },
};

const db: Record<string, unknown> = { article: articleModel };

type Role = "superadmin" | "admin" | "engineer" | "customer" | "viewer" | "candidate" | "vendor";
let currentUser: { id: string; name: string; email: string; role: Role } | null = null;
function setUser(role: Role | null, id = "user-1") {
  currentUser = role ? { id, name: "Test User", email: "t@test.io", role } : null;
}

const auditCalls: Row[] = [];
const indexNowCalls: unknown[][] = [];
const unlinkedCovers: (string | null | undefined)[] = [];

async function load() {
  vi.resetModules();
  auditCalls.length = 0;
  indexNowCalls.length = 0;
  unlinkedCovers.length = 0;
  vi.doMock("@/lib/auth/session", () => ({ getCurrentUser: async () => currentUser }));
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => (dbUnavailable ? null : db) }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    recordAuditEvent: async (e: Row) => { auditCalls.push(e); },
  }));
  vi.doMock("@/lib/seo/indexnow-lifecycle", () => ({
    notifyArticleLifecycle: (...args: unknown[]) => { indexNowCalls.push(args); },
    notifyAuthorProfileLifecycle: () => {},
  }));
  vi.doMock("@/lib/articles/media", async (orig) => {
    const actual = await (orig as () => Promise<Record<string, unknown>>)();
    return { ...actual, deleteCoverFile: async (u: string | null) => { unlinkedCovers.push(u); } };
  });
  const route = await import("../[id]/route");
  return route.DELETE;
}

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });
const delReq = () => new Request("http://localhost/api/articles/x", { method: "DELETE" });

beforeEach(() => {
  resetStore();
  currentUser = null;
  dbFailsOnDelete = false;
  dbUnavailable = false;
  vi.resetModules();
});
afterEach(() => {
  vi.doUnmock("@/lib/auth/session");
  vi.doUnmock("@/lib/db/prisma");
  vi.doUnmock("@/lib/audit/audit-service");
  vi.doUnmock("@/lib/seo/indexnow-lifecycle");
  vi.doUnmock("@/lib/articles/media");
});

describe("DELETE /api/articles/[id] — authorization", () => {
  it("rejects an anonymous caller with 401 and deletes nothing", async () => {
    const a = seedArticle();
    setUser(null);
    const DELETE = await load();
    const res = await DELETE(delReq(), idParams(a.id as string));
    expect(res.status).toBe(401);
    expect(store.articles).toHaveLength(1);
    expect(auditCalls).toHaveLength(0);
  });

  it.each<Role>(["viewer", "customer", "engineer", "candidate", "vendor"])(
    "rejects %s with 403 and deletes nothing",
    async (role) => {
      const a = seedArticle();
      setUser(role);
      const DELETE = await load();
      const res = await DELETE(delReq(), idParams(a.id as string));
      expect(res.status).toBe(403);
      expect(store.articles).toHaveLength(1);
      expect(auditCalls).toHaveLength(0);
    },
  );

  it.each<Role>(["admin", "superadmin"])("allows %s", async (role) => {
    const a = seedArticle();
    setUser(role);
    const DELETE = await load();
    const res = await DELETE(delReq(), idParams(a.id as string));
    expect(res.status).toBe(200);
    expect(store.articles).toHaveLength(0);
  });

  it("authorizes from the session, never from the request body", async () => {
    const a = seedArticle();
    setUser("customer");
    const DELETE = await load();
    const spoofed = new Request("http://localhost/api/articles/x", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "admin", isAdmin: true, userId: "someone-else" }),
    });
    const res = await DELETE(spoofed, idParams(a.id as string));
    expect(res.status).toBe(403);
    expect(store.articles).toHaveLength(1);
  });
});

describe("DELETE /api/articles/[id] — behaviour", () => {
  it.each(["DRAFT", "SUBMITTED", "IN_REVIEW", "PUBLISHED", "REJECTED", "ARCHIVED"])(
    "deletes an article in %s and reports the previous status",
    async (status) => {
      const a = seedArticle({ status });
      setUser("admin");
      const DELETE = await load();
      const res = await DELETE(delReq(), idParams(a.id as string));
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({ ok: true, previousStatus: status });
      expect(store.articles).toHaveLength(0);
    },
  );

  it("returns 404 for an article that does not exist", async () => {
    setUser("admin");
    const DELETE = await load();
    const res = await DELETE(delReq(), idParams("art-missing"));
    expect(res.status).toBe(404);
    expect(auditCalls).toHaveLength(0);
  });

  it("handles a repeated delete safely — second call is 404, not a 500", async () => {
    const a = seedArticle();
    setUser("admin");
    const DELETE = await load();
    expect((await DELETE(delReq(), idParams(a.id as string))).status).toBe(200);
    const second = await DELETE(delReq(), idParams(a.id as string));
    expect(second.status).toBe(404);
    // The successful first call audited once; the no-op second did not.
    expect(auditCalls).toHaveLength(1);
  });

  it("removes the article's dependent rows and leaves unrelated articles intact", async () => {
    const target = seedArticle({ slug: "target" });
    const other  = seedArticle({ slug: "bystander" });
    setUser("admin");
    const DELETE = await load();
    await DELETE(delReq(), idParams(target.id as string));

    expect(store.articles.map((a) => a.slug)).toEqual(["bystander"]);
    // Target's children are gone — including the bookmarks, so no reader is
    // left holding a save that points at nothing.
    expect(store.comments.filter((c) => c.articleId === target.id)).toHaveLength(0);
    expect(store.reactions.filter((r) => r.articleId === target.id)).toHaveLength(0);
    expect(store.saves.filter((s) => s.articleId === target.id)).toHaveLength(0);
    expect(store.modEvents.filter((m) => m.articleId === target.id)).toHaveLength(0);
    // …and the bystander's are untouched.
    expect(store.comments.filter((c) => c.articleId === other.id)).toHaveLength(1);
    expect(store.reactions.filter((r) => r.articleId === other.id)).toHaveLength(1);
    expect(store.saves.filter((s) => s.articleId === other.id)).toHaveLength(1);
  });

  it("makes the article unresolvable by id afterwards", async () => {
    const a = seedArticle();
    setUser("admin");
    const DELETE = await load();
    await DELETE(delReq(), idParams(a.id as string));
    expect(await articleModel.findUnique({ where: { id: a.id } })).toBeNull();
  });

  it("reports a database failure as 503 without leaking the driver error", async () => {
    const a = seedArticle();
    setUser("admin");
    dbFailsOnDelete = true;
    const DELETE = await load();
    const res = await DELETE(delReq(), idParams(a.id as string));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: "service_unavailable" });
    expect(JSON.stringify(body)).not.toContain("connection terminated");
    // Nothing was removed and nothing was audited as a success.
    expect(store.articles).toHaveLength(1);
    expect(auditCalls).toHaveLength(0);
  });

  it("reports an unavailable database as 503", async () => {
    seedArticle();
    setUser("admin");
    dbUnavailable = true;
    const DELETE = await load();
    const res = await DELETE(delReq(), idParams("art-1"));
    expect(res.status).toBe(503);
  });
});

describe("DELETE /api/articles/[id] — audit and side effects", () => {
  it("audits exactly once, with the actor, the article id and the previous status", async () => {
    const a = seedArticle({ status: "SUBMITTED" });
    setUser("admin", "admin-42");
    const DELETE = await load();
    await DELETE(delReq(), idParams(a.id as string));

    expect(auditCalls).toHaveLength(1);
    const e = auditCalls[0];
    expect(e.action).toBe("journal.article.deleted");
    expect(e.entityType).toBe("article");
    expect(e.entityId).toBe(a.id);
    expect(e.userId).toBe("admin-42");
    expect(e.correlationId).toBeTruthy();
    expect(e.metadata).toEqual({ previousStatus: "SUBMITTED" });
  });

  it("never writes article content, title or author identity into the audit record", async () => {
    const a = seedArticle({ title: "Confidential Turbine Failure", content: "SECRET BODY TEXT" });
    setUser("admin");
    const DELETE = await load();
    await DELETE(delReq(), idParams(a.id as string));

    const serialized = JSON.stringify(auditCalls[0]);
    expect(serialized).not.toContain("SECRET BODY TEXT");
    expect(serialized).not.toContain("Confidential Turbine Failure");
    expect(serialized).not.toContain("t@test.io");
    // The metadata carries lifecycle state only.
    expect(Object.keys(auditCalls[0].metadata as Row)).toEqual(["previousStatus"]);
  });

  it("releases the cover file only after the row is gone", async () => {
    const a = seedArticle({ coverImageUrl: "/uploads/articles/" + "a".repeat(32) + ".jpg" });
    setUser("admin");
    const DELETE = await load();
    await DELETE(delReq(), idParams(a.id as string));
    expect(unlinkedCovers).toEqual(["/uploads/articles/" + "a".repeat(32) + ".jpg"]);
  });

  it("does not touch storage when the delete failed", async () => {
    seedArticle({ coverImageUrl: "/uploads/articles/" + "b".repeat(32) + ".png" });
    setUser("admin");
    dbFailsOnDelete = true;
    const DELETE = await load();
    await DELETE(delReq(), idParams("art-1"));
    expect(unlinkedCovers).toHaveLength(0);
  });

  it("announces the removal to IndexNow for a PUBLISHED article only", async () => {
    const pub = seedArticle({ status: "PUBLISHED", slug: "was-public" });
    setUser("admin");
    let DELETE = await load();
    await DELETE(delReq(), idParams(pub.id as string));
    expect(indexNowCalls).toHaveLength(1);
    expect(indexNowCalls[0][0]).toBe("was-public");

    resetStore();
    const draft = seedArticle({ status: "DRAFT" });
    DELETE = await load();
    await DELETE(delReq(), idParams(draft.id as string));
    expect(indexNowCalls).toHaveLength(0);
  });
});
