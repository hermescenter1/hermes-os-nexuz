import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Journal engagement — reactions, comments, replies and moderation.
 *
 * Exercised at the route-handler boundary against an in-memory Prisma fake
 * that models the parts of the real schema the behaviour depends on: the
 * ArticleReaction composite unique key, ArticleComment's parentId self-relation
 * and its isActive flag.
 *
 * No real user, article, comment or reaction is created anywhere — the store
 * below is rebuilt for every test.
 */

interface Row { [k: string]: unknown }

const store = {
  articles:  [] as Row[],
  reactions: [] as Row[],
  comments:  [] as Row[],
  saves:     [] as Row[],
  profiles:  [] as Row[],
  users:     [] as Row[],
  seq: 0,
};

function reset() {
  store.articles = [];
  store.reactions = [];
  store.comments = [];
  store.saves = [];
  store.profiles = [];
  store.users = [];
  store.seq = 0;
}

function seedArticle(over: Row = {}): Row {
  const id = `art-${++store.seq}`;
  const row: Row = { id, slug: `slug-${id}`, status: "PUBLISHED", visibility: "PUBLIC", authorId: "prof-1", ...over };
  store.articles.push(row);
  return row;
}

function seedUser(id: string, name: string) {
  store.users.push({ id, name, email: `${id}@test.invalid`, role: "customer" });
}

function seedProfile(userId: string, over: Row = {}) {
  store.profiles.push({
    userId, displayName: `Profile ${userId}`, avatarUrl: null,
    headline: "Rotating Equipment Engineer", verifiedExpert: false, handle: `h-${userId}`,
    ...over,
  });
}

function seedComment(over: Row = {}): Row {
  const id = `c-${++store.seq}`;
  const row: Row = {
    id, articleId: "art-1", userId: "u-1", content: "seeded", parentId: null,
    isActive: true, createdAt: new Date(1700000000000 + store.seq * 1000), updatedAt: new Date(),
    ...over,
  };
  store.comments.push(row);
  return row;
}

/** Minimal `where` matcher supporting equality, { in: [] } and null. */
function match(row: Row, where: Row = {}): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (v !== null && typeof v === "object" && "in" in (v as Row)) {
      if (!(v as { in: unknown[] }).in.includes(row[k])) return false;
    } else if (v === null) {
      if (row[k] != null) return false;
    } else if (row[k] !== v) {
      return false;
    }
  }
  return true;
}

let dbDown = false;

const db: Record<string, unknown> = {
  article: {
    findUnique: async ({ where }: { where: Row }) =>
      store.articles.find((a) => a.id === where.id) ?? null,
  },
  articleReaction: {
    groupBy: async ({ where }: { where: Row }) => {
      const rows = store.reactions.filter((r) => match(r, where));
      const by = new Map<string, number>();
      for (const r of rows) by.set(String(r.reactionType), (by.get(String(r.reactionType)) ?? 0) + 1);
      return [...by].map(([reactionType, n]) => ({ reactionType, _count: { _all: n } }));
    },
    findUnique: async ({ where }: { where: Row }) => {
      const k = where.userId_articleId as Row | undefined;
      if (!k) return null;
      return store.reactions.find((r) => r.userId === k.userId && r.articleId === k.articleId) ?? null;
    },
    upsert: async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
      const k = where.userId_articleId as Row;
      const found = store.reactions.find((r) => r.userId === k.userId && r.articleId === k.articleId);
      if (found) { Object.assign(found, update); return found; }
      // The composite unique key is what makes "one reaction per reader" true;
      // the fake enforces it the same way the database does.
      const row = { id: `rx-${++store.seq}`, ...create };
      store.reactions.push(row);
      return row;
    },
    delete: async ({ where }: { where: Row }) => {
      const k = where.userId_articleId as Row;
      const i = store.reactions.findIndex((r) => r.userId === k.userId && r.articleId === k.articleId);
      if (i === -1) throw new Error("record to delete does not exist P2025");
      return store.reactions.splice(i, 1)[0];
    },
  },
  articleComment: {
    findMany: async ({ where, take, cursor, skip, orderBy }: {
      where: Row; take?: number; cursor?: Row; skip?: number; orderBy?: Row;
    }) => {
      let rows = store.comments.filter((c) => match(c, where));
      // Mirrors the route's total order: createdAt, then id as the tie-breaker
      // that makes the id cursor deterministic.
      rows = rows.sort((a, b) =>
        Number(a.createdAt) - Number(b.createdAt) || String(a.id).localeCompare(String(b.id)),
      );
      void orderBy;
      if (cursor) {
        const at = rows.findIndex((r) => r.id === cursor.id);
        if (at >= 0) rows = rows.slice(at + (skip ?? 0));
      }
      return typeof take === "number" ? rows.slice(0, take) : rows;
    },
    findUnique: async ({ where }: { where: Row }) =>
      store.comments.find((c) => c.id === where.id) ?? null,
    count: async ({ where }: { where: Row }) => store.comments.filter((c) => match(c, where)).length,
    create: async ({ data }: { data: Row }) => {
      const row: Row = {
        id: `c-${++store.seq}`, isActive: true,
        createdAt: new Date(1700000000000 + store.seq * 1000), updatedAt: new Date(),
        ...data,
      };
      store.comments.push(row);
      return row;
    },
    update: async ({ where, data }: { where: Row; data: Row }) => {
      const row = store.comments.find((c) => c.id === where.id);
      if (!row) throw new Error("P2025");
      Object.assign(row, data);
      return row;
    },
  },
  articleSave: {
    findUnique: async ({ where }: { where: Row }) => {
      const k = where.userId_articleId as Row | undefined;
      if (!k) return null;
      return store.saves.find((s) => s.userId === k.userId && s.articleId === k.articleId) ?? null;
    },
    upsert: async ({ where, create }: { where: Row; create: Row }) => {
      const k = where.userId_articleId as Row;
      const found = store.saves.find((s) => s.userId === k.userId && s.articleId === k.articleId);
      // The composite unique key is what makes a second save a no-op instead of
      // a duplicate row; the fake enforces it exactly as the database does.
      if (found) return found;
      const row = { id: `sv-${++store.seq}`, createdAt: new Date(1700000000000 + store.seq * 1000), ...create };
      store.saves.push(row);
      return row;
    },
    delete: async ({ where }: { where: Row }) => {
      const k = where.userId_articleId as Row;
      const i = store.saves.findIndex((s) => s.userId === k.userId && s.articleId === k.articleId);
      if (i === -1) throw new Error("record to delete does not exist P2025");
      return store.saves.splice(i, 1)[0];
    },
    findMany: async ({ where, take, cursor, skip }: {
      where: Row; take?: number; cursor?: Row; skip?: number;
    }) => {
      const articleWhere = (where.article ?? {}) as Row;
      let rows = store.saves
        .filter((s) => s.userId === where.userId)
        .filter((s) => {
          const art = store.articles.find((a) => a.id === s.articleId);
          return art ? match(art, articleWhere) : false;
        })
        .sort((a, b) => Number(b.createdAt) - Number(a.createdAt) || String(b.id).localeCompare(String(a.id)))
        // Annotated as Row[]: spreading an index-signature type alongside a
        // concrete `article` key otherwise narrows the element type and loses
        // `id`, which the cursor lookup below needs.
        .map((s): Row => ({
          ...s,
          article: {
            ...store.articles.find((a) => a.id === s.articleId),
            author: { id: "prof-1", handle: "h", displayName: "A" },
            category: null,
            tags: [],
          },
        }));
      if (cursor) {
        const at = rows.findIndex((r) => r.id === cursor.id);
        if (at >= 0) rows = rows.slice(at + (skip ?? 0));
      }
      return typeof take === "number" ? rows.slice(0, take) : rows;
    },
  },
  articleAuthorProfile: {
    findMany: async ({ where }: { where: Row }) => store.profiles.filter((p) => match(p, where)),
  },
  user: {
    findMany: async ({ where }: { where: Row }) => store.users.filter((u) => match(u, where)),
  },
};

type Role = "superadmin" | "admin" | "engineer" | "customer" | "viewer" | "candidate" | "vendor";
let currentUser: { id: string; name: string; email: string; role: Role } | null = null;
function setUser(role: Role | null, id = "u-1") {
  currentUser = role ? { id, name: "Test", email: "t@test.invalid", role } : null;
}

let rateLimitOk = true;
const auditCalls: Row[] = [];

async function load() {
  vi.resetModules();
  auditCalls.length = 0;
  vi.doMock("@/lib/auth/session", () => ({ getCurrentUser: async () => currentUser }));
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => (dbDown ? null : db) }));
  vi.doMock("@/lib/auth/rate-limiter", () => ({
    checkRateLimit: async () => rateLimitOk,
    retryAfter: () => 60,
  }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    recordAuditEvent: async (e: Row) => { auditCalls.push(e); },
  }));
  const reaction = await import("../[id]/reaction/route");
  const comments = await import("../[id]/comments/route");
  const commentItem = await import("../[id]/comments/[commentId]/route");
  const saved = await import("../saved/route");
  const lib = await import("@/lib/articles/engagement");
  return {
    reactionGET: reaction.GET, reactionPUT: reaction.PUT,
    commentsGET: comments.GET, commentsPOST: comments.POST,
    commentDELETE: commentItem.DELETE,
    savedGET: saved.GET, savedPOST: saved.POST, savedDELETE: saved.DELETE,
    isArticleSaved: lib.isArticleSaved,
  };
}

const P  = (id: string) => ({ params: Promise.resolve({ id }) });
const PC = (id: string, commentId: string) => ({ params: Promise.resolve({ id, commentId }) });
const jsonReq = (body: unknown, method = "PUT") =>
  new Request("http://localhost/x", {
    method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
const getReq = (qs = "") => new Request(`http://localhost/x${qs}`);
const delReq = () => new Request("http://localhost/x", { method: "DELETE" });

beforeEach(() => { reset(); currentUser = null; rateLimitOk = true; dbDown = false; vi.resetModules(); });
afterEach(() => {
  vi.doUnmock("@/lib/auth/session");
  vi.doUnmock("@/lib/db/prisma");
  vi.doUnmock("@/lib/auth/rate-limiter");
  vi.doUnmock("@/lib/audit/audit-service");
});

// ════════════════════════════════════════════════════════════════════════════
// Reactions
// ════════════════════════════════════════════════════════════════════════════

describe("article reactions — authorization", () => {
  it("lets an anonymous reader READ the aggregate", async () => {
    const a = seedArticle();
    store.reactions.push({ id: "r1", userId: "u-9", articleId: a.id, reactionType: "HELPFUL" });
    setUser(null);
    const { reactionGET } = await load();
    const res = await reactionGET(getReq(), P(a.id as string));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.counts.HELPFUL).toBe(1);
    expect(body.total).toBe(1);
    // An anonymous reader has no reaction of their own, and learns nothing
    // about who reacted.
    expect(body.viewer).toBeNull();
    expect(JSON.stringify(body)).not.toContain("u-9");
  });

  it("refuses an anonymous MUTATION with 401 and writes nothing", async () => {
    const a = seedArticle();
    setUser(null);
    const { reactionPUT } = await load();
    const res = await reactionPUT(jsonReq({ type: "INSIGHTFUL" }), P(a.id as string));
    expect(res.status).toBe(401);
    expect(store.reactions).toHaveLength(0);
  });

  it("returns 404 for an unpublished article rather than revealing it", async () => {
    const draft = seedArticle({ status: "DRAFT", visibility: "PRIVATE" });
    setUser("customer");
    const { reactionPUT, reactionGET } = await load();
    expect((await reactionPUT(jsonReq({ type: "HELPFUL" }), P(draft.id as string))).status).toBe(404);
    expect((await reactionGET(getReq(), P(draft.id as string))).status).toBe(404);
    expect(store.reactions).toHaveLength(0);
  });

  it("applies the rate limit", async () => {
    const a = seedArticle();
    setUser("customer");
    rateLimitOk = false;
    const { reactionPUT } = await load();
    expect((await reactionPUT(jsonReq({ type: "HELPFUL" }), P(a.id as string))).status).toBe(429);
    expect(store.reactions).toHaveLength(0);
  });
});

describe("article reactions — vocabulary and invariant", () => {
  it.each(["INSIGHTFUL", "HELPFUL", "DETAILED", "PRACTICAL"])("accepts %s", async (type) => {
    const a = seedArticle();
    setUser("customer");
    const { reactionPUT } = await load();
    const res = await reactionPUT(jsonReq({ type }), P(a.id as string));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ viewer: type });
  });

  it.each(["LIKE", "LOVE", "CELEBRATE", "SUPPORT", "ANGRY", "insightful", "", "1"])(
    "rejects %s as outside the closed vocabulary",
    async (type) => {
      const a = seedArticle();
      setUser("customer");
      const { reactionPUT } = await load();
      expect((await reactionPUT(jsonReq({ type }), P(a.id as string))).status).toBe(400);
      expect(store.reactions).toHaveLength(0);
    },
  );

  it("keeps exactly one reaction per reader — a second type REPLACES the first", async () => {
    const a = seedArticle();
    setUser("customer", "u-1");
    const { reactionPUT } = await load();

    await reactionPUT(jsonReq({ type: "HELPFUL" }), P(a.id as string));
    const res = await reactionPUT(jsonReq({ type: "INSIGHTFUL" }), P(a.id as string));
    const body = await res.json();

    expect(store.reactions).toHaveLength(1);
    expect(body.viewer).toBe("INSIGHTFUL");
    expect(body.counts.HELPFUL).toBe(0);
    expect(body.counts.INSIGHTFUL).toBe(1);
    expect(body.total).toBe(1);
  });

  it("toggles the SAME reaction off", async () => {
    const a = seedArticle();
    setUser("customer", "u-1");
    const { reactionPUT } = await load();

    await reactionPUT(jsonReq({ type: "DETAILED" }), P(a.id as string));
    const res = await reactionPUT(jsonReq({ type: "DETAILED" }), P(a.id as string));
    const body = await res.json();

    expect(store.reactions).toHaveLength(0);
    expect(body.viewer).toBeNull();
    expect(body.total).toBe(0);
  });

  it("counts different readers independently and reports each reader's own state", async () => {
    const a = seedArticle();
    const { reactionPUT } = await load();

    setUser("customer", "u-1");
    let api = await load();
    await api.reactionPUT(jsonReq({ type: "PRACTICAL" }), P(a.id as string));

    setUser("engineer", "u-2");
    api = await load();
    const res = await api.reactionPUT(jsonReq({ type: "PRACTICAL" }), P(a.id as string));
    const body = await res.json();

    expect(store.reactions).toHaveLength(2);
    expect(body.counts.PRACTICAL).toBe(2);
    expect(body.viewer).toBe("PRACTICAL");
    void reactionPUT;
  });

  it("refuses a body carrying counts or a spoofed user id", async () => {
    const a = seedArticle();
    setUser("customer");
    const { reactionPUT } = await load();
    for (const body of [
      { type: "HELPFUL", count: 9999 },
      { type: "HELPFUL", userId: "u-999" },
      { type: "HELPFUL", total: 500 },
    ]) {
      expect((await reactionPUT(jsonReq(body), P(a.id as string))).status).toBe(400);
    }
    expect(store.reactions).toHaveLength(0);
  });

  it("reports a database outage as 503, NOT as a missing article", async () => {
    const a = seedArticle();
    setUser("customer");
    dbDown = true;
    const { reactionPUT, reactionGET } = await load();
    // Answering 404 here would tell a reader their bookmarked article had been
    // deleted when the database is merely unreachable.
    expect((await reactionPUT(jsonReq({ type: "HELPFUL" }), P(a.id as string))).status).toBe(503);
    expect((await reactionGET(getReq(), P(a.id as string))).status).toBe(503);
  });

  it("reports a database outage on the comment endpoints as 503 too", async () => {
    const a = seedArticle();
    setUser("customer");
    dbDown = true;
    const { commentsGET, commentsPOST } = await load();
    expect((await commentsGET(getReq(), P(a.id as string))).status).toBe(503);
    expect((await commentsPOST(jsonReq({ body: "hi" }, "POST"), P(a.id as string))).status).toBe(503);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Comments
// ════════════════════════════════════════════════════════════════════════════

describe("article comments — reading", () => {
  it("is publicly readable on a published article", async () => {
    const a = seedArticle();
    seedUser("u-5", "Reza");
    seedComment({ articleId: a.id, userId: "u-5", content: "Great analysis." });
    setUser(null);
    const { commentsGET } = await load();
    const res = await commentsGET(getReq(), P(a.id as string));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.comments).toHaveLength(1);
    expect(body.comments[0].body).toBe("Great analysis.");
    expect(body.total).toBe(1);
  });

  it("hides withdrawn comments from readers", async () => {
    const a = seedArticle();
    seedUser("u-5", "Reza");
    seedComment({ articleId: a.id, userId: "u-5", content: "visible" });
    seedComment({ articleId: a.id, userId: "u-5", content: "withdrawn", isActive: false });
    setUser(null);
    const { commentsGET } = await load();
    const body = await (await commentsGET(getReq(), P(a.id as string))).json();
    expect(body.comments.map((c: Row) => c.body)).toEqual(["visible"]);
    expect(body.total).toBe(1);
  });

  it("never exposes the commenter's email or role", async () => {
    const a = seedArticle();
    seedUser("u-5", "Reza");
    seedProfile("u-5", { displayName: "Reza N.", verifiedExpert: true });
    seedComment({ articleId: a.id, userId: "u-5" });
    setUser(null);
    const { commentsGET } = await load();
    const raw = JSON.stringify(await (await commentsGET(getReq(), P(a.id as string))).json());
    expect(raw).not.toContain("@test.invalid");
    expect(raw).not.toContain("customer");
    // The PUBLIC professional identity is present.
    expect(raw).toContain("Reza N.");
    expect(raw).toContain("Rotating Equipment Engineer");
  });

  it("bounds the page and never returns everything", async () => {
    const a = seedArticle();
    seedUser("u-5", "Reza");
    for (let i = 0; i < 40; i++) seedComment({ articleId: a.id, userId: "u-5", content: `c${i}` });
    setUser(null);
    const { commentsGET } = await load();

    const dflt = await (await commentsGET(getReq(), P(a.id as string))).json();
    expect(dflt.comments).toHaveLength(20);
    expect(dflt.nextCursor).toBeTruthy();

    // An oversized request is clamped, not honoured.
    const huge = await (await commentsGET(getReq("?limit=9999"), P(a.id as string))).json();
    expect(huge.comments.length).toBeLessThanOrEqual(50);
  });

  it("404s for an unpublished article", async () => {
    const draft = seedArticle({ status: "DRAFT", visibility: "PRIVATE" });
    setUser(null);
    const { commentsGET } = await load();
    expect((await commentsGET(getReq(), P(draft.id as string))).status).toBe(404);
  });
});

describe("article comments — posting", () => {
  it("refuses an anonymous post with 401", async () => {
    const a = seedArticle();
    setUser(null);
    const { commentsPOST } = await load();
    expect((await commentsPOST(jsonReq({ body: "hi" }, "POST"), P(a.id as string))).status).toBe(401);
    expect(store.comments).toHaveLength(0);
  });

  it("lets an authenticated customer post", async () => {
    const a = seedArticle();
    seedUser("u-1", "Author");
    setUser("customer", "u-1");
    const { commentsPOST } = await load();
    const res = await commentsPOST(jsonReq({ body: "  Solid root-cause work.  " }, "POST"), P(a.id as string));
    expect(res.status).toBe(201);
    const body = await res.json();
    // Trimmed by the schema before it is stored.
    expect(body.comment.body).toBe("Solid root-cause work.");
    expect(store.comments).toHaveLength(1);
    expect(store.comments[0].userId).toBe("u-1");
  });

  it.each([
    ["empty",        ""],
    ["whitespace",   "   \n  "],
  ])("rejects a %s body", async (_l, body) => {
    const a = seedArticle();
    setUser("customer");
    const { commentsPOST } = await load();
    expect((await commentsPOST(jsonReq({ body }, "POST"), P(a.id as string))).status).toBe(400);
    expect(store.comments).toHaveLength(0);
  });

  it("rejects an oversized body", async () => {
    const a = seedArticle();
    setUser("customer");
    const { commentsPOST } = await load();
    const res = await commentsPOST(jsonReq({ body: "x".repeat(2001) }, "POST"), P(a.id as string));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "comment_too_long" });
    expect(store.comments).toHaveLength(0);
  });

  it("stores markup as literal text — it is never interpreted", async () => {
    const a = seedArticle();
    seedUser("u-1", "A");
    setUser("customer", "u-1");
    const payload = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    const { commentsPOST } = await load();
    const res = await commentsPOST(jsonReq({ body: payload }, "POST"), P(a.id as string));
    expect(res.status).toBe(201);
    // Stored verbatim as characters. Safety comes from the render path never
    // using dangerouslySetInnerHTML, not from mangling the author's text.
    expect(store.comments[0].content).toBe(payload);
  });

  it("ignores no client-supplied field — a spoofed userId or isActive is refused outright", async () => {
    const a = seedArticle();
    setUser("customer", "u-1");
    const { commentsPOST } = await load();
    for (const body of [
      { body: "x", userId: "u-999" },
      { body: "x", isActive: false },
      { body: "x", articleId: "art-999" },
    ]) {
      expect((await commentsPOST(jsonReq(body, "POST"), P(a.id as string))).status).toBe(400);
    }
    expect(store.comments).toHaveLength(0);
  });

  it("applies the rate limit", async () => {
    const a = seedArticle();
    setUser("customer");
    rateLimitOk = false;
    const { commentsPOST } = await load();
    expect((await commentsPOST(jsonReq({ body: "hi" }, "POST"), P(a.id as string))).status).toBe(429);
    expect(store.comments).toHaveLength(0);
  });

  it("refuses to comment on an unpublished article", async () => {
    const draft = seedArticle({ status: "SUBMITTED", visibility: "PRIVATE" });
    setUser("customer");
    const { commentsPOST } = await load();
    expect((await commentsPOST(jsonReq({ body: "hi" }, "POST"), P(draft.id as string))).status).toBe(404);
    expect(store.comments).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Replies — exactly one level
// ════════════════════════════════════════════════════════════════════════════

describe("one-level replies", () => {
  it("accepts a reply to a top-level comment and nests it", async () => {
    const a = seedArticle();
    seedUser("u-1", "A");
    const parent = seedComment({ articleId: a.id, userId: "u-1" });
    setUser("customer", "u-1");
    const { commentsPOST, commentsGET } = await load();

    const res = await commentsPOST(jsonReq({ body: "Agreed.", parentId: parent.id }, "POST"), P(a.id as string));
    expect(res.status).toBe(201);
    expect((await res.json()).comment.parentId).toBe(parent.id);

    const page = await (await commentsGET(getReq(), P(a.id as string))).json();
    expect(page.comments).toHaveLength(1);
    expect(page.comments[0].replies).toHaveLength(1);
    expect(page.comments[0].replies[0].body).toBe("Agreed.");
  });

  it("REFUSES a reply to a reply — the thread stays one level deep", async () => {
    const a = seedArticle();
    seedUser("u-1", "A");
    const parent = seedComment({ articleId: a.id, userId: "u-1" });
    const reply  = seedComment({ articleId: a.id, userId: "u-1", parentId: parent.id });
    setUser("customer", "u-1");
    const { commentsPOST } = await load();

    const res = await commentsPOST(jsonReq({ body: "deeper", parentId: reply.id }, "POST"), P(a.id as string));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "reply_depth_exceeded" });
    // Nothing was re-parented to the top as a consolation.
    expect(store.comments).toHaveLength(2);
  });

  it("REFUSES a parent that belongs to another article", async () => {
    const a = seedArticle();
    const b = seedArticle();
    seedUser("u-1", "A");
    const foreign = seedComment({ articleId: b.id, userId: "u-1" });
    setUser("customer", "u-1");
    const { commentsPOST } = await load();

    const res = await commentsPOST(jsonReq({ body: "x", parentId: foreign.id }, "POST"), P(a.id as string));
    expect(res.status).toBe(404);
    expect(store.comments).toHaveLength(1);
  });

  it("REFUSES a parent that does not exist", async () => {
    const a = seedArticle();
    setUser("customer", "u-1");
    const { commentsPOST } = await load();
    expect((await commentsPOST(jsonReq({ body: "x", parentId: "c-nope" }, "POST"), P(a.id as string))).status).toBe(404);
  });

  it("REFUSES a reply to a withdrawn comment", async () => {
    const a = seedArticle();
    seedUser("u-1", "A");
    const gone = seedComment({ articleId: a.id, userId: "u-1", isActive: false });
    setUser("customer", "u-1");
    const { commentsPOST } = await load();
    expect((await commentsPOST(jsonReq({ body: "x", parentId: gone.id }, "POST"), P(a.id as string))).status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Removal + moderation
// ════════════════════════════════════════════════════════════════════════════

describe("comment removal and moderation", () => {
  it("lets the OWNER withdraw their own comment", async () => {
    const a = seedArticle();
    const c = seedComment({ articleId: a.id, userId: "u-1" });
    setUser("customer", "u-1");
    const { commentDELETE } = await load();
    const res = await commentDELETE(delReq(), PC(a.id as string, c.id as string));
    expect(res.status).toBe(200);
    expect(store.comments[0].isActive).toBe(false);
  });

  it("REFUSES a different customer with 403", async () => {
    const a = seedArticle();
    const c = seedComment({ articleId: a.id, userId: "u-1" });
    setUser("customer", "u-2");
    const { commentDELETE } = await load();
    expect((await commentDELETE(delReq(), PC(a.id as string, c.id as string))).status).toBe(403);
    expect(store.comments[0].isActive).toBe(true);
  });

  it.each<Role>(["engineer", "viewer", "candidate", "vendor"])(
    "REFUSES %s over another reader's comment",
    async (role) => {
      const a = seedArticle();
      const c = seedComment({ articleId: a.id, userId: "u-1" });
      setUser(role, "u-2");
      const { commentDELETE } = await load();
      expect((await commentDELETE(delReq(), PC(a.id as string, c.id as string))).status).toBe(403);
      expect(store.comments[0].isActive).toBe(true);
    },
  );

  it.each<Role>(["admin", "superadmin"])("lets %s moderate any comment", async (role) => {
    const a = seedArticle();
    const c = seedComment({ articleId: a.id, userId: "u-1" });
    setUser(role, "mod-1");
    const { commentDELETE } = await load();
    expect((await commentDELETE(delReq(), PC(a.id as string, c.id as string))).status).toBe(200);
    expect(store.comments[0].isActive).toBe(false);
  });

  it("refuses an anonymous removal", async () => {
    const a = seedArticle();
    const c = seedComment({ articleId: a.id, userId: "u-1" });
    setUser(null);
    const { commentDELETE } = await load();
    expect((await commentDELETE(delReq(), PC(a.id as string, c.id as string))).status).toBe(401);
    expect(store.comments[0].isActive).toBe(true);
  });

  it("reports a comment from ANOTHER article as missing, not as forbidden", async () => {
    const a = seedArticle();
    const b = seedArticle();
    const foreign = seedComment({ articleId: b.id, userId: "u-1" });
    setUser("customer", "u-1"); // the owner — still must not reach it via article a
    const { commentDELETE } = await load();
    expect((await commentDELETE(delReq(), PC(a.id as string, foreign.id as string))).status).toBe(404);
    expect(store.comments[0].isActive).toBe(true);
  });

  it("is safe to repeat", async () => {
    const a = seedArticle();
    const c = seedComment({ articleId: a.id, userId: "u-1" });
    setUser("customer", "u-1");
    const { commentDELETE } = await load();
    expect((await commentDELETE(delReq(), PC(a.id as string, c.id as string))).status).toBe(200);
    expect((await commentDELETE(delReq(), PC(a.id as string, c.id as string))).status).toBe(200);
  });

  it("audits a moderator removal distinctly, and never records the comment body", async () => {
    const a = seedArticle();
    const c = seedComment({ articleId: a.id, userId: "u-1", content: "SENSITIVE COMMENT TEXT" });
    setUser("admin", "mod-7");
    const { commentDELETE } = await load();
    await commentDELETE(delReq(), PC(a.id as string, c.id as string));

    expect(auditCalls).toHaveLength(1);
    const e = auditCalls[0];
    expect(e.action).toBe("journal.comment.moderated");
    expect(e.entityType).toBe("article_comment");
    expect(e.entityId).toBe(c.id);
    expect(e.userId).toBe("mod-7");
    expect(e.correlationId).toBeTruthy();
    expect(JSON.stringify(e)).not.toContain("SENSITIVE COMMENT TEXT");
    expect(e.metadata).toEqual({ articleId: a.id, wasReply: false });
  });

  it("audits a self-withdrawal under a different action", async () => {
    const a = seedArticle();
    const c = seedComment({ articleId: a.id, userId: "u-1" });
    setUser("customer", "u-1");
    const { commentDELETE } = await load();
    await commentDELETE(delReq(), PC(a.id as string, c.id as string));
    expect(auditCalls[0].action).toBe("journal.comment.removed");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Saves / bookmarks
// ════════════════════════════════════════════════════════════════════════════

const saveReq = (articleId: string) =>
  new Request("http://localhost/api/articles/saved", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ articleId }),
  });
const unsaveReq = (articleId: string) =>
  new Request(`http://localhost/api/articles/saved?articleId=${encodeURIComponent(articleId)}`, { method: "DELETE" });

describe("article save — authorization", () => {
  it("refuses an anonymous save with 401 and writes nothing", async () => {
    const a = seedArticle();
    setUser(null);
    const { savedPOST } = await load();
    expect((await savedPOST(saveReq(a.id as string))).status).toBe(401);
    expect(store.saves).toHaveLength(0);
  });

  it("refuses an anonymous unsave and an anonymous list read", async () => {
    const a = seedArticle();
    setUser(null);
    const { savedDELETE, savedGET } = await load();
    expect((await savedDELETE(unsaveReq(a.id as string))).status).toBe(401);
    expect((await savedGET(new Request("http://localhost/api/articles/saved"))).status).toBe(401);
  });

  it("lets an authenticated customer save, creating exactly one row", async () => {
    const a = seedArticle();
    setUser("customer", "u-1");
    const { savedPOST } = await load();
    const res = await savedPOST(saveReq(a.id as string));
    expect(res.status).toBe(200);
    // The historical response shape is preserved — and is now true.
    await expect(res.json()).resolves.toMatchObject({ saved: true, articleId: a.id });
    expect(store.saves).toHaveLength(1);
    expect(store.saves[0].userId).toBe("u-1");
  });

  it("never accepts a userId from the client", async () => {
    const a = seedArticle();
    setUser("customer", "u-1");
    const { savedPOST } = await load();
    const spoof = new Request("http://localhost/api/articles/saved", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ articleId: a.id, userId: "u-999" }),
    });
    // `.strict()` refuses the extra field outright rather than ignoring it.
    expect((await savedPOST(spoof)).status).toBe(400);
    expect(store.saves).toHaveLength(0);
  });
});

describe("article save — idempotence and toggling", () => {
  it("saving twice never creates a duplicate row", async () => {
    const a = seedArticle();
    setUser("customer", "u-1");
    const { savedPOST } = await load();
    await savedPOST(saveReq(a.id as string));
    const second = await savedPOST(saveReq(a.id as string));
    expect(second.status).toBe(200);
    // Guaranteed by @@unique([userId, articleId]), not by a prior read.
    expect(store.saves).toHaveLength(1);
  });

  it("saves then unsaves", async () => {
    const a = seedArticle();
    setUser("customer", "u-1");
    const { savedPOST, savedDELETE } = await load();
    await savedPOST(saveReq(a.id as string));
    expect(store.saves).toHaveLength(1);
    const res = await savedDELETE(unsaveReq(a.id as string));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ unsaved: true });
    expect(store.saves).toHaveLength(0);
  });

  it("unsaving something that was never saved is safe", async () => {
    const a = seedArticle();
    setUser("customer", "u-1");
    const { savedDELETE } = await load();
    expect((await savedDELETE(unsaveReq(a.id as string))).status).toBe(200);
    expect(store.saves).toHaveLength(0);
  });

  it("reads the current reader's save state authoritatively", async () => {
    const a = seedArticle();
    setUser("customer", "u-1");
    const { savedPOST, isArticleSaved } = await load();

    expect(await isArticleSaved(a.id as string, "u-1")).toBe(false);
    await savedPOST(saveReq(a.id as string));
    expect(await isArticleSaved(a.id as string, "u-1")).toBe(true);
    // Another reader's state is independent…
    expect(await isArticleSaved(a.id as string, "u-2")).toBe(false);
    // …and an anonymous reader is always unsaved, without a query.
    expect(await isArticleSaved(a.id as string, null)).toBe(false);
  });

  it("one reader's unsave leaves another reader's save intact", async () => {
    const a = seedArticle();

    setUser("customer", "u-1");
    let api = await load();
    await api.savedPOST(saveReq(a.id as string));

    setUser("engineer", "u-2");
    api = await load();
    await api.savedPOST(saveReq(a.id as string));
    expect(store.saves).toHaveLength(2);

    await api.savedDELETE(unsaveReq(a.id as string));
    expect(store.saves).toHaveLength(1);
    expect(store.saves[0].userId).toBe("u-1");
  });
});

describe("article save — eligibility and failure modes", () => {
  it.each([
    ["DRAFT",     "PRIVATE"],
    ["SUBMITTED", "PRIVATE"],
    ["PUBLISHED", "UNLISTED"],
  ])("refuses to save a %s / %s article with 404", async (status, visibility) => {
    const a = seedArticle({ status, visibility });
    setUser("customer", "u-1");
    const { savedPOST } = await load();
    expect((await savedPOST(saveReq(a.id as string))).status).toBe(404);
    expect(store.saves).toHaveLength(0);
  });

  it("returns 404 for an article that does not exist", async () => {
    setUser("customer", "u-1");
    const { savedPOST } = await load();
    expect((await savedPOST(saveReq("art-missing"))).status).toBe(404);
  });

  it("still allows UNSAVING an article that was unpublished after it was saved", async () => {
    const a = seedArticle();
    setUser("customer", "u-1");
    const { savedPOST, savedDELETE } = await load();
    await savedPOST(saveReq(a.id as string));
    // The article is withdrawn from publication after the bookmark exists.
    a.status = "ARCHIVED";
    // The bookmark must remain removable, or the reader could never clear it.
    expect((await savedDELETE(unsaveReq(a.id as string))).status).toBe(200);
    expect(store.saves).toHaveLength(0);
  });

  it("reports a database outage as 503, not as a missing article", async () => {
    const a = seedArticle();
    setUser("customer", "u-1");
    dbDown = true;
    const { savedPOST, savedDELETE } = await load();
    expect((await savedPOST(saveReq(a.id as string))).status).toBe(503);
    expect((await savedDELETE(unsaveReq(a.id as string))).status).toBe(503);
  });

  it("rejects a malformed body", async () => {
    setUser("customer", "u-1");
    const { savedPOST } = await load();
    for (const body of [{}, { articleId: "" }, { articleId: 123 }]) {
      const req = new Request("http://localhost/api/articles/saved", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      expect((await savedPOST(req)).status).toBe(400);
    }
    expect(store.saves).toHaveLength(0);
  });
});

describe("saved articles list", () => {
  it("returns only this reader's saves", async () => {
    const a = seedArticle({ slug: "mine" });
    const b = seedArticle({ slug: "theirs" });

    setUser("customer", "u-1");
    let api = await load();
    await api.savedPOST(saveReq(a.id as string));

    setUser("engineer", "u-2");
    api = await load();
    await api.savedPOST(saveReq(b.id as string));

    setUser("customer", "u-1");
    api = await load();
    const body = await (await api.savedGET(new Request("http://localhost/api/articles/saved"))).json();
    expect(body.articles.map((x: Row) => x.slug)).toEqual(["mine"]);
  });

  it("omits a bookmark whose article is no longer published or public", async () => {
    const shown  = seedArticle({ slug: "still-public" });
    const hidden = seedArticle({ slug: "withdrawn" });
    setUser("customer", "u-1");
    const api = await load();
    await api.savedPOST(saveReq(shown.id as string));
    await api.savedPOST(saveReq(hidden.id as string));
    expect(store.saves).toHaveLength(2);

    hidden.status = "ARCHIVED";

    const body = await (await api.savedGET(new Request("http://localhost/api/articles/saved"))).json();
    // The row survives — the reader simply cannot reach withdrawn content here.
    expect(body.articles.map((x: Row) => x.slug)).toEqual(["still-public"]);
    expect(store.saves).toHaveLength(2);
  });

  it("is bounded and pages, never returning everything at once", async () => {
    setUser("customer", "u-1");
    const api = await load();
    for (let i = 0; i < 30; i++) {
      const art = seedArticle({ slug: `a${i}` });
      await api.savedPOST(saveReq(art.id as string));
    }
    const dflt = await (await api.savedGET(new Request("http://localhost/api/articles/saved"))).json();
    expect(dflt.articles).toHaveLength(20);
    expect(dflt.nextCursor).toBeTruthy();

    const huge = await (await api.savedGET(new Request("http://localhost/api/articles/saved?limit=9999"))).json();
    expect(huge.articles.length).toBeLessThanOrEqual(50);
  });

  it("returns an empty list rather than failing when the database is down", async () => {
    setUser("customer", "u-1");
    dbDown = true;
    const { savedGET } = await load();
    const res = await savedGET(new Request("http://localhost/api/articles/saved"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ articles: [] });
  });
});
