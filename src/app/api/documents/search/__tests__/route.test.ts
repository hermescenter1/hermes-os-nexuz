import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { BrainOwner } from "@/lib/storage/types";
import {
  ORG_A,
  ORG_B,
  resetSessionDocuments,
  seedSessionDocument,
} from "@/lib/documents/__tests__/tenant-fixtures";

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
  resetSessionDocuments();
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.doUnmock("@/lib/auth/session");
  vi.doUnmock("@/lib/storage/brain-owner");
});

function mockUser(role: "admin" | "engineer" | "viewer" | null) {
  vi.doMock("@/lib/auth/session", () => ({
    getCurrentUser: async () =>
      role ? { id: "u1", email: "u@test.com", name: "Test User", role } : null,
  }));
}

/**
 * F-1: the search is scoped to the caller's server-resolved tenant. Session
 * mode has no membership table (every caller resolves to a personal, org-less
 * scope), so suites that expect matches pin the resolved owner here — exactly
 * what `resolveBrainOwner()` returns for a single-org member in database mode.
 */
function mockOwner(owner: BrainOwner | null) {
  vi.doUnmock("@/lib/storage/brain-owner");
  vi.doMock("@/lib/storage/brain-owner", () => ({
    resolveBrainOwner: async () => owner,
  }));
}

async function indexChunk(documentId: string, tenantId: string | null, text: string) {
  seedSessionDocument(documentId, tenantId);
  const { documentTextChunkRepository } = await import("@/lib/documents/chunk-repository");
  const { embedDocumentChunks } = await import("@/lib/documents/embedding");
  await documentTextChunkRepository().createMany([
    { documentId, position: 0, text, charCount: text.length, metadata: {} },
  ]);
  await embedDocumentChunks(documentId);
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
    mockOwner({ userId: "u1", orgId: ORG_A });
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
    seedSessionDocument("doc-search-1", ORG_A);
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
    seedSessionDocument("doc-search-2", ORG_A);
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

// ─── F-1: tenant isolation (R9) ─────────────────────────────────────────────

describe("/api/documents/search — F-1 tenant isolation", () => {
  const CANARY_B = "tenant b confidential relay settings canary 51c0";

  beforeEach(() => {
    process.env.ADMIN_EMAIL = "a@test.com";
    process.env.ADMIN_PASSWORD = "x";
    mockUser("admin");
  });

  it("an admin whose organization is A never receives tenant B chunks", async () => {
    await indexChunk("doc-b", ORG_B, CANARY_B);
    await indexChunk("doc-a", ORG_A, "tenant a relay settings");
    mockOwner({ userId: "u1", orgId: ORG_A });
    const { POST } = await import("../route");
    const res = await POST(searchRequest({ query: CANARY_B }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matches.length).toBeGreaterThan(0);
    expect(body.matches.every((m: { documentId: string }) => m.documentId === "doc-a")).toBe(true);
    expect(JSON.stringify(body)).not.toContain("51c0");
  });

  it("an admin with no organization (personal scope) gets no matches — never the global index", async () => {
    await indexChunk("doc-b", ORG_B, CANARY_B);
    mockOwner({ userId: "u1", orgId: null });
    const { POST } = await import("../route");
    const body = await (await POST(searchRequest({ query: CANARY_B }))).json();
    expect(body.matches).toEqual([]);
  });

  it("an ambiguous multi-org admin gets no matches", async () => {
    await indexChunk("doc-b", ORG_B, CANARY_B);
    mockOwner({ userId: "u1", orgId: null, ambiguous: true });
    const { POST } = await import("../route");
    const body = await (await POST(searchRequest({ query: CANARY_B }))).json();
    expect(body.matches).toEqual([]);
  });

  it("an unresolvable owner (null) gets no matches", async () => {
    await indexChunk("doc-b", ORG_B, CANARY_B);
    mockOwner(null);
    const { POST } = await import("../route");
    const body = await (await POST(searchRequest({ query: CANARY_B }))).json();
    expect(body.matches).toEqual([]);
  });

  it("a client-supplied organizationId / tenantId in the body is ignored", async () => {
    await indexChunk("doc-b", ORG_B, CANARY_B);
    mockOwner({ userId: "u1", orgId: ORG_A });
    const { POST } = await import("../route");
    const res = await POST(
      searchRequest({ query: CANARY_B, organizationId: ORG_B, tenantId: ORG_B, orgId: ORG_B })
    );
    const body = await res.json();
    expect(body.matches).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("51c0");
  });
});
