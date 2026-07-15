import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockEngineer, unmockAuth } from "@/test/mock-auth";

/**
 * Phase 24 — GET /api/domains/[name] route tests.
 * All tests run in session mode (no DATABASE_URL).
 */

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  vi.resetModules();
  (globalThis as Record<string, unknown>).__hermesProjects          = [];
  (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
  (globalThis as Record<string, unknown>).__hermesMemoryFeedback    = [];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  unmockAuth();
});

// ── Helpers ────────────────────────────────────────────────────────────────

let mIdx = 0;
function seedMemory(
  id: string,
  opts: { domain?: string; confidence?: number; outcome?: string; projectId?: string } = {}
) {
  mIdx++;
  const arr = (globalThis as Record<string, unknown>).__hermesEngineeringMemory as unknown[];
  arr.push({
    id, query: `query ${mIdx}`,
    domain: opts.domain ?? "drives",
    analysisSummary: `summary ${mIdx}`,
    confidence: opts.confidence ?? 70,
    relatedCaseIds: [], relatedDocumentIds: [],
    outcome: opts.outcome ?? "unknown",
    projectId: opts.projectId,
    createdAt: "2026-01-10T00:00:00.000Z", updatedAt: "2026-01-10T00:00:00.000Z",
  });
}

function makeRequest(name: string) {
  return new Request(`http://localhost/api/domains/${encodeURIComponent(name)}`);
}

// ── Response shape ─────────────────────────────────────────────────────────

describe("GET /api/domains/[name] — response shape", () => {
  it("returns 200 with all DomainDetail fields for known domain", async () => {
    seedMemory("m1", { domain: "drives" });
    const { GET } = await import("../route");
    const res = await GET(makeRequest("drives"), { params: Promise.resolve({ name: "drives" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("storageMode");
    expect(body).toHaveProperty("name", "drives");
    expect(body).toHaveProperty("memoryCount");
    expect(body).toHaveProperty("avgConfidence");
    expect(body).toHaveProperty("successRate");
    expect(body).toHaveProperty("failureRate");
    expect(body).toHaveProperty("partialRate");
    expect(body).toHaveProperty("feedbackRate");
    expect(body).toHaveProperty("healthScore");
    expect(body).toHaveProperty("trend");
    expect(body).toHaveProperty("topCases");
    expect(body).toHaveProperty("topProjects");
    expect(body).toHaveProperty("relatedDomains");
  });

  it("trend has direction, recentAvgConf, baselineAvgConf", async () => {
    seedMemory("m1", { domain: "drives" });
    const { GET } = await import("../route");
    const body = await (await GET(makeRequest("drives"), { params: Promise.resolve({ name: "drives" }) })).json();
    expect(body.trend).toHaveProperty("direction");
    expect(body.trend).toHaveProperty("recentAvgConf");
    expect(body.trend).toHaveProperty("baselineAvgConf");
  });

  it("topCases and topProjects are arrays", async () => {
    seedMemory("m1", { domain: "drives" });
    const { GET } = await import("../route");
    const body = await (await GET(makeRequest("drives"), { params: Promise.resolve({ name: "drives" }) })).json();
    expect(Array.isArray(body.topCases)).toBe(true);
    expect(Array.isArray(body.topProjects)).toBe(true);
    expect(Array.isArray(body.relatedDomains)).toBe(true);
  });
});

// ── 404 cases ─────────────────────────────────────────────────────────────

describe("GET /api/domains/[name] — 404", () => {
  it("returns 404 for empty store", async () => {
    const { GET } = await import("../route");
    const res = await GET(makeRequest("drives"), { params: Promise.resolve({ name: "drives" }) });
    expect(res.status).toBe(404);
  });

  it("returns 404 when named domain does not exist", async () => {
    seedMemory("m1", { domain: "drives" });
    const { GET } = await import("../route");
    const res = await GET(makeRequest("nonexistent"), { params: Promise.resolve({ name: "nonexistent" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("domain_not_found");
  });

  it("returns 404 when service throws", async () => {
    vi.doMock("@/lib/services/domain-intelligence-service", () => ({
      getDomainByName: () => { throw new Error("db_down"); },
    }));
    const { GET } = await import("../route");
    const res = await GET(makeRequest("drives"), { params: Promise.resolve({ name: "drives" }) });
    expect(res.status).toBe(404);
    vi.doUnmock("@/lib/services/domain-intelligence-service");
  });
});

// ── Seeded data ────────────────────────────────────────────────────────────

describe("GET /api/domains/[name] — seeded data", () => {
  it("memoryCount matches seeded memories for domain", async () => {
    seedMemory("m1", { domain: "drives" });
    seedMemory("m2", { domain: "drives" });
    seedMemory("m3", { domain: "hydraulics" });
    const { GET } = await import("../route");
    const body = await (await GET(makeRequest("drives"), { params: Promise.resolve({ name: "drives" }) })).json();
    expect(body.memoryCount).toBe(2);
  });

  it("successRate reflects outcome=success fraction for domain", async () => {
    seedMemory("m1", { domain: "drives", outcome: "success" });
    seedMemory("m2", { domain: "drives", outcome: "failed" });
    const { GET } = await import("../route");
    const body = await (await GET(makeRequest("drives"), { params: Promise.resolve({ name: "drives" }) })).json();
    expect(body.successRate).toBe(50);
  });

  it("only returns data for the requested domain", async () => {
    seedMemory("m1", { domain: "drives"     });
    seedMemory("m2", { domain: "hydraulics" });
    const { GET } = await import("../route");
    const body = await (await GET(makeRequest("drives"), { params: Promise.resolve({ name: "drives" }) })).json();
    expect(body.name).toBe("drives");
    expect(body.memoryCount).toBe(1);
  });

  it("trend direction is stable for single old memory", async () => {
    seedMemory("m1", { domain: "drives" });
    const { GET } = await import("../route");
    const body = await (await GET(makeRequest("drives"), { params: Promise.resolve({ name: "drives" }) })).json();
    expect(body.trend.direction).toBe("stable");
  });
});

// ── Backward compatibility ─────────────────────────────────────────────────

describe("GET /api/domains/[name] — backward compat", () => {
  it("GET /api/domains (list) route unaffected", async () => {
    const { GET } = await import("../../route");
    const res  = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("totalDomains");
    expect(body).toHaveProperty("domains");
  });

  it("dashboard route unaffected (authoring caller)", async () => {
    // Phase 86C4B2B1D-SECURITY-5: /api/dashboard is now authoring-gated, so
    // this cross-route smoke check authenticates as an engineer before import.
    vi.resetModules();
    mockEngineer();
    const { GET } = await import("../../../dashboard/route");
    const body = await (await GET()).json();
    expect(body).toHaveProperty("systemSummary");
    expect(body).toHaveProperty("systemHealth");
  });
});
