import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetSessionDocuments, seedSessionDocument } from "@/lib/documents/__tests__/tenant-fixtures";
import {
  ORG_A,
  ORG_B,
  member,
  mockGuards,
  unmockGuards,
  docRequest,
  orgActorCalls,
  type GuardState,
} from "../../__tests__/org-guard-harness";

/**
 * Phase 17B / F-1 / F-2 — POST /api/documents/search route tests.
 *
 * The org guards are mocked through `org-guard-harness.ts`; the search itself
 * (mock embeddings, session chunk store, parent-Document tenant join) is real.
 *
 * The session-mode chunk buffer is shared across all tests via globalThis —
 * reset in beforeEach so each test starts from a clean slate, exactly like
 * the other document route tests.
 */

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL", "DOCUMENT_EMBEDDINGS_PROVIDER"] as const;
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
  unmockGuards();
});

async function indexChunk(documentId: string, tenantId: string | null, text: string) {
  seedSessionDocument(documentId, tenantId);
  const { documentTextChunkRepository } = await import("@/lib/documents/chunk-repository");
  const { embedDocumentChunks } = await import("@/lib/documents/embedding");
  await documentTextChunkRepository().createMany([
    { documentId, position: 0, text, charCount: text.length, metadata: {} },
  ]);
  await embedDocumentChunks(documentId);
}

function searchRequest(body: unknown) {
  return docRequest("/api/documents/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function loadRoute(state: GuardState) {
  await mockGuards(state);
  return import("../route");
}

const CANARY_B = "tenant b confidential relay settings canary 51c0";

// ─── authorization ────────────────────────────────────────────────────────────

describe("/api/documents/search — guard chain", () => {
  const refusals: Array<[string, GuardState, number, string]> = [
    ["unauthenticated", { kind: "refused", code: "AUTHENTICATION_REQUIRED" }, 401, "AUTHENTICATION_REQUIRED"],
    ["ambiguous organization", { kind: "refused", code: "ORGANIZATION_SELECTION_REQUIRED" }, 409, "ORGANIZATION_SELECTION_REQUIRED"],
    ["no organization", { kind: "refused", code: "ORGANIZATION_CONTEXT_REQUIRED" }, 409, "ORGANIZATION_CONTEXT_REQUIRED"],
    ["authenticated non-member", { kind: "nonMember" }, 403, "ORGANIZATION_SCOPE_REQUIRED"],
    ["MEMBER (no view_documents)", member("MEMBER"), 403, "forbidden"],
  ];

  for (const [name, state, status, code] of refusals) {
    it(`${name} → ${status} ${code}; no match is returned`, async () => {
      await indexChunk("doc-b", ORG_B, CANARY_B);
      await indexChunk("doc-a", ORG_A, "tenant a relay settings");
      const { POST } = await loadRoute(state);
      const res = await POST(searchRequest({ query: CANARY_B }));
      expect(res.status).toBe(status);
      const body = await res.json();
      expect(body.error).toBe(code);
      expect(body.matches).toBeUndefined();
    });
  }

  for (const role of ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"]) {
    it(`${role} holds view_documents → 200`, async () => {
      const { POST } = await loadRoute(member(role));
      expect((await POST(searchRequest({ query: "motor fault" }))).status).toBe(200);
    });
  }
});

// ─── request validation ───────────────────────────────────────────────────────

describe("/api/documents/search — request validation", () => {
  it("rejects a body with no query field — 400 query_required", async () => {
    const { POST } = await loadRoute(member("ADMIN"));
    const res = await POST(searchRequest({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("query_required");
  });

  it("rejects an empty string query — 400 query_required", async () => {
    const { POST } = await loadRoute(member("ADMIN"));
    const res = await POST(searchRequest({ query: "" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("query_required");
  });

  it("rejects a whitespace-only query — 400 query_required", async () => {
    const { POST } = await loadRoute(member("ADMIN"));
    const res = await POST(searchRequest({ query: "   " }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("query_required");
  });

  it("rejects a non-string query value — 400 query_required", async () => {
    const { POST } = await loadRoute(member("ADMIN"));
    const res = await POST(searchRequest({ query: 42 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("query_required");
  });

  it("rejects malformed JSON body — 400 invalid_json", async () => {
    const { POST } = await loadRoute(member("ADMIN"));
    const req = docRequest("/api/documents/search", {
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
  it("returns 200 with an empty matches array when no chunks are embedded", async () => {
    const { POST } = await loadRoute(member("ADMIN"));
    const res = await POST(searchRequest({ query: "motor overheating fault" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matches).toEqual([]);
  });

  it("returns 200 with matches after chunks have been indexed", async () => {
    const queryText = "siemens s7-1200 cpu fault watchdog timeout";
    await indexChunk("doc-search-1", ORG_A, queryText);
    const { POST } = await loadRoute(member("ADMIN"));
    const res = await POST(searchRequest({ query: queryText }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matches.length).toBeGreaterThan(0);
    const [m] = body.matches;
    expect(typeof m.chunkId).toBe("string");
    expect(m.documentId).toBe("doc-search-1");
    expect(typeof m.score).toBe("number");
    expect(m.score).toBeGreaterThan(0);
  });

  it("match text is the original chunk text — not truncated or transformed", async () => {
    const chunkText = "abb acs580 drive overcurrent trip fault investigation procedure";
    await indexChunk("doc-search-2", ORG_A, chunkText);
    const { POST } = await loadRoute(member("ADMIN"));
    const body = await (await POST(searchRequest({ query: chunkText }))).json();
    expect(body.matches[0].text).toBe(chunkText);
  });
});

// ─── safe failure behavior ────────────────────────────────────────────────────

describe("/api/documents/search — safe failure contract", () => {
  it("never returns a 5xx — always 200 for a valid query that just finds nothing", async () => {
    const { POST } = await loadRoute(member("ADMIN"));
    expect((await POST(searchRequest({ query: "plc watchdog reset" }))).status).toBe(200);
  });

  it("never leaks raw internal error text in any response", async () => {
    const { POST } = await loadRoute(member("ADMIN"));
    const text = JSON.stringify(await (await POST(searchRequest({ query: "motor fault" }))).json());
    expect(text).not.toMatch(/stack|ENOENT|at Object\.|at searchDocuments/i);
  });
});

// ─── F-1 / F-2: tenant isolation ──────────────────────────────────────────────

describe("/api/documents/search — tenant isolation", () => {
  it("a member of A never receives tenant B chunks", async () => {
    await indexChunk("doc-b", ORG_B, CANARY_B);
    await indexChunk("doc-a", ORG_A, "tenant a relay settings");
    const { POST } = await loadRoute(member("OWNER"));
    const res = await POST(searchRequest({ query: CANARY_B }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matches.length).toBeGreaterThan(0);
    expect(body.matches.every((m: { documentId: string }) => m.documentId === "doc-a")).toBe(true);
    expect(JSON.stringify(body)).not.toContain("51c0");
  });

  it("a member of B does receive B's chunks (positive control)", async () => {
    await indexChunk("doc-b", ORG_B, CANARY_B);
    const { POST } = await loadRoute(member("VIEWER", ORG_B));
    const body = await (await POST(searchRequest({ query: CANARY_B }))).json();
    expect(body.matches.map((m: { documentId: string }) => m.documentId)).toContain("doc-b");
  });

  it("unassigned (NULL tenant) chunks are never returned", async () => {
    await indexChunk("doc-null", null, CANARY_B);
    const { POST } = await loadRoute(member("OWNER"));
    const body = await (await POST(searchRequest({ query: CANARY_B }))).json();
    expect(body.matches).toEqual([]);
  });

  it("a client-supplied organizationId / tenantId / orgId in the body is ignored", async () => {
    await indexChunk("doc-b", ORG_B, CANARY_B);
    const { POST } = await loadRoute(member("OWNER"));
    const res = await POST(
      searchRequest({ query: CANARY_B, organizationId: ORG_B, tenantId: ORG_B, orgId: ORG_B })
    );
    const body = await res.json();
    expect(body.matches).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("51c0");
    expect(orgActorCalls).toEqual([ORG_A]);
  });
});
