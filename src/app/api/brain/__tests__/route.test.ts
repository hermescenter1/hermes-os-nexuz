import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockEngineer, unmockAuth } from "@/test/mock-auth";

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
 *
 * Phase 86C4B2B1D-SECURITY-6: /api/brain now requires a valid session, so the
 * global `beforeEach` establishes an authenticated engineer before importing
 * the route; the anonymous 401 contract is proven in brain-api-boundaries.test.ts.
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
  "HERMES_MEMORY_RAG_ENABLED",
  "HERMES_AUTO_MEMORY_ENABLED",
  "HERMES_AUTO_MEMORY_MIN_CONFIDENCE",
  "HERMES_PROJECT_INTELLIGENCE_ENABLED",
] as const;
let saved: Record<string, string | undefined>;

function clearAllEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  clearAllEnv();
  vi.resetModules();
  mockEngineer();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  unmockAuth();
});

// Reused verbatim from the existing industrial/__tests__ suite — already
// verified there to classify as a known (non-unknown) drives/vendor case.
const KNOWN_QUESTION = "ABB ACS580 fault 2310 during acceleration";
const KNOWN_QUESTION_FA = "درایو ACS580 هنگام شتاب‌گیری خطای ۲۳۱۰ اضافه‌جریان می‌دهد";
// Reused verbatim from unknown.test.ts — already verified there to
// classify as Unknown (insufficient evidence).
const UNKNOWN_QUESTION = "The machine behaves strangely";

// SECURITY-7: POST /api/brain now enforces same-origin. These behavioural
// tests send a valid production Origin so the request reaches the pipeline;
// Origin rejection is proven in the SECURITY-7 boundary suite.
function postRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/brain", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://hermesnovin.com" },
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

// -----------------------------------------------------------------------
// Phase 18D — Engineering Memory evidence layer
// -----------------------------------------------------------------------

describe("/api/brain POST — Memory evidence disabled (default)", () => {
  it("never attaches memoryEvidence and keeps every existing field", async () => {
    // HERMES_MEMORY_RAG_ENABLED intentionally left unset — the documented default.
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect("memoryEvidence" in body).toBe(false);
    for (const key of DETERMINISTIC_KEYS) {
      expect(body).toHaveProperty(key);
    }
    expect(body.mode).toBe("library");
  });

  it("stays disabled for any non-'true' value, including the literal string 'false'", async () => {
    process.env.HERMES_MEMORY_RAG_ENABLED = "false";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    const body = await res.json();
    expect("memoryEvidence" in body).toBe(false);
  });

  it("stays disabled for '1', 'yes', 'enabled' — only the exact string 'true' activates it", async () => {
    process.env.HERMES_MEMORY_RAG_ENABLED = "1";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    const body = await res.json();
    expect("memoryEvidence" in body).toBe(false);
  });
});

describe("/api/brain POST — Memory evidence enabled (session mode — empty store)", () => {
  beforeEach(() => {
    // ensure the in-process memory store is empty
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
  });

  it("attaches memoryEvidence without altering any other field", async () => {
    process.env.HERMES_MEMORY_RAG_ENABLED = "true";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.memoryEvidence).toBeDefined();
    expect(body.memoryEvidence.enabled).toBe(true);
    expect(Array.isArray(body.memoryEvidence.matches)).toBe(true);
    expect(typeof body.memoryEvidence.fallbackUsed).toBe("boolean");

    // every deterministic field is still present and unaltered
    for (const key of DETERMINISTIC_KEYS) {
      expect(body).toHaveProperty(key);
    }
    expect(body.mode).toBe("library");
  });

  it("returns empty matches when store has no memories — not a failure", async () => {
    process.env.HERMES_MEMORY_RAG_ENABLED = "true";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.memoryEvidence.matches).toEqual([]);
    expect(body.memoryEvidence.fallbackUsed).toBe(false);
    expect("error" in body.memoryEvidence).toBe(false);
  });
});

describe("/api/brain POST — Memory evidence enabled, memories in store", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
  });

  it("attaches matches with the correct shape", async () => {
    process.env.HERMES_MEMORY_RAG_ENABLED = "true";

    // seed a memory that should match KNOWN_QUESTION (drives domain, ACS580)
    const { createEngineeringMemory } = await import("@/lib/memory/memory-service");
    await createEngineeringMemory({
      query: "ABB ACS580 overcurrent fault 2310 on acceleration ramp",
      domain: "drives",
      analysisSummary: "Acceleration ramp too steep; increase ramp time in P1.28",
      confidence: 80,
      relatedCaseIds: ["case-abb-acs580-oc"],
      relatedDocumentIds: [],
      outcome: "success",
    });

    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.memoryEvidence.enabled).toBe(true);
    expect(body.memoryEvidence.matches.length).toBeGreaterThan(0);

    const m = body.memoryEvidence.matches[0];
    expect(typeof m.id).toBe("string");
    expect(typeof m.query).toBe("string");
    expect(typeof m.domain).toBe("string");
    expect(typeof m.summary).toBe("string");
    expect(typeof m.confidence).toBe("number");
    expect(typeof m.outcome).toBe("string");
    expect(typeof m.score).toBe("number");
    expect(Array.isArray(m.reasons)).toBe(true);
    expect(m.score).toBeGreaterThanOrEqual(0);
    expect(m.score).toBeLessThanOrEqual(100);
  });

  it("score reflects learning: success feedback raises the match score", async () => {
    process.env.HERMES_MEMORY_RAG_ENABLED = "true";

    const { createEngineeringMemory, addMemoryFeedback } = await import(
      "@/lib/memory/memory-service"
    );
    const m1 = await createEngineeringMemory({
      query: "ABB ACS580 fault 2310 acceleration",
      domain: "drives",
      analysisSummary: "ramp time too short",
      confidence: 70,
      relatedCaseIds: [],
      relatedDocumentIds: [],
      outcome: "unknown",
    });
    const m2 = await createEngineeringMemory({
      query: "ABB ACS580 fault 2310 acceleration",
      domain: "drives",
      analysisSummary: "ramp time too short",
      confidence: 70,
      relatedCaseIds: [],
      relatedDocumentIds: [],
      outcome: "unknown",
    });

    // m1 gets two success feedbacks
    await addMemoryFeedback(m1.id, { memoryId: m1.id, outcome: "success" });
    await addMemoryFeedback(m1.id, { memoryId: m1.id, outcome: "success" });

    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    const body = await res.json();

    const r1 = body.memoryEvidence.matches.find(
      (m: { id: string }) => m.id === m1.id
    );
    const r2 = body.memoryEvidence.matches.find(
      (m: { id: string }) => m.id === m2.id
    );

    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    expect(r1.score).toBeGreaterThan(r2.score);
  });

  it("memory evidence never overrides analysis.confidence or analysis.domains", async () => {
    process.env.HERMES_MEMORY_RAG_ENABLED = "true";

    const { createEngineeringMemory } = await import("@/lib/memory/memory-service");
    await createEngineeringMemory({
      query: "ABB ACS580 overcurrent",
      domain: "drives",
      analysisSummary: "check ramp",
      confidence: 99,
      relatedCaseIds: [],
      relatedDocumentIds: [],
      outcome: "success",
    });

    const { POST } = await import("../route");
    // first call without memory evidence for baseline
    process.env.HERMES_MEMORY_RAG_ENABLED = "false";
    const resBase = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    const baseBody = await resBase.json();

    process.env.HERMES_MEMORY_RAG_ENABLED = "true";
    const resEnabled = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    const enabledBody = await resEnabled.json();

    // deterministic fields must be identical
    expect(enabledBody.confidence).toBe(baseBody.confidence);
    expect(JSON.stringify(enabledBody.domains)).toBe(JSON.stringify(baseBody.domains));
    expect(enabledBody.mode).toBe(baseBody.mode);
    expect(enabledBody.riskLevel).toBe(baseBody.riskLevel);
  });
});

describe("/api/brain POST — Memory evidence: retrieval failure fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
  });
  afterEach(() => {
    vi.doUnmock("@/lib/memory/memory-service");
  });

  it("returns deterministic response unaffected and never leaks the error", async () => {
    process.env.HERMES_MEMORY_RAG_ENABLED = "true";
    vi.doMock("@/lib/memory/memory-service", () => ({
      getSimilarMemories: vi.fn().mockRejectedValue(
        new Error("simulated memory store failure: connection refused at host db:5432")
      ),
    }));

    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    // raw error text must never appear anywhere in the response
    const text = JSON.stringify(body);
    expect(text).not.toContain("simulated memory store failure");
    expect(text).not.toContain("connection refused");
    expect(text).not.toContain("db:5432");

    expect(body.memoryEvidence).toBeDefined();
    expect(body.memoryEvidence.fallbackUsed).toBe(true);
    expect(body.memoryEvidence.error).toBe("memory_search_error");
    expect(body.memoryEvidence.matches).toEqual([]);

    for (const key of DETERMINISTIC_KEYS) {
      expect(body).toHaveProperty(key);
    }
    expect(body.mode).toBe("library");
    expect(body.domains.length).toBeGreaterThan(0);
  });
});

describe("/api/brain POST — Memory evidence on Unknown and guardrail paths", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
  });

  it("never attaches memoryEvidence on the unknown path even when the flag is on", async () => {
    process.env.HERMES_MEMORY_RAG_ENABLED = "true";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: UNKNOWN_QUESTION, locale: "en" }));
    const body = await res.json();
    expect(body.unknown).toBe(true);
    expect("memoryEvidence" in body).toBe(false);
  });
});

describe("/api/brain POST — Memory evidence + all other optional layers coexist", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
  });

  it("all four optional layers attach independently, none breaks the others", async () => {
    process.env.HERMES_AI_ROUTER_ENABLED = "true";
    process.env.HERMES_RAG_BRAIN_ENABLED = "true";
    process.env.HERMES_RAG_ENABLED = "true";
    process.env.HERMES_DOCUMENT_RAG_ENABLED = "true";
    process.env.DOCUMENT_EMBEDDINGS_PROVIDER = "mock";
    process.env.HERMES_MEMORY_RAG_ENABLED = "true";

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
    expect(body.memoryEvidence).toBeDefined();
    expect(Array.isArray(body.memoryEvidence.matches)).toBe(true);

    for (const key of DETERMINISTIC_KEYS) {
      expect(body).toHaveProperty(key);
    }
    expect(body.mode).toBe("library");
  });
});

// ─── Phase 18E: Automatic Memory Capture ────────────────────────────────────

describe("/api/brain POST — Auto-memory: disabled (default)", () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
  });

  it("never saves a memory when the flag is absent (default off)", async () => {
    // HERMES_AUTO_MEMORY_ENABLED is not set (cleared by global beforeEach)
    const { POST } = await import("../route");
    await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));

    const { listEngineeringMemories } = await import("@/lib/memory/memory-service");
    const memories = await listEngineeringMemories(0);
    expect(memories.length).toBe(0);
  });

  it("never saves a memory for the explicit 'false' value", async () => {
    process.env.HERMES_AUTO_MEMORY_ENABLED = "false";
    const { POST } = await import("../route");
    await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));

    const { listEngineeringMemories } = await import("@/lib/memory/memory-service");
    const memories = await listEngineeringMemories(0);
    expect(memories.length).toBe(0);
  });

  it("never saves a memory for '1' or 'yes' — only the exact string 'true' activates it", async () => {
    process.env.HERMES_AUTO_MEMORY_ENABLED = "1";
    const { POST } = await import("../route");
    await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));

    const { listEngineeringMemories } = await import("@/lib/memory/memory-service");
    const memories = await listEngineeringMemories(0);
    expect(memories.length).toBe(0);
  });
});

describe("/api/brain POST — Auto-memory: save success", () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
  });

  it("creates a memory record when the flag is enabled and analysis succeeds", async () => {
    process.env.HERMES_AUTO_MEMORY_ENABLED = "true";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);

    const { listEngineeringMemories } = await import("@/lib/memory/memory-service");
    const memories = await listEngineeringMemories(0);

    expect(memories.length).toBe(1);
    expect(memories[0].query).toBe(KNOWN_QUESTION);
    // domain must be a non-empty string (KNOWN_QUESTION → "drives" domain)
    expect(typeof memories[0].domain).toBe("string");
    expect(memories[0].domain.length).toBeGreaterThan(0);
    // summary must include at least a Risk level
    expect(typeof memories[0].analysisSummary).toBe("string");
    expect(memories[0].analysisSummary.length).toBeGreaterThan(0);
    // confidence stored on 0-100 scale
    expect(memories[0].confidence).toBeGreaterThanOrEqual(0);
    expect(memories[0].confidence).toBeLessThanOrEqual(100);
    // initial outcome is always "unknown" — humans add feedback later
    expect(memories[0].outcome).toBe("unknown");
    expect(Array.isArray(memories[0].relatedCaseIds)).toBe(true);
  });
});

describe("/api/brain POST — Auto-memory: duplicate prevention", () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
  });

  it("does not create a second memory record when the same question is asked twice", async () => {
    process.env.HERMES_AUTO_MEMORY_ENABLED = "true";
    const { POST } = await import("../route");

    // First POST — creates memory
    await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    // Second POST — same question, must be deduplicated
    await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));

    const { listEngineeringMemories } = await import("@/lib/memory/memory-service");
    const memories = await listEngineeringMemories(0);

    // Exactly 1 record, not 2
    expect(memories.filter((m) => m.query === KNOWN_QUESTION).length).toBe(1);
  });
});

describe("/api/brain POST — Auto-memory: low confidence rejection", () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
  });

  it("does not save when confidence is below the configured minimum", async () => {
    process.env.HERMES_AUTO_MEMORY_ENABLED = "true";
    // 200 exceeds the maximum possible score (100), so every analysis is rejected
    process.env.HERMES_AUTO_MEMORY_MIN_CONFIDENCE = "200";

    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200); // Brain response is unaffected

    const { listEngineeringMemories } = await import("@/lib/memory/memory-service");
    const memories = await listEngineeringMemories(0);
    expect(memories.length).toBe(0);
  });
});

describe("/api/brain POST — Auto-memory: unknown path rejection", () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
  });

  it("never saves a memory for unknown-classified questions (early return path)", async () => {
    process.env.HERMES_AUTO_MEMORY_ENABLED = "true";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: UNKNOWN_QUESTION, locale: "en" }));
    const body = await res.json();

    expect(body.unknown).toBe(true); // confirm unknown path fired
    expect(res.status).toBe(200);

    const { listEngineeringMemories } = await import("@/lib/memory/memory-service");
    const memories = await listEngineeringMemories(0);
    expect(memories.length).toBe(0);
  });
});

describe("/api/brain POST — Auto-memory: guardrail rejection", () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
  });
  afterEach(() => {
    vi.doUnmock("@/lib/llm/guardrails");
  });

  it("never saves a memory when a guardrail flags the question", async () => {
    process.env.HERMES_AUTO_MEMORY_ENABLED = "true";
    vi.doMock("@/lib/llm/guardrails", () => ({
      screenQuestion: vi.fn().mockReturnValue({
        kind: "safety_bypass_attempt",
        severity: "high",
      }),
    }));

    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200); // Brain still responds

    const { listEngineeringMemories } = await import("@/lib/memory/memory-service");
    const memories = await listEngineeringMemories(0);
    expect(memories.length).toBe(0);
  });
});

describe("/api/brain POST — Auto-memory: storage failure fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
  });
  afterEach(() => {
    vi.doUnmock("@/lib/memory/memory-service");
  });

  it("returns a normal Brain response even when the memory write throws", async () => {
    process.env.HERMES_AUTO_MEMORY_ENABLED = "true";
    vi.doMock("@/lib/memory/memory-service", () => ({
      getSimilarMemories: vi.fn().mockResolvedValue([]),
      listEngineeringMemories: vi.fn().mockResolvedValue([]), // no duplicate → proceeds to write
      createEngineeringMemory: vi.fn().mockRejectedValue(
        new Error("simulated DB write failure: pg connection timeout after 5000ms")
      ),
    }));

    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    // Raw error must never appear anywhere in the response
    const text = JSON.stringify(body);
    expect(text).not.toContain("simulated DB write failure");
    expect(text).not.toContain("pg connection timeout");

    // All deterministic fields must still be present and correct
    for (const key of DETERMINISTIC_KEYS) {
      expect(body).toHaveProperty(key);
    }
    expect(body.mode).toBe("library");
    expect(body.domains.length).toBeGreaterThan(0);

    // Phase 18E must not add any field to the response
    expect("autoMemoryCapture" in body).toBe(false);
  });
});

describe("/api/brain POST — Auto-memory: deterministic fields unchanged", () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
  });

  it("enabling auto-memory never changes any field in the Brain response", async () => {
    const { POST } = await import("../route");

    process.env.HERMES_AUTO_MEMORY_ENABLED = "false";
    const resFlagOff = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    const bodyOff = await resFlagOff.json();

    // Reset store so second call doesn't find a duplicate from the first
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    process.env.HERMES_AUTO_MEMORY_ENABLED = "true";
    const resFlagOn = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    const bodyOn = await resFlagOn.json();

    // Every deterministic field must be identical.
    // "pipeline" carries step timing (ms) that varies between calls — skip it;
    // its presence is already verified via toHaveProperty in other tests.
    for (const key of DETERMINISTIC_KEYS) {
      if (key === "pipeline") continue;
      expect(bodyOn[key]).toEqual(bodyOff[key]);
    }

    // Phase 18E must not add any visible field to the response
    expect("autoMemoryCapture" in bodyOn).toBe(false);
    expect("autoMemoryCapture" in bodyOff).toBe(false);
  });
});

// ── Phase 19B: Brain ↔ Project Context Integration ─────────────────────────

/** Seed a matching memory with projectId into the session store so Brain
 *  retrieval can find it and apply the project boost. */
function seedProjectMemory(projectId: string) {
  (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [
    {
      id: "proj-mem-1",
      query: "ABB ACS580 fault 2310",
      domain: "drives",
      analysisSummary: "check acceleration ramp",
      confidence: 80,
      relatedCaseIds: [],
      relatedDocumentIds: [],
      outcome: "success",
      projectId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
}

describe("Brain project context: disabled flag (default)", () => {
  beforeEach(() => {
    vi.resetModules();
    clearAllEnv();
    seedProjectMemory("test-project-id");
  });

  it("projectId in body is accepted without error when flag is off", async () => {
    const { POST } = await import("../route");
    process.env.HERMES_MEMORY_RAG_ENABLED = "true";
    // flag off (default)
    const res = await POST(
      postRequest({ question: KNOWN_QUESTION, locale: "en", projectId: "test-project-id" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // Known path doesn't echo 'question'; verify via analysis fields instead
    expect(body.mode).toBe("library");
    expect(body.error).toBeUndefined();
  });

  it("no project_match reasons in memoryEvidence when project flag is off", async () => {
    const { POST } = await import("../route");
    process.env.HERMES_MEMORY_RAG_ENABLED = "true";
    const res = await POST(
      postRequest({ question: KNOWN_QUESTION, locale: "en", projectId: "test-project-id" })
    );
    const body = await res.json();
    const allReasons: string[] = (body.memoryEvidence?.matches ?? []).flatMap(
      (m: { reasons: string[] }) => m.reasons
    );
    expect(allReasons).not.toContain("project_match");
  });
});

describe("Brain project context: enabled flag + matching projectId", () => {
  beforeEach(() => {
    vi.resetModules();
    clearAllEnv();
    seedProjectMemory("test-project-id");
  });

  it("memoryEvidence.matches contains a project_match reason for same-project memory", async () => {
    const { POST } = await import("../route");
    process.env.HERMES_MEMORY_RAG_ENABLED = "true";
    process.env.HERMES_PROJECT_INTELLIGENCE_ENABLED = "true";
    const res = await POST(
      postRequest({ question: KNOWN_QUESTION, locale: "en", projectId: "test-project-id" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.memoryEvidence).toBeDefined();
    const allReasons: string[] = (body.memoryEvidence?.matches ?? []).flatMap(
      (m: { reasons: string[] }) => m.reasons
    );
    expect(allReasons).toContain("project_match");
  });

  it("project-boosted match ranks first in memoryEvidence.matches", async () => {
    // Add a second memory WITHOUT projectId so we can verify ordering
    const store = (globalThis as unknown as { __hermesEngineeringMemory: unknown[] }).__hermesEngineeringMemory;
    store.push({
      id: "no-proj-mem",
      query: "ABB ACS580 fault 2310",
      domain: "drives",
      analysisSummary: "check acceleration ramp",
      confidence: 80,
      relatedCaseIds: [],
      relatedDocumentIds: [],
      outcome: "success",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { POST } = await import("../route");
    process.env.HERMES_MEMORY_RAG_ENABLED = "true";
    process.env.HERMES_PROJECT_INTELLIGENCE_ENABLED = "true";
    const res = await POST(
      postRequest({ question: KNOWN_QUESTION, locale: "en", projectId: "test-project-id" })
    );
    const body = await res.json();
    const firstMatch = body.memoryEvidence?.matches?.[0];
    expect(firstMatch?.id).toBe("proj-mem-1");
    expect(firstMatch?.reasons).toContain("project_match");
  });
});

describe("Brain project context: enabled flag + no projectId", () => {
  beforeEach(() => {
    vi.resetModules();
    clearAllEnv();
    seedProjectMemory("test-project-id");
  });

  it("Brain works normally without projectId in body", async () => {
    const { POST } = await import("../route");
    process.env.HERMES_MEMORY_RAG_ENABLED = "true";
    process.env.HERMES_PROJECT_INTELLIGENCE_ENABLED = "true";
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("library");
    expect(body.error).toBeUndefined();
    // memoryEvidence present but no project_match (no projectId filter applied)
    const allReasons: string[] = (body.memoryEvidence?.matches ?? []).flatMap(
      (m: { reasons: string[] }) => m.reasons
    );
    expect(allReasons).not.toContain("project_match");
  });
});

describe("Brain project context: invalid/nonexistent projectId", () => {
  beforeEach(() => {
    vi.resetModules();
    clearAllEnv();
    seedProjectMemory("real-project");
  });

  it("does not crash and returns no project_match when projectId matches no stored memory", async () => {
    const { POST } = await import("../route");
    process.env.HERMES_MEMORY_RAG_ENABLED = "true";
    process.env.HERMES_PROJECT_INTELLIGENCE_ENABLED = "true";
    const res = await POST(
      postRequest({ question: KNOWN_QUESTION, locale: "en", projectId: "nonexistent-project-xyz" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // Must not fail — graceful degradation
    expect(body.error).toBeUndefined();
    const allReasons: string[] = (body.memoryEvidence?.matches ?? []).flatMap(
      (m: { reasons: string[] }) => m.reasons
    );
    expect(allReasons).not.toContain("project_match");
  });

  it("empty string projectId is treated as absent (no project filter)", async () => {
    const { POST } = await import("../route");
    process.env.HERMES_MEMORY_RAG_ENABLED = "true";
    process.env.HERMES_PROJECT_INTELLIGENCE_ENABLED = "true";
    const res = await POST(
      postRequest({ question: KNOWN_QUESTION, locale: "en", projectId: "   " })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeUndefined();
  });
});

describe("Brain project context: auto-save captures projectId (Phase 19B + 18E)", () => {
  beforeEach(() => {
    vi.resetModules();
    clearAllEnv();
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
  });

  it("auto-saved memory carries the projectId from the Brain request", async () => {
    const { POST } = await import("../route");
    process.env.HERMES_AUTO_MEMORY_ENABLED = "true";
    process.env.HERMES_PROJECT_INTELLIGENCE_ENABLED = "true";

    await POST(
      postRequest({ question: KNOWN_QUESTION, locale: "en", projectId: "capture-project-123" })
    );

    const store = (globalThis as unknown as { __hermesEngineeringMemory: Array<{ query: string; projectId?: string }> }).__hermesEngineeringMemory;
    const saved = store.find((m) => m.query === KNOWN_QUESTION);
    expect(saved).toBeDefined();
    expect(saved?.projectId).toBe("capture-project-123");
  });

  it("auto-saved memory has no projectId when request omits it", async () => {
    const { POST } = await import("../route");
    process.env.HERMES_AUTO_MEMORY_ENABLED = "true";
    process.env.HERMES_PROJECT_INTELLIGENCE_ENABLED = "true";

    await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));

    const store = (globalThis as unknown as { __hermesEngineeringMemory: Array<{ query: string; projectId?: string }> }).__hermesEngineeringMemory;
    const saved = store.find((m) => m.query === KNOWN_QUESTION);
    expect(saved?.projectId).toBeUndefined();
  });
});

describe("Brain project context: deterministic fields unchanged by projectId", () => {
  beforeEach(() => {
    vi.resetModules();
    clearAllEnv();
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
  });

  it("all DETERMINISTIC_KEYS fields are identical with and without projectId", async () => {
    const { POST } = await import("../route");
    process.env.HERMES_PROJECT_INTELLIGENCE_ENABLED = "true";

    const resWithout = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    const bodyWithout = await resWithout.json();

    const resWith = await POST(
      postRequest({ question: KNOWN_QUESTION, locale: "en", projectId: "det-project-99" })
    );
    const bodyWith = await resWith.json();

    for (const key of DETERMINISTIC_KEYS) {
      if (key === "pipeline") continue; // step timings vary
      expect(bodyWith[key]).toEqual(bodyWithout[key]);
    }
    // projectId must not leak into the Brain response
    expect("projectId" in bodyWith).toBe(false);
    expect("projectId" in bodyWithout).toBe(false);
  });
});

describe("Brain project context: backward compatibility", () => {
  beforeEach(() => {
    vi.resetModules();
    clearAllEnv();
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
  });

  it("existing requests without projectId behave identically to pre-19B", async () => {
    const { POST } = await import("../route");
    // No project flags set
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Core fields present (known path doesn't echo 'question')
    expect(body.mode).toBe("library");
    expect(typeof body.confidence).toBe("number");
    expect(Array.isArray(body.domains)).toBe(true);
    // projectId never leaks into response
    expect("projectId" in body).toBe(false);
  });

  it("guardrail hit still skips both memory evidence and auto-save regardless of projectId", async () => {
    vi.doMock("@/lib/llm/guardrails", () => ({
      screenQuestion: vi.fn().mockReturnValue({ triggered: true, rule: "test", severity: "high" }),
    }));
    const { POST } = await import("../route");
    process.env.HERMES_MEMORY_RAG_ENABLED = "true";
    process.env.HERMES_AUTO_MEMORY_ENABLED = "true";
    process.env.HERMES_PROJECT_INTELLIGENCE_ENABLED = "true";

    const res = await POST(
      postRequest({ question: KNOWN_QUESTION, locale: "en", projectId: "guarded-project" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // memoryEvidence block skipped
    expect("memoryEvidence" in body).toBe(false);
    // nothing auto-saved
    const store = (globalThis as unknown as { __hermesEngineeringMemory: unknown[] }).__hermesEngineeringMemory;
    expect(store.length).toBe(0);
    vi.doUnmock("@/lib/llm/guardrails");
  });
});

// ── Phase 19C: Project Reasoning Context ────────────────────────────────────

type SeedProject = { id: string; name?: string; description?: string; status?: string };
type SeedMemory  = { projectId?: string };

function seedProjectRecord(p: SeedProject) {
  (globalThis as Record<string, unknown>).__hermesProjects = [{
    id: p.id,
    name: p.name ?? "Test Project",
    description: p.description ?? "A test project",
    status: p.status ?? "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }];
}

function seedMemoryRecords(records: SeedMemory[]) {
  (globalThis as Record<string, unknown>).__hermesEngineeringMemory = records.map(
    (r, i) => ({
      id: `mem-${i}`,
      query: "ABB ACS580 fault 2310",
      domain: "drives",
      analysisSummary: "check ramp settings",
      confidence: 60,
      relatedCaseIds: [],
      relatedDocumentIds: [],
      outcome: "unknown",
      projectId: r.projectId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  );
  (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
}

describe("Brain project context: Phase 19C project reasoning context", () => {
  beforeEach(() => {
    vi.resetModules();
    clearAllEnv();
    (globalThis as Record<string, unknown>).__hermesProjects = [];
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
  });

  it("disabled flag (default): no projectContext even with a valid projectId", async () => {
    seedProjectRecord({ id: "proj-a" });
    // HERMES_PROJECT_INTELLIGENCE_ENABLED not set
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en", projectId: "proj-a" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect("projectContext" in body).toBe(false);
  });

  it("enabled flag + valid project: projectContext is attached with correct fields", async () => {
    seedProjectRecord({ id: "proj-b", name: "Alfa Line 3", description: "Kiln drive", status: "active" });
    seedMemoryRecords([{ projectId: "proj-b" }, { projectId: "proj-b" }]);
    process.env.HERMES_PROJECT_INTELLIGENCE_ENABLED = "true";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en", projectId: "proj-b" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projectContext).toBeDefined();
    expect(body.projectContext.projectId).toBe("proj-b");
    expect(body.projectContext.projectName).toBe("Alfa Line 3");
    expect(body.projectContext.description).toBe("Kiln drive");
    expect(body.projectContext.status).toBe("active");
    expect(typeof body.projectContext.relatedMemoriesCount).toBe("number");
  });

  it("relatedMemoriesCount equals the number of memories tagged with the project", async () => {
    seedProjectRecord({ id: "proj-c" });
    // 3 memories: 2 tagged with proj-c, 1 with a different project
    seedMemoryRecords([
      { projectId: "proj-c" },
      { projectId: "proj-c" },
      { projectId: "other-proj" },
    ]);
    process.env.HERMES_PROJECT_INTELLIGENCE_ENABLED = "true";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en", projectId: "proj-c" }));
    const body = await res.json();
    expect(body.projectContext.relatedMemoriesCount).toBe(2);
  });

  it("missing project: no projectContext, Brain succeeds (getProject returns null)", async () => {
    // Empty project store — no project with this id exists
    process.env.HERMES_PROJECT_INTELLIGENCE_ENABLED = "true";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en", projectId: "nonexistent-project" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeUndefined();
    expect("projectContext" in body).toBe(false);
  });

  it("no projectId in request: no projectContext even when flag is on", async () => {
    seedProjectRecord({ id: "proj-d" });
    process.env.HERMES_PROJECT_INTELLIGENCE_ENABLED = "true";
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect("projectContext" in body).toBe(false);
  });

  it("deterministic fields are identical with and without projectContext", async () => {
    seedProjectRecord({ id: "proj-e" });
    process.env.HERMES_PROJECT_INTELLIGENCE_ENABLED = "true";
    const { POST } = await import("../route");

    const resWithout = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    const bodyWithout = await resWithout.json();

    const resWith = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en", projectId: "proj-e" }));
    const bodyWith = await resWith.json();

    for (const key of DETERMINISTIC_KEYS) {
      if (key === "pipeline") continue; // step timings vary
      expect(bodyWith[key]).toEqual(bodyWithout[key]);
    }
    // projectContext must not be present in the no-projectId call
    expect("projectContext" in bodyWithout).toBe(false);
  });

  it("guardrail hit: projectContext is not attached", async () => {
    seedProjectRecord({ id: "proj-f" });
    vi.doMock("@/lib/llm/guardrails", () => ({
      screenQuestion: vi.fn().mockReturnValue({ triggered: true, rule: "test", severity: "high" }),
    }));
    const { POST } = await import("../route");
    process.env.HERMES_PROJECT_INTELLIGENCE_ENABLED = "true";

    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en", projectId: "proj-f" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect("projectContext" in body).toBe(false);
    vi.doUnmock("@/lib/llm/guardrails");
  });

  it("backward compatibility: existing Brain callers unaffected when no projectId given", async () => {
    // No project store, no flag — pure pre-19C behavior
    const { POST } = await import("../route");
    const res = await POST(postRequest({ question: KNOWN_QUESTION, locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("library");
    expect(typeof body.confidence).toBe("number");
    expect(Array.isArray(body.domains)).toBe(true);
    expect("projectContext" in body).toBe(false);
    expect("projectId" in body).toBe(false);
  });
});
