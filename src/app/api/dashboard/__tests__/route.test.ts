import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockEngineer, unmockAuth } from "@/test/mock-auth";

/**
 * Phase 23 — GET /api/dashboard route tests.
 * All tests run in session mode (no DATABASE_URL).
 *
 * Phase 82D.1A: the backward-compat block below invokes the now authoring-gated
 * /api/projects/analytics and /api/projects/benchmark handlers, so those tests
 * mock an authoring session before importing them.
 *
 * Phase 86C4B2B1D-SECURITY-5: the dashboard route itself is now authoring-gated
 * (it aggregates the global engineering brain), so the default `beforeEach`
 * establishes an authoring engineer; the anonymous/non-authoring rejection is
 * proven in dashboard-api-boundaries.test.ts.
 */

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  vi.resetModules();
  mockEngineer();
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

function seedProject(id: string, status = "active") {
  const arr = (globalThis as Record<string, unknown>).__hermesProjects as unknown[];
  arr.push({ id, name: `Project ${id}`, description: "", status,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
}

let mIdx = 0;
function seedMemory(id: string, opts: { projectId?: string; outcome?: string; confidence?: number } = {}) {
  mIdx++;
  const arr = (globalThis as Record<string, unknown>).__hermesEngineeringMemory as unknown[];
  arr.push({
    id, query: `query ${mIdx}`, domain: "drives",
    analysisSummary: `summary ${mIdx}`, confidence: opts.confidence ?? 70,
    relatedCaseIds: [], relatedDocumentIds: [],
    outcome: opts.outcome ?? "unknown",
    projectId: opts.projectId,
    createdAt: "2026-01-10T00:00:00.000Z", updatedAt: "2026-01-10T00:00:00.000Z",
  });
}

// ── Response shape ─────────────────────────────────────────────────────────

describe("GET /api/dashboard — response shape", () => {
  it("returns 200 with correct top-level keys", async () => {
    const { GET } = await import("../route");
    const res  = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("storageMode");
    expect(body).toHaveProperty("generatedAt");
    expect(body).toHaveProperty("systemSummary");
    expect(body).toHaveProperty("memoryHealth");
    expect(body).toHaveProperty("projectHealth");
    expect(body).toHaveProperty("graphSnapshot");
    expect(body).toHaveProperty("systemHealth");
    expect(body).toHaveProperty("insights");
  });

  it("systemSummary has all required fields", async () => {
    const { GET } = await import("../route");
    const { systemSummary } = await (await GET()).json();
    expect(systemSummary).toHaveProperty("totalProjects");
    expect(systemSummary).toHaveProperty("activeProjects");
    expect(systemSummary).toHaveProperty("totalMemories");
    expect(systemSummary).toHaveProperty("linkedMemories");
    expect(systemSummary).toHaveProperty("totalDomains");
    expect(systemSummary).toHaveProperty("totalCases");
  });

  it("memoryHealth has all required fields", async () => {
    const { GET } = await import("../route");
    const { memoryHealth } = await (await GET()).json();
    expect(memoryHealth).toHaveProperty("avgConfidence");
    expect(memoryHealth).toHaveProperty("feedbackRate");
    expect(memoryHealth).toHaveProperty("successRate");
    expect(memoryHealth).toHaveProperty("outcomeDistribution");
    expect(memoryHealth).toHaveProperty("highConfidenceCount");
    expect(memoryHealth).toHaveProperty("lowConfidenceCount");
  });

  it("projectHealth has byStatus with all three statuses", async () => {
    const { GET } = await import("../route");
    const { projectHealth } = await (await GET()).json();
    expect(projectHealth.byStatus).toHaveProperty("active");
    expect(projectHealth.byStatus).toHaveProperty("archived");
    expect(projectHealth.byStatus).toHaveProperty("completed");
    expect(projectHealth).toHaveProperty("systemRiskLevel");
    expect(projectHealth).toHaveProperty("highRiskProjects");
    expect(projectHealth).toHaveProperty("avgFailureRate");
  });

  it("graphSnapshot has all fields", async () => {
    const { GET } = await import("../route");
    const { graphSnapshot } = await (await GET()).json();
    expect(graphSnapshot).toHaveProperty("totalNodes");
    expect(graphSnapshot).toHaveProperty("totalEdges");
    expect(graphSnapshot).toHaveProperty("connectedComponents");
    expect(graphSnapshot).toHaveProperty("healthScore");
    expect(graphSnapshot).toHaveProperty("avgDegree");
    expect(graphSnapshot).toHaveProperty("isolatedNodes");
  });

  it("systemHealth has overall, memory, projects, graph", async () => {
    const { GET } = await import("../route");
    const { systemHealth } = await (await GET()).json();
    expect(systemHealth).toHaveProperty("overall");
    expect(systemHealth).toHaveProperty("memory");
    expect(systemHealth).toHaveProperty("projects");
    expect(systemHealth).toHaveProperty("graph");
  });

  it("insights is an array", async () => {
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(Array.isArray(body.insights)).toBe(true);
  });

  it("generatedAt is a valid ISO 8601 timestamp", async () => {
    const { GET } = await import("../route");
    const { generatedAt } = await (await GET()).json();
    expect(new Date(generatedAt).getTime()).not.toBeNaN();
    expect(generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

// ── Empty store ────────────────────────────────────────────────────────────

describe("GET /api/dashboard — empty store", () => {
  it("all counts are 0 for empty store", async () => {
    const { GET } = await import("../route");
    const { systemSummary } = await (await GET()).json();
    expect(systemSummary.totalProjects).toBe(0);
    expect(systemSummary.totalMemories).toBe(0);
  });

  it("empty_system insight fires for empty store", async () => {
    const { GET } = await import("../route");
    const { insights } = await (await GET()).json();
    expect(insights.some((i: { type: string }) => i.type === "empty_system")).toBe(true);
  });

  it("systemRiskLevel is 'low' for empty store", async () => {
    const { GET } = await import("../route");
    const { projectHealth } = await (await GET()).json();
    expect(projectHealth.systemRiskLevel).toBe("low");
  });
});

// ── Seeded data ────────────────────────────────────────────────────────────

describe("GET /api/dashboard — seeded data", () => {
  it("totalProjects counts seeded projects", async () => {
    seedProject("p1");
    seedProject("p2");
    const { GET } = await import("../route");
    const { systemSummary } = await (await GET()).json();
    expect(systemSummary.totalProjects).toBe(2);
  });

  it("totalMemories counts seeded memories", async () => {
    seedMemory("m1");
    seedMemory("m2");
    seedMemory("m3");
    const { GET } = await import("../route");
    const { systemSummary } = await (await GET()).json();
    expect(systemSummary.totalMemories).toBe(3);
  });

  it("linkedMemories counts only memories with projectId", async () => {
    seedProject("p1");
    seedMemory("m1", { projectId: "p1" });
    seedMemory("m2");  // no project
    const { GET } = await import("../route");
    const { systemSummary } = await (await GET()).json();
    expect(systemSummary.linkedMemories).toBe(1);
  });

  it("coverage_gap insight fires when some memories are unlinked", async () => {
    seedMemory("m1");  // no project
    const { GET } = await import("../route");
    const { insights } = await (await GET()).json();
    expect(insights.some((i: { type: string }) => i.type === "coverage_gap")).toBe(true);
  });

  it("empty_system does NOT fire when memories exist", async () => {
    seedMemory("m1");
    const { GET } = await import("../route");
    const { insights } = await (await GET()).json();
    expect(insights.some((i: { type: string }) => i.type === "empty_system")).toBe(false);
  });

  it("activeProjects counts only active status", async () => {
    seedProject("p1", "active");
    seedProject("p2", "archived");
    const { GET } = await import("../route");
    const { systemSummary } = await (await GET()).json();
    expect(systemSummary.activeProjects).toBe(1);
  });

  it("successRate reflects outcome=success fraction", async () => {
    seedMemory("m1", { outcome: "success" });
    seedMemory("m2", { outcome: "failed" });
    const { GET } = await import("../route");
    const { memoryHealth } = await (await GET()).json();
    expect(memoryHealth.successRate).toBe(50);
  });
});

// ── Failure fallback ───────────────────────────────────────────────────────

describe("GET /api/dashboard — failure fallback", () => {
  it("returns 200 with empty dashboard when service throws", async () => {
    vi.doMock("@/lib/services/dashboard-service", () => ({
      getDashboard: () => { throw new Error("db_down"); },
    }));
    const { GET } = await import("../route");
    const res  = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.systemSummary.totalProjects).toBe(0);
    expect(body.systemHealth.overall).toBe(0);
    expect(Array.isArray(body.insights)).toBe(true);
    vi.doUnmock("@/lib/services/dashboard-service");
  });
});

// ── Backward compatibility ─────────────────────────────────────────────────

describe("GET /api/dashboard — backward compat", () => {
  it("knowledge-graph route unaffected", async () => {
    const { GET } = await import("../../knowledge-graph/route");
    const body = await (await GET()).json();
    expect(body).toHaveProperty("nodes");
    expect(body).toHaveProperty("edges");
  });

  it("projects/analytics route unaffected", async () => {
    vi.resetModules();
    mockEngineer();
    const { GET } = await import("../../projects/analytics/route");
    const body = await (await GET()).json();
    expect(body).toHaveProperty("projectStats");
    expect(body).toHaveProperty("insights");
  });

  it("benchmark route unaffected", async () => {
    vi.resetModules();
    mockEngineer();
    const { GET } = await import("../../projects/benchmark/route");
    const body = await (await GET()).json();
    expect(body).toHaveProperty("leaders");
    expect(body).toHaveProperty("rankings");
  });
});
