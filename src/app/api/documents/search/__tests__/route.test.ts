import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Phase 17B — POST /api/documents/search route tests.
 *
 * Auth is mocked via vi.doMock exactly like every other route test in this
 * codebase — getCurrentUser requires a request-scoped cookie context that
 * this environment does not provide; only isAuthConfigured() (a plain env-var
 * check) is exercised directly.
 *
 * The session-mode chunk buffer is shared across all tests via globalThis —
 * reset in beforeEach so each test starts from a clean slate, exactly like
 * the other document route tests.
 */

const ENV_KEYS = [
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "HERMES_STORAGE_MODE",
  "DATABASE_URL",
  "DOCUMENT_EMBEDDINGS_PROVIDER",
] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.DOCUMENT_EMBEDDINGS_PROVIDER = "mock";
  (globalThis as unknown as { __hermesDocumentTextChunks?: unknown[] }).__hermesDocumentTextChunks = [];
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.doUnmock("@/lib/auth/session");
});

function mockUser(role: "admin" | "engineer" | "viewer" | null) {
  vi.doMock("@/lib/auth/session", () => ({
    getCurrentUser: async () =>
      role ? { id: "u1", email: "u@test.com", name: "Test User", role } : null,
  }));
}

function searchRequest(body: unknown): Request {
  return new Request("http://localhost/api/documents/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── authorization ────────────────────────────────────────────────────────────

describe("/api/documents/search — authorization", () => {
  it("rejects when auth is not configured (no ADMIN_EMAIL set) — 403", async () => {
    const { POST } = await import("../route");
    const res = await POST(searchRequest({ query: "motor fault" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("auth not configured");
  });

  it("rejects an unauthenticated request — 401", async () => {
    process.env.ADMIN_EMAIL = "a@test.com";
    process.env.ADMIN_PASSWORD = "x";
    mockUser(null);
    const { POST } = await import("../route");
    const res = await POST(searchRequest({ query: "motor fault" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthorized");
  });

  it("rejects engineer role — 403", async () => {
    process.env.ADMIN_EMAIL = "a@test.com";
    process.env.ADMIN_PASSWORD = "x";
    mockUser("engineer");
    const { POST } = await import("../route");
    const res = await POST(searchRequest({ query: "motor fault" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden");
  });

  it("rejects viewer role — 403", async () => {
    process.env.ADMIN_EMAIL = "a@test.com";
    process.env.ADMIN_PASSWORD = "x";
    mockUser("viewer");
    const { POST } = await import("../route");
    const res = await POST(searchRequest({ query: "motor fault" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden");
  });
});

// ─── request validation ───────────────────────────────────────────────────────

describe("/api/documents/search — request validation", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAIL = "a@test.com";
    process.env.ADMIN_PASSWORD = "x";
    mockUser("admin");
  });

  it("rejects a body with no query field — 400 query_required", async () => {
    const { POST } = await import("../route");
    const res = await POST(searchRequest({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("query_required");
  });

  it("rejects an empty string query — 400 query_required", async () => {
    const { POST } = await import("../route");
    const res = await POST(searchRequest({ query: "" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("query_required");
  });

  it("rejects a whitespace-only query — 400 query_required", async () => {
    const { POST } = await import("../route");
    const res = await POST(searchRequest({ query: "   " }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("query_required");
  });

  it("rejects a non-string query value — 400 query_required", async () => {
    const { POST } = await import("../route");
    const res = await POST(searchRequest({ query: 42 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("query_required");
  });

  it("rejects malformed JSON body — 400 invalid_json", async () => {
    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/documents/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not valid json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_json");
  });
});

// ─── happy path ───────────────────────────────────────────────────────────────

describe("/api/documents/search — happy path", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAIL = "a@test.com";
    process.env.ADMIN_PASSWORD = "x";
    mockUser("admin");
  });

  it("returns 200 with an empty matches array when no chunks are embedded", async () => {
    const { POST } = await import("../route");
    const res = await POST(searchRequest({ query: "motor overheating fault" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.matches)).toBe(true);
    expect(body.matches).toEqual([]);
  });

  it("returns 200 with matches after chunks have been indexed", async () => {
    const { documentTextChunkRepository } = await import("@/lib/documents/chunk-repository");
    const { embedDocumentChunks } = await import("@/lib/documents/embedding");
    const queryText = "siemens s7-1200 cpu fault watchdog timeout";
    await documentTextChunkRepository().createMany([
      { documentId: "doc-search-1", position: 0, text: queryText, charCount: queryText.length, metadata: {} },
    ]);
    await embedDocumentChunks("doc-search-1");

    const { POST } = await import("../route");
    const res = await POST(searchRequest({ query: queryText }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.matches)).toBe(true);
    expect(body.matches.length).toBeGreaterThan(0);
    const [m] = body.matches;
    expect(typeof m.chunkId).toBe("string");
    expect(m.documentId).toBe("doc-search-1");
    expect(typeof m.score).toBe("number");
    expect(m.score).toBeGreaterThan(0);
  });

  it("match text is the original chunk text — not truncated or transformed", async () => {
    const { documentTextChunkRepository } = await import("@/lib/documents/chunk-repository");
    const { embedDocumentChunks } = await import("@/lib/documents/embedding");
    const chunkText = "abb acs580 drive overcurrent trip fault investigation procedure";
    await documentTextChunkRepository().createMany([
      { documentId: "doc-search-2", position: 0, text: chunkText, charCount: chunkText.length, metadata: {} },
    ]);
    await embedDocumentChunks("doc-search-2");

    const { POST } = await import("../route");
    const res = await POST(searchRequest({ query: chunkText }));
    const body = await res.json();
    expect(body.matches[0].text).toBe(chunkText);
  });
});

// ─── safe failure behavior ────────────────────────────────────────────────────

describe("/api/documents/search — safe failure contract", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAIL = "a@test.com";
    process.env.ADMIN_PASSWORD = "x";
    mockUser("admin");
  });

  it("never returns a 5xx — always 200 for a valid query that just finds nothing", async () => {
    const { POST } = await import("../route");
    const res = await POST(searchRequest({ query: "plc watchdog reset" }));
    expect(res.status).toBe(200);
  });

  it("never leaks raw internal error text in any response", async () => {
    const { POST } = await import("../route");
    const res = await POST(searchRequest({ query: "motor fault" }));
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/stack|ENOENT|at Object\.|at searchDocuments/i);
  });
});
