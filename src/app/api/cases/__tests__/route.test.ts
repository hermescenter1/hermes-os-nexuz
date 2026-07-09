import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockNoUser, mockViewer, mockEngineer, unmockAuth } from "@/test/mock-auth";

/**
 * Phase 82D.2 — /api/cases security regression suite.
 *
 * Locks the Phase 82A hardening:
 *  - writes (POST/PATCH/DELETE) require the "authoring" capability
 *    (401 without a session, 403 for a non-authoring role);
 *  - the public GET returns ONLY published cases to anonymous / non-authoring
 *    callers, while authoring callers still see the full draft board.
 *
 * Session-store mode only (no DATABASE_URL); the in-process case store is
 * reset before each test. Handlers are imported directly after the auth mock
 * is set — no Next server, no Postgres.
 */

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  (globalThis as Record<string, unknown>).__hermesCaseDrafts = [];
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
  return new Request("http://localhost/api/cases", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/cases", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(id: string): Request {
  return new Request(`http://localhost/api/cases?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** Seed one draft, one ready and one published case via the authoring POST
 *  handler (the default engineer mock is active in beforeEach). */
async function seedCases() {
  const { POST } = await import("../route");
  await POST(postReq({ title: "Draft Case", status: "draft" }));
  await POST(postReq({ title: "Ready Case", status: "ready" }));
  await POST(postReq({ title: "Published Case", status: "published" }));
}

// ── Public GET: draft/ready never leak ─────────────────────────────────────

describe("GET /api/cases — public read is published-only", () => {
  it("unauthenticated GET returns 200 with { storageMode, cases }", async () => {
    vi.resetModules();
    mockNoUser();
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("storageMode");
    expect(Array.isArray(body.cases)).toBe(true);
  });

  it("unauthenticated GET returns only published cases (no draft, no ready)", async () => {
    await seedCases();

    vi.resetModules();
    mockNoUser();
    const { GET } = await import("../route");
    const body = await (await GET()).json();

    expect(body.cases).toHaveLength(1);
    expect(body.cases.every((c: { status: string }) => c.status === "published")).toBe(true);
    const statuses = body.cases.map((c: { status: string }) => c.status);
    expect(statuses).not.toContain("draft");
    expect(statuses).not.toContain("ready");
  });

  it("viewer (non-authoring) GET also returns only published cases", async () => {
    await seedCases();

    vi.resetModules();
    mockViewer();
    const { GET } = await import("../route");
    const body = await (await GET()).json();

    expect(body.cases).toHaveLength(1);
    expect(body.cases[0].status).toBe("published");
  });

  it("authoring (engineer) GET returns all cases including draft and ready", async () => {
    await seedCases();

    // Default engineer mock is still active.
    const { GET } = await import("../route");
    const body = await (await GET()).json();

    expect(body.cases).toHaveLength(3);
    const statuses = body.cases.map((c: { status: string }) => c.status).sort();
    expect(statuses).toEqual(["draft", "published", "ready"]);
  });
});

// ── POST protection ────────────────────────────────────────────────────────

describe("POST /api/cases — write protection", () => {
  it("returns 401 for an unauthenticated caller", async () => {
    vi.resetModules();
    mockNoUser();
    const { POST } = await import("../route");
    const res = await POST(postReq({ title: "Hacky Case" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required." });
  });

  it("returns 403 for a viewer (non-authoring) caller", async () => {
    vi.resetModules();
    mockViewer();
    const { POST } = await import("../route");
    const res = await POST(postReq({ title: "Hacky Case" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "Insufficient permissions." });
  });

  it("lets an authoring caller create a draft case", async () => {
    const { POST } = await import("../route");
    const res = await POST(postReq({ title: "Authored Case", status: "draft" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("storageMode");
    expect(body.case.id).toBeTruthy();
    expect(body.case.title).toBe("Authored Case");
    expect(body.case.status).toBe("draft");
  });
});

// ── PATCH protection ─────────────────────────────────────────────────────────

describe("PATCH /api/cases — write protection", () => {
  it("returns 401 for an unauthenticated caller", async () => {
    vi.resetModules();
    mockNoUser();
    const { PATCH } = await import("../route");
    const res = await PATCH(patchReq({ id: "case-x", status: "published" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required." });
  });

  it("returns 403 for a viewer (non-authoring) caller", async () => {
    vi.resetModules();
    mockViewer();
    const { PATCH } = await import("../route");
    const res = await PATCH(patchReq({ id: "case-x", status: "published" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "Insufficient permissions." });
  });

  it("lets an authoring caller publish an existing case", async () => {
    const { POST, PATCH } = await import("../route");
    const created = await (await POST(postReq({ title: "To Publish", status: "draft" }))).json();

    const res = await PATCH(patchReq({ id: created.case.id, status: "published" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.case.status).toBe("published");
  });
});

// ── DELETE protection ────────────────────────────────────────────────────────

describe("DELETE /api/cases — write protection", () => {
  it("returns 401 for an unauthenticated caller", async () => {
    vi.resetModules();
    mockNoUser();
    const { DELETE } = await import("../route");
    const res = await DELETE(deleteReq("case-x"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required." });
  });

  it("returns 403 for a viewer (non-authoring) caller", async () => {
    vi.resetModules();
    mockViewer();
    const { DELETE } = await import("../route");
    const res = await DELETE(deleteReq("case-x"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "Insufficient permissions." });
  });

  it("lets an authoring caller delete an existing case", async () => {
    const { POST, DELETE } = await import("../route");
    const created = await (await POST(postReq({ title: "To Delete", status: "draft" }))).json();

    const res = await DELETE(deleteReq(created.case.id));
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe(true);
  });
});

// ── Regression invariant: a public caller is fully locked out ────────────────

describe("regression invariant — public caller cannot mutate or read drafts", () => {
  it("cannot create, publish, delete, or see draft/ready cases", async () => {
    // Seed a draft + published case as an authoring engineer.
    await seedCases();

    vi.resetModules();
    mockNoUser();
    const { GET, POST, PATCH, DELETE } = await import("../route");

    expect((await POST(postReq({ title: "Nope" }))).status).toBe(401);
    expect((await PATCH(patchReq({ id: "any", status: "published" }))).status).toBe(401);
    expect((await DELETE(deleteReq("any"))).status).toBe(401);

    const body = await (await GET()).json();
    expect(body.cases.every((c: { status: string }) => c.status === "published")).toBe(true);
  });
});
