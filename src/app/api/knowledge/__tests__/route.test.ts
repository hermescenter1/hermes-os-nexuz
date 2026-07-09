import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockNoUser, mockViewer, mockEngineer, unmockAuth } from "@/test/mock-auth";

/**
 * Phase 82D.2 — /api/knowledge security regression suite.
 *
 * Locks the Phase 82B hardening:
 *  - writes (POST/PATCH/DELETE) require the "authoring" capability
 *    (401 without a session, 403 for a non-authoring role);
 *  - the public GET returns ONLY published articles to anonymous /
 *    non-authoring callers, while authoring callers still see the full
 *    draft/review board.
 *
 * Session-store mode only (no DATABASE_URL); the in-process article store is
 * reset before each test. Handlers are imported directly after the auth mock
 * is set — no Next server, no Postgres. Org-scoped /api/knowledge/* subroutes
 * have their own gate and are out of scope here.
 */

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  (globalThis as Record<string, unknown>).__hermesArticleDrafts = [];
  (globalThis as Record<string, unknown>).__hermesAudit = [];
  vi.resetModules();
  // Default: an authoring engineer so setup/seed calls reach the repository.
  mockEngineer();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  unmockAuth();
});

function postReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/knowledge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/knowledge", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(id: string): Request {
  return new Request(`http://localhost/api/knowledge?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** Seed one draft, one review and one published article via the authoring
 *  POST handler (the default engineer mock is active in beforeEach). */
async function seedArticles() {
  const { POST } = await import("../route");
  await POST(postReq({ title: "Draft Article", status: "draft" }));
  await POST(postReq({ title: "Review Article", status: "review" }));
  await POST(postReq({ title: "Published Article", status: "published" }));
}

// ── Public GET: draft/review never leak ────────────────────────────────────

describe("GET /api/knowledge — public read is published-only", () => {
  it("unauthenticated GET returns 200 with { storageMode, articles }", async () => {
    vi.resetModules();
    mockNoUser();
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("storageMode");
    expect(Array.isArray(body.articles)).toBe(true);
  });

  it("unauthenticated GET returns only published articles (no draft, no review)", async () => {
    await seedArticles();

    vi.resetModules();
    mockNoUser();
    const { GET } = await import("../route");
    const body = await (await GET()).json();

    expect(body.articles).toHaveLength(1);
    expect(body.articles.every((a: { status: string }) => a.status === "published")).toBe(true);
    const statuses = body.articles.map((a: { status: string }) => a.status);
    expect(statuses).not.toContain("draft");
    expect(statuses).not.toContain("review");
  });

  it("viewer (non-authoring) GET also returns only published articles", async () => {
    await seedArticles();

    vi.resetModules();
    mockViewer();
    const { GET } = await import("../route");
    const body = await (await GET()).json();

    expect(body.articles).toHaveLength(1);
    expect(body.articles[0].status).toBe("published");
  });

  it("authoring (engineer) GET returns all articles including draft and review", async () => {
    await seedArticles();

    // Default engineer mock is still active.
    const { GET } = await import("../route");
    const body = await (await GET()).json();

    expect(body.articles).toHaveLength(3);
    const statuses = body.articles.map((a: { status: string }) => a.status).sort();
    expect(statuses).toEqual(["draft", "published", "review"]);
  });
});

// ── POST protection ────────────────────────────────────────────────────────

describe("POST /api/knowledge — write protection", () => {
  it("returns 401 for an unauthenticated caller", async () => {
    vi.resetModules();
    mockNoUser();
    const { POST } = await import("../route");
    const res = await POST(postReq({ title: "Hacky Article" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required." });
  });

  it("returns 403 for a viewer (non-authoring) caller", async () => {
    vi.resetModules();
    mockViewer();
    const { POST } = await import("../route");
    const res = await POST(postReq({ title: "Hacky Article" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "Insufficient permissions." });
  });

  it("lets an authoring caller create a draft article", async () => {
    const { POST } = await import("../route");
    const res = await POST(postReq({ title: "Authored Article", status: "draft" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("storageMode");
    expect(body.article.id).toBeTruthy();
    expect(body.article.title).toBe("Authored Article");
    expect(body.article.status).toBe("draft");
  });
});

// ── PATCH protection ─────────────────────────────────────────────────────────

describe("PATCH /api/knowledge — write protection", () => {
  it("returns 401 for an unauthenticated caller", async () => {
    vi.resetModules();
    mockNoUser();
    const { PATCH } = await import("../route");
    const res = await PATCH(patchReq({ id: "article-x", status: "published" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required." });
  });

  it("returns 403 for a viewer (non-authoring) caller", async () => {
    vi.resetModules();
    mockViewer();
    const { PATCH } = await import("../route");
    const res = await PATCH(patchReq({ id: "article-x", status: "published" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "Insufficient permissions." });
  });

  it("lets an authoring caller move an article to review then published", async () => {
    const { POST, PATCH } = await import("../route");
    const created = await (await POST(postReq({ title: "To Review", status: "draft" }))).json();

    const reviewed = await PATCH(patchReq({ id: created.article.id, status: "review" }));
    expect(reviewed.status).toBe(200);
    expect((await reviewed.json()).article.status).toBe("review");

    const published = await PATCH(patchReq({ id: created.article.id, status: "published" }));
    expect(published.status).toBe(200);
    expect((await published.json()).article.status).toBe("published");
  });
});

// ── DELETE protection ────────────────────────────────────────────────────────

describe("DELETE /api/knowledge — write protection", () => {
  it("returns 401 for an unauthenticated caller", async () => {
    vi.resetModules();
    mockNoUser();
    const { DELETE } = await import("../route");
    const res = await DELETE(deleteReq("article-x"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required." });
  });

  it("returns 403 for a viewer (non-authoring) caller", async () => {
    vi.resetModules();
    mockViewer();
    const { DELETE } = await import("../route");
    const res = await DELETE(deleteReq("article-x"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "Insufficient permissions." });
  });

  it("lets an authoring caller delete an existing article", async () => {
    const { POST, DELETE } = await import("../route");
    const created = await (await POST(postReq({ title: "To Delete", status: "draft" }))).json();

    const res = await DELETE(deleteReq(created.article.id));
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe(true);
  });
});

// ── Regression invariant: a public caller is fully locked out ────────────────

describe("regression invariant — public caller cannot mutate or read drafts", () => {
  it("cannot create, publish, delete, or see draft/review articles", async () => {
    // Seed draft + review + published as an authoring engineer.
    await seedArticles();

    vi.resetModules();
    mockNoUser();
    const { GET, POST, PATCH, DELETE } = await import("../route");

    expect((await POST(postReq({ title: "Nope" }))).status).toBe(401);
    expect((await PATCH(patchReq({ id: "any", status: "published" }))).status).toBe(401);
    expect((await DELETE(deleteReq("any"))).status).toBe(401);

    const body = await (await GET()).json();
    expect(body.articles.every((a: { status: string }) => a.status === "published")).toBe(true);
  });
});
