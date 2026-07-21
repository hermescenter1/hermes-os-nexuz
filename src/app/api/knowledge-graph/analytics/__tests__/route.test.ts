import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockEngineer, mockNoUser, unmockAuth } from "@/test/mock-auth";

/**
 * Phase 22 — GET /api/knowledge-graph/analytics route tests.
 * All tests run in session mode (no DATABASE_URL).
 *
 * Phase 82D.1: the backward-compat test that invokes the now authoring-gated
 * /api/projects/benchmark handler mocks an authoring session first.
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
  // PHASE 90: these routes project the PRIVATE engineering memory store, so
  // they are now authoring-gated (same policy as /api/memory and /api/projects
  // since 82C). The existing behavioural assertions below describe the
  // AUTHORISED view, so the suite authenticates as an authoring user; the gate
  // itself is asserted separately at the end of the file.
  mockEngineer();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  unmockAuth();
});

// ── Helpers ────────────────────────────────────────────────────────────────

function seedProject(id: string, name = `Project ${id}`) {
  const arr = (globalThis as Record<string, unknown>).__hermesProjects as unknown[];
  arr.push({ id, name, description: "", status: "active",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
}

let mIdx = 0;
function seedMemory(id: string, opts: { projectId?: string; domain?: string; confidence?: number; outcome?: string } = {}) {
  mIdx++;
  const arr = (globalThis as Record<string, unknown>).__hermesEngineeringMemory as unknown[];
  arr.push({
    id, query: `query ${mIdx}`, domain: opts.domain ?? "drives",
    analysisSummary: `summary ${mIdx}`, confidence: opts.confidence ?? 70,
    relatedCaseIds: [], relatedDocumentIds: [],
    outcome: opts.outcome ?? "unknown",
    projectId: opts.projectId,
    createdAt: "2026-01-10T00:00:00.000Z", updatedAt: "2026-01-10T00:00:00.000Z",
  });
}

// ── Response shape ─────────────────────────────────────────────────────────

describe("GET /api/knowledge-graph/analytics — response shape", () => {
  it("returns 200 with correct top-level keys", async () => {
    const { GET } = await import("../route");
    const res  = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("storageMode");
    expect(body).toHaveProperty("centrality");
    expect(body).toHaveProperty("domainHealth");
    expect(body).toHaveProperty("projectConnectivity");
    expect(body).toHaveProperty("health");
  });

  it("health has overallScore, coverageScore, connectivityScore, qualityScore, insights", async () => {
    const { GET } = await import("../route");
    const { health } = await (await GET()).json();
    expect(health).toHaveProperty("overallScore");
    expect(health).toHaveProperty("coverageScore");
    expect(health).toHaveProperty("connectivityScore");
    expect(health).toHaveProperty("qualityScore");
    expect(health).toHaveProperty("insights");
    expect(Array.isArray(health.insights)).toBe(true);
  });

  it("centrality, domainHealth, projectConnectivity are arrays", async () => {
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(Array.isArray(body.centrality)).toBe(true);
    expect(Array.isArray(body.domainHealth)).toBe(true);
    expect(Array.isArray(body.projectConnectivity)).toBe(true);
  });
});

// ── Empty store ────────────────────────────────────────────────────────────

describe("GET /api/knowledge-graph/analytics — empty store", () => {
  it("returns empty arrays and zero health for empty store", async () => {
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.centrality).toEqual([]);
    expect(body.domainHealth).toEqual([]);
    expect(body.projectConnectivity).toEqual([]);
    expect(body.health.overallScore).toBe(0);
  });

  it("empty insights for empty store", async () => {
    const { GET } = await import("../route");
    expect((await (await GET()).json()).health.insights).toEqual([]);
  });
});

// ── Seeded data ────────────────────────────────────────────────────────────

describe("GET /api/knowledge-graph/analytics — seeded data", () => {
  it("centrality includes all graph nodes", async () => {
    seedProject("p1");
    seedMemory("m1", { projectId: "p1" });
    const { GET } = await import("../route");
    const { centrality } = await (await GET()).json();
    expect(centrality.length).toBeGreaterThan(0);
  });

  it("project node appears in centrality", async () => {
    seedProject("p1");
    const { GET } = await import("../route");
    const { centrality } = await (await GET()).json();
    expect(centrality.some((c: { nodeId: string }) => c.nodeId === "project:p1")).toBe(true);
  });

  it("domainHealth populated when memories exist", async () => {
    seedMemory("m1", { domain: "drives" });
    const { GET } = await import("../route");
    const { domainHealth } = await (await GET()).json();
    expect(domainHealth.length).toBeGreaterThan(0);
    expect(domainHealth[0]).toHaveProperty("domain");
    expect(domainHealth[0]).toHaveProperty("healthScore");
  });

  it("projectConnectivity has one entry per project", async () => {
    seedProject("p1");
    seedProject("p2");
    const { GET } = await import("../route");
    const { projectConnectivity } = await (await GET()).json();
    expect(projectConnectivity).toHaveLength(2);
  });

  it("projectConnectivity entry has required fields", async () => {
    seedProject("p1");
    const { GET } = await import("../route");
    const { projectConnectivity } = await (await GET()).json();
    const entry = projectConnectivity[0];
    expect(entry).toHaveProperty("projectId", "p1");
    expect(entry).toHaveProperty("projectName");
    expect(entry).toHaveProperty("directEdges");
    expect(entry).toHaveProperty("reachableNodes");
    expect(entry).toHaveProperty("isolationScore");
  });

  it("coverageScore=100 when single memory is linked to project", async () => {
    seedProject("p1");
    seedMemory("m1", { projectId: "p1" });
    const { GET } = await import("../route");
    const { health } = await (await GET()).json();
    expect(health.coverageScore).toBe(100);
  });

  it("orphan_memories insight fires when memory has no project", async () => {
    seedProject("p1");
    seedMemory("m1");  // no projectId
    const { GET } = await import("../route");
    const { health } = await (await GET()).json();
    const orphan = health.insights.find((i: { type: string }) => i.type === "orphan_memories");
    expect(orphan).toBeDefined();
  });

  it("isolated_project insight fires for project with no memories", async () => {
    seedProject("p1");  // no memories attached
    const { GET } = await import("../route");
    const { health } = await (await GET()).json();
    const iso = health.insights.find((i: { type: string }) => i.type === "isolated_project");
    expect(iso).toBeDefined();
    expect(iso.nodeId).toBe("project:p1");
  });
});

// ── Failure fallback ───────────────────────────────────────────────────────

describe("GET /api/knowledge-graph/analytics — failure fallback", () => {
  it("returns 200 with empty analytics when service throws", async () => {
    vi.doMock("@/lib/services/graph-analytics-service", () => ({
      getGraphAnalytics: () => { throw new Error("db_down"); },
    }));
    const { GET } = await import("../route");
    const res  = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.centrality).toEqual([]);
    expect(body.health.overallScore).toBe(0);
    vi.doUnmock("@/lib/services/graph-analytics-service");
  });
});

// ── Backward compatibility ─────────────────────────────────────────────────

describe("GET /api/knowledge-graph/analytics — backward compat", () => {
  it("base /api/knowledge-graph route unaffected", async () => {
    const { GET } = await import("../../route");
    const body = await (await GET()).json();
    expect(body).toHaveProperty("nodes");
    expect(body).toHaveProperty("edges");
    expect(body).toHaveProperty("summary");
  });

  it("benchmark route unaffected", async () => {
    vi.resetModules();
    mockEngineer();
    const { GET } = await import("../../../projects/benchmark/route");
    const body = await (await GET()).json();
    expect(body).toHaveProperty("leaders");
    expect(body).toHaveProperty("rankings");
  });
});
