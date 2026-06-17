import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Phase 13 — /api/brain route tests.
 *
 * Colocated under `__tests__/` (not a reserved Next.js App Router filename,
 * e.g. `route.ts`/`page.tsx`), so `next build` ignores this directory
 * entirely — confirmed by the unchanged route table in the Phase 13 build.
 *
 * The route handlers (`POST`/`GET`) are plain async functions taking a Web
 * `Request` and returning a `NextResponse` (itself a `Response`), so they
 * can be called directly without a running server.
 */

const ENV_KEYS = [
  "HERMES_AI_ROUTER_ENABLED",
  "AI_PROVIDER_MODE",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "DATABASE_URL",
  "HERMES_STORAGE_MODE",
  "HERMES_RAG_BRAIN_ENABLED",
  "HERMES_RAG_ENABLED",
  "HERMES_RAG_MODE",
  "HERMES_EMBEDDING_PROVIDER",
  "HERMES_DOCUMENT_RAG_ENABLED",
  "DOCUMENT_EMBEDDINGS_PROVIDER",
] as const;
let saved: Record<string, string | undefined>;

function clearAllEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  clearAllEnv();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

// Reused verbatim from the existing industrial/__tests__ suite — already
// verified there to classify as a known (non-unknown) drives/vendor case.
const KNOWN_QUESTION = "ABB ACS580 fault 2310 during acceleration";
const KNOWN_QUESTION_FA = "درایو ACS580 هنگام شتاب‌گیری خطای ۲۳۱۰ اضافه‌جریان می‌دهد";
// Reused verbatim from unknown.test.ts — already verified there to
// classify as Unknown (insufficient evidence).
const UNKNOWN_QUESTION = "The machine behaves strangely";

function postRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/brain", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const DETERMINISTIC_KEYS = [
  "mode",
  "domains",
  "libraries",
  "citations",
  "confidence",
  "safety",
  "vendors",
  "riskLevel",
  "evidence",
  "pipeline",
  "reasoning",
  "probableCauses",
  "recommendedActions",
  "evidenceSummary",
  "humanApprovalRequired",
  "confidenceReport",
  "retrieval",
];

describe("/api/brain POST — feature flag disabled (default)", () => {
  it("never attaches aiEnhancement and keeps every existing field", async () => {
    // HERMES_AI_ROUTER_ENABLED intentionally left unset — the documented default.
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect("aiEnhancement" in body).toBe(false);
    for (const key of DETERMINISTIC_KEYS) {
      expect(body).toHaveProperty(key);
    }
    expect(body.mode).toBe("library");
  });

  it("stays disabled for any non-'true' value, including the literal string 'false'", async () => {
    process.env.HERMES_AI_ROUTER_ENABLED = "false";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    const body = await res.json();
    expect("aiEnhancement" in body).toBe(false);
  });
});

describe("/api/brain POST — feature flag enabled, no provider keys configured", () => {
  it("attaches aiEnhancement as a clean fallback and never crashes", async () => {
    process.env.HERMES_AI_ROUTER_ENABLED = "true";
    // No OPENAI_API_KEY / ANTHROPIC_API_KEY -> every concrete provider
    // degrades to its own mock; the router never throws.
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.aiEnhancement).toBeDefined();
    expect(body.aiEnhancement.enabled).toBe(true);
    expect(body.aiEnhancement.fallbackUsed).toBe(true);
    expect(typeof body.aiEnhancement.provider).toBe("string");
    expect(typeof body.aiEnhancement.mode).toBe("string");
    expect(typeof body.aiEnhancement.content).toBe("string");

    // every deterministic field is still present and unaltered
    for (const key of DETERMINISTIC_KEYS) {
      expect(body).toHaveProperty(key);
    }
    expect(body.mode).toBe("library");
  });
});

describe("/api/brain POST — AI Router throws (simulated provider failure)", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock("@/lib/ai/router");
  });

  it("returns the deterministic response unaffected and never leaks the error", async () => {
    process.env.HERMES_AI_ROUTER_ENABLED = "true";
    vi.doMock("@/lib/ai/router", () => ({
      aiRouter: {
        id: "hybrid",
        ask: vi.fn().mockRejectedValue(new Error("simulated catastrophic failure")),
      },
    }));

    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(JSON.stringify(body)).not.toContain("simulated catastrophic failure");
    expect(body.aiEnhancement).toBeDefined();
    expect(body.aiEnhancement.fallbackUsed).toBe(true);
    expect(body.aiEnhancement.provider).toBe("none");

    for (const key of DETERMINISTIC_KEYS) {
      expect(body).toHaveProperty(key);
    }
    expect(body.mode).toBe("library");
    expect(body.domains.length).toBeGreaterThan(0);
  });
});

describe("/api/brain POST — Persian locale", () => {
  it("works with the flag off", async () => {
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION_FA, locale: "fa" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect("aiEnhancement" in body).toBe(false);
    expect(Array.isArray(body.domains)).toBe(true);
    expect(body.domains.length).toBeGreaterThan(0);
  });

  it("works with the flag on (clean fallback, no keys configured)", async () => {
    process.env.HERMES_AI_ROUTER_ENABLED = "true";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION_FA, locale: "fa" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.aiEnhancement).toBeDefined();
    expect(body.aiEnhancement.fallbackUsed).toBe(true);
    expect(body.domains.length).toBeGreaterThan(0);
  });
});

describe("/api/brain POST — Unknown classification is unaffected by the flag", () => {
  it("never attaches aiEnhancement on the unknown path even when the flag is on", async () => {
    process.env.HERMES_AI_ROUTER_ENABLED = "true";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: UNKNOWN_QUESTION, locale: "en" }));
    const body = await res.json();
    expect(body.unknown).toBe(true);
    expect("aiEnhancement" in body).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Phase 15 — RAG evidence layer
// ---------------------------------------------------------------------

describe("/api/brain POST — RAG disabled (default)", () => {
  it("never attaches ragEvidence and keeps every existing field, including retrieval", async () => {
    // HERMES_RAG_BRAIN_ENABLED intentionally left unset — the documented default.
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect("ragEvidence" in body).toBe(false);
    for (const key of DETERMINISTIC_KEYS) {
      expect(body).toHaveProperty(key);
    }
    expect(body.mode).toBe("library");
  });

  it("stays disabled for any non-'true' value, including the literal string 'false'", async () => {
    process.env.HERMES_RAG_BRAIN_ENABLED = "false";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    const body = await res.json();
    expect("ragEvidence" in body).toBe(false);
  });

  it("stays disabled even if the inner HERMES_RAG_ENABLED flag is on, when the route flag is off", async () => {
    process.env.HERMES_RAG_ENABLED = "true";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    const body = await res.json();
    expect("ragEvidence" in body).toBe(false);
  });
});

describe("/api/brain POST — RAG enabled (mock mode, no provider keys)", () => {
  it("attaches ragEvidence without altering the existing retrieval field", async () => {
    process.env.HERMES_RAG_BRAIN_ENABLED = "true";
    process.env.HERMES_RAG_ENABLED = "true";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ragEvidence).toBeDefined();
    expect(typeof body.ragEvidence.enabled).toBe("boolean");
    expect(typeof body.ragEvidence.mode).toBe("string");
    expect(Array.isArray(body.ragEvidence.results)).toBe(true);
    expect(typeof body.ragEvidence.fallbackUsed).toBe("boolean");

    // existing (keyword) retrieval is present and untouched
    expect(body.retrieval).toBeDefined();
    expect(Array.isArray(body.retrieval.topCases)).toBe(true);
    expect(Array.isArray(body.retrieval.topKnowledge)).toBe(true);

    // every other deterministic field is still present and unaltered
    for (const key of DETERMINISTIC_KEYS) {
      expect(body).toHaveProperty(key);
    }
    expect(body.mode).toBe("library");
  });

  it("never crashes and the RAG pipeline itself reports enabled:true with mock-mode evidence", async () => {
    process.env.HERMES_RAG_BRAIN_ENABLED = "true";
    process.env.HERMES_RAG_ENABLED = "true";
    process.env.HERMES_RAG_MODE = "mock";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    const body = await res.json();
    expect(body.ragEvidence.enabled).toBe(true);
    expect(body.ragEvidence.mode).toBe("mock");
  });
});

describe("/api/brain POST — RAG pipeline throws (simulated provider/vector-store failure)", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock("@/lib/rag/rag-pipeline");
  });

  it("returns the deterministic response unaffected and never leaks the error", async () => {
    process.env.HERMES_RAG_BRAIN_ENABLED = "true";
    process.env.HERMES_RAG_ENABLED = "true";
    vi.doMock("@/lib/rag/rag-pipeline", () => ({
      runRagPipeline: vi.fn().mockRejectedValue(
        new Error("simulated pgvector connection failure: password authentication failed")
      ),
    }));

    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    // the raw error/credential text must never appear anywhere in the response
    expect(JSON.stringify(body)).not.toContain("simulated pgvector connection failure");
    expect(JSON.stringify(body)).not.toContain("password authentication failed");

    expect(body.ragEvidence).toBeDefined();
    expect(body.ragEvidence.fallbackUsed).toBe(true);
    expect(body.ragEvidence.error).toBe("rag_pipeline_error");
    expect(body.ragEvidence.results).toEqual([]);

    for (const key of DETERMINISTIC_KEYS) {
      expect(body).toHaveProperty(key);
    }
    expect(body.mode).toBe("library");
    expect(body.domains.length).toBeGreaterThan(0);
  });
});

describe("/api/brain POST — RAG + Persian locale", () => {
  it("works with RAG enabled on a Persian question", async () => {
    process.env.HERMES_RAG_BRAIN_ENABLED = "true";
    process.env.HERMES_RAG_ENABLED = "true";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION_FA, locale: "fa" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ragEvidence).toBeDefined();
    expect(Array.isArray(body.ragEvidence.results)).toBe(true);
    expect(body.domains.length).toBeGreaterThan(0);
  });
});

describe("/api/brain POST — RAG + AI enhancement enabled together", () => {
  it("both optional layers are attached independently, neither breaks the other", async () => {
    process.env.HERMES_AI_ROUTER_ENABLED = "true";
    process.env.HERMES_RAG_BRAIN_ENABLED = "true";
    process.env.HERMES_RAG_ENABLED = "true";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.aiEnhancement).toBeDefined();
    expect(typeof body.aiEnhancement.content).toBe("string");
    expect(body.ragEvidence).toBeDefined();
    expect(Array.isArray(body.ragEvidence.results)).toBe(true);

    for (const key of DETERMINISTIC_KEYS) {
      expect(body).toHaveProperty(key);
    }
    expect(body.mode).toBe("library");
  });
});

describe("/api/brain POST — RAG on the Unknown path", () => {
  it("never attaches ragEvidence on the unknown path even when both flags are on", async () => {
    process.env.HERMES_RAG_BRAIN_ENABLED = "true";
    process.env.HERMES_RAG_ENABLED = "true";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: UNKNOWN_QUESTION, locale: "en" }));
    const body = await res.json();
    expect(body.unknown).toBe(true);
    expect("ragEvidence" in body).toBe(false);
  });
});

// -----------------------------------------------------------------------
// Phase 17D — Document pipeline semantic search layer
// -----------------------------------------------------------------------

describe("/api/brain POST — Document RAG disabled (default)", () => {
  it("never attaches documentRagEvidence and keeps every existing field", async () => {
    // HERMES_DOCUMENT_RAG_ENABLED intentionally left unset — the documented default.
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect("documentRagEvidence" in body).toBe(false);
    for (const key of DETERMINISTIC_KEYS) {
      expect(body).toHaveProperty(key);
    }
    expect(body.mode).toBe("library");
  });

  it("stays disabled for any non-'true' value, including the literal string 'false'", async () => {
    process.env.HERMES_DOCUMENT_RAG_ENABLED = "false";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    const body = await res.json();
    expect("documentRagEvidence" in body).toBe(false);
  });
});

describe("/api/brain POST — Document RAG enabled (session mode — empty index)", () => {
  it("attaches documentRagEvidence without altering any other field", async () => {
    process.env.HERMES_DOCUMENT_RAG_ENABLED = "true";
    process.env.DOCUMENT_EMBEDDINGS_PROVIDER = "mock";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.documentRagEvidence).toBeDefined();
    expect(body.documentRagEvidence.enabled).toBe(true);
    expect(Array.isArray(body.documentRagEvidence.matches)).toBe(true);
    expect(typeof body.documentRagEvidence.fallbackUsed).toBe("boolean");

    // every deterministic field is still present and unaltered
    for (const key of DETERMINISTIC_KEYS) {
      expect(body).toHaveProperty(key);
    }
    expect(body.mode).toBe("library");
  });

  it("returns empty matches (no indexed chunks in session store) — never a 5xx", async () => {
    process.env.HERMES_DOCUMENT_RAG_ENABLED = "true";
    process.env.DOCUMENT_EMBEDDINGS_PROVIDER = "mock";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // session store has no chunks — correct empty result, not a failure
    expect(body.documentRagEvidence.matches).toEqual([]);
    expect(body.documentRagEvidence.fallbackUsed).toBe(false);
    expect("error" in body.documentRagEvidence).toBe(false);
  });
});

describe("/api/brain POST — Document RAG searchDocuments throws (simulated failure)", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock("@/lib/documents/search");
  });

  it("returns the deterministic response unaffected and never leaks the error", async () => {
    process.env.HERMES_DOCUMENT_RAG_ENABLED = "true";
    process.env.DOCUMENT_EMBEDDINGS_PROVIDER = "mock";
    vi.doMock("@/lib/documents/search", () => ({
      searchDocuments: vi.fn().mockRejectedValue(
        new Error("simulated document search failure: pg connection refused")
      ),
    }));

    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    // raw error text must never appear anywhere in the response
    expect(JSON.stringify(body)).not.toContain("simulated document search failure");
    expect(JSON.stringify(body)).not.toContain("pg connection refused");

    expect(body.documentRagEvidence).toBeDefined();
    expect(body.documentRagEvidence.fallbackUsed).toBe(true);
    expect(body.documentRagEvidence.error).toBe("document_rag_error");
    expect(body.documentRagEvidence.matches).toEqual([]);

    for (const key of DETERMINISTIC_KEYS) {
      expect(body).toHaveProperty(key);
    }
    expect(body.mode).toBe("library");
    expect(body.domains.length).toBeGreaterThan(0);
  });
});

describe("/api/brain POST — Document RAG on the Unknown path", () => {
  it("never attaches documentRagEvidence on the unknown path even when the flag is on", async () => {
    process.env.HERMES_DOCUMENT_RAG_ENABLED = "true";
    process.env.DOCUMENT_EMBEDDINGS_PROVIDER = "mock";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: UNKNOWN_QUESTION, locale: "en" }));
    const body = await res.json();
    expect(body.unknown).toBe(true);
    expect("documentRagEvidence" in body).toBe(false);
  });
});

describe("/api/brain POST — Document RAG + RAG + AI enhancement all enabled", () => {
  it("all three optional layers are attached independently, none breaks the others", async () => {
    process.env.HERMES_AI_ROUTER_ENABLED = "true";
    process.env.HERMES_RAG_BRAIN_ENABLED = "true";
    process.env.HERMES_RAG_ENABLED = "true";
    process.env.HERMES_DOCUMENT_RAG_ENABLED = "true";
    process.env.DOCUMENT_EMBEDDINGS_PROVIDER = "mock";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.aiEnhancement).toBeDefined();
    expect(typeof body.aiEnhancement.content).toBe("string");
    expect(body.ragEvidence).toBeDefined();
    expect(Array.isArray(body.ragEvidence.results)).toBe(true);
    expect(body.documentRagEvidence).toBeDefined();
    expect(Array.isArray(body.documentRagEvidence.matches)).toBe(true);

    for (const key of DETERMINISTIC_KEYS) {
      expect(body).toHaveProperty(key);
    }
    expect(body.mode).toBe("library");
  });
});
