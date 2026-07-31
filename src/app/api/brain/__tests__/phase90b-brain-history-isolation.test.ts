import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockAuthUser, mockViewer, mockNoUser, unmockAuth } from "@/test/mock-auth";
import type { CurrentUser } from "@/lib/auth/session";

/**
 * PHASE 90B — GET /api/brain analysis history is tenant-scoped in EVERY mode,
 * and is NEVER sourced from the process-global analysisMemory ring.
 *
 * Before Phase 90B the session-mode (and DB-error fallback) GET returned
 * analysisMemory.recent()/stats() — a tenant-unaware ring populated by every
 * caller — leaking one tenant's questions and aggregate stats to another. These
 * tests seed two tenants' durable history plus a ring-only record and prove the
 * caller sees ONLY their own rows and never the ring record.
 */

const ENV_KEYS = ["DATABASE_URL", "HERMES_STORAGE_MODE"] as const;
let saved: Record<string, string | undefined>;

function engineer(id: string): CurrentUser {
  return { id, email: `${id}@hermes.local`, name: id, role: "engineer" };
}

function analysisRow(id: string, query: string, userId: string) {
  return {
    id,
    query,
    locale: "en",
    mode: "library",
    domains: ["drives"],
    vendors: [],
    cases: [],
    knowledge: [],
    confidence: 0.8,
    riskLevel: "low",
    isUnknown: false,
    createdAt: new Date("2026-01-01").toISOString(),
    userId,
    organizationId: null,
  };
}

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  // Force session storage mode (no DATABASE_URL).
  for (const k of ENV_KEYS) delete process.env[k];
  (globalThis as unknown as { __hermesAnalysisRows?: unknown[] }).__hermesAnalysisRows = [
    analysisRow("a1", "alice-secret-question", "u-alice"),
    analysisRow("b1", "bob-secret-question", "u-bob"),
  ];
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  unmockAuth();
});

function getRequest(): Request {
  return new Request("http://localhost/api/brain?n=50");
}

describe("90B — GET /api/brain history isolation", () => {
  it("an authoring caller sees only their own durable history, never another tenant's", async () => {
    mockAuthUser(engineer("u-alice"));
    const { GET } = await import("@/app/api/brain/route");

    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();

    const questions = body.recent.map((r: { question: string }) => r.question);
    expect(questions, "sees own history").toContain("alice-secret-question");
    expect(questions, "never another tenant's history").not.toContain("bob-secret-question");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("does NOT source history from the tenant-unaware analysisMemory ring", async () => {
    mockAuthUser(engineer("u-alice"));
    // Import the route first, then seed the SAME analysisMemory instance the
    // route's module graph uses (no resetModules in between) with a ring-only
    // record that exists in NO tenant's durable repository.
    const { GET } = await import("@/app/api/brain/route");
    const { analysisMemory } = await import("@/lib/industrial/memory");
    analysisMemory.record({
      question: "ring-only-leak",
      locale: "en",
      domains: [],
      libraries: [],
      mode: "library",
      vendors: [],
      caseMatches: [],
      safety: "general",
      confidence: 0.5,
      evidenceScore: 0,
      unknown: false,
    });

    const body = await (await GET(getRequest())).json();
    const questions = body.recent.map((r: { question: string }) => r.question);
    expect(questions, "the global ring is never served").not.toContain("ring-only-leak");
    expect(questions).toContain("alice-secret-question");
  });

  it("a caller with a different id sees a disjoint history (mutual isolation)", async () => {
    mockAuthUser(engineer("u-bob"));
    const { GET } = await import("@/app/api/brain/route");
    const body = await (await GET(getRequest())).json();
    const questions = body.recent.map((r: { question: string }) => r.question);
    expect(questions).toContain("bob-secret-question");
    expect(questions).not.toContain("alice-secret-question");
  });

  it("anonymous → 401 and non-authoring → 403 (gate runs before any repo read)", async () => {
    mockNoUser();
    const anon = await import("@/app/api/brain/route");
    expect((await anon.GET(getRequest())).status).toBe(401);

    vi.resetModules();
    mockViewer();
    const viewer = await import("@/app/api/brain/route");
    expect((await viewer.GET(getRequest())).status).toBe(403);
  });
});
