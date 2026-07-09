import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockEngineer, unmockAuth } from "@/test/mock-auth";

/**
 * Phase 21A — GET /api/knowledge-graph route tests.
 *
 * All tests run in session mode (no DATABASE_URL).
 *
 * Phase 82D.1: the backward-compat block below invokes the now authoring-gated
 * /api/projects/benchmark and /api/projects/analytics handlers, so those tests
 * mock an authoring session before importing them. The knowledge-graph route
 * itself is unchanged and needs no auth mock.
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

function seedProject(id: string, overrides: Record<string, unknown> = {}) {
  const arr = (globalThis as Record<string, unknown>).__hermesProjects as unknown[];
  arr.push({ id, name: `Project ${id}`, description: "", status: "active",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides });
}

let memIdx = 0;
function seedMemory(id: string, projectId?: string) {
  memIdx++;
  const arr = (globalThis as Record<string, unknown>).__hermesEngineeringMemory as unknown[];
  arr.push({
    id, query: `query ${memIdx}`, domain: "drives",
    analysisSummary: `summary ${memIdx}`, confidence: 70,
    relatedCaseIds: [], relatedDocumentIds: [],
    outcome: "unknown", projectId,
    createdAt: "2026-01-10T00:00:00.000Z", updatedAt: "2026-01-10T00:00:00.000Z",
  });
}

// ── Response shape ─────────────────────────────────────────────────────────

describe("GET /api/knowledge-graph — response shape", () => {
  it("returns 200 with correct top-level keys", async () => {
    const { GET } = await import("../route");
    const res  = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("storageMode");
    expect(body).toHaveProperty("nodes");
    expect(body).toHaveProperty("edges");
    expect(body).toHaveProperty("summary");
  });

  it("summary has all required keys", async () => {
    const { GET } = await import("../route");
    const { summary } = await (await GET()).json();
    expect(summary).toHaveProperty("totalNodes");
    expect(summary).toHaveProperty("totalEdges");
    expect(summary).toHaveProperty("nodesByType");
    expect(summary).toHaveProperty("edgesByType");
    expect(summary).toHaveProperty("connectedComponents");
    expect(summary).toHaveProperty("avgDegree");
    expect(summary).toHaveProperty("isolatedNodes");
  });

  it("nodesByType has all seven node types", async () => {
    const { GET } = await import("../route");
    const { summary } = await (await GET()).json();
    const nt = summary.nodesByType;
    expect(nt).toHaveProperty("project");
    expect(nt).toHaveProperty("memory");
    expect(nt).toHaveProperty("domain");
    expect(nt).toHaveProperty("case");
    expect(nt).toHaveProperty("risk");
    expect(nt).toHaveProperty("outcome");
    expect(nt).toHaveProperty("solution");
  });

  it("edgesByType has all six edge types", async () => {
    const { GET } = await import("../route");
    const { summary } = await (await GET()).json();
    const et = summary.edgesByType;
    expect(et).toHaveProperty("belongs_to_project");
    expect(et).toHaveProperty("related_to_domain");
    expect(et).toHaveProperty("has_outcome");
    expect(et).toHaveProperty("has_risk");
    expect(et).toHaveProperty("similar_to");
    expect(et).toHaveProperty("resolved_by");
  });

  it("nodes and edges are arrays", async () => {
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);
  });
});

// ── Empty store ────────────────────────────────────────────────────────────

describe("GET /api/knowledge-graph — empty store", () => {
  it("returns empty nodes and edges", async () => {
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.nodes).toEqual([]);
    expect(body.edges).toEqual([]);
  });

  it("summary all zeros for empty store", async () => {
    const { GET } = await import("../route");
    const { summary } = await (await GET()).json();
    expect(summary.totalNodes).toBe(0);
    expect(summary.totalEdges).toBe(0);
    expect(summary.connectedComponents).toBe(0);
  });
});

// ── With data ──────────────────────────────────────────────────────────────

describe("GET /api/knowledge-graph — seeded data", () => {
  it("includes project nodes for seeded projects", async () => {
    seedProject("p1");
    const { GET } = await import("../route");
    const { nodes } = await (await GET()).json();
    expect(nodes.some((n: { type: string }) => n.type === "project")).toBe(true);
  });

  it("includes memory and domain nodes for seeded memories", async () => {
    seedMemory("m1");
    const { GET } = await import("../route");
    const { nodes } = await (await GET()).json();
    expect(nodes.some((n: { type: string }) => n.type === "memory")).toBe(true);
    expect(nodes.some((n: { type: string }) => n.type === "domain")).toBe(true);
  });

  it("includes risk node for project", async () => {
    seedProject("p1");
    const { GET } = await import("../route");
    const { nodes } = await (await GET()).json();
    expect(nodes.some((n: { type: string; id: string }) => n.type === "risk" && n.id === "risk:p1")).toBe(true);
  });

  it("totalNodes equals sum of nodesByType values", async () => {
    seedProject("p1");
    seedMemory("m1", "p1");
    const { GET } = await import("../route");
    const { summary } = await (await GET()).json();
    const sum = Object.values(summary.nodesByType as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(summary.totalNodes).toBe(sum);
  });

  it("includes has_risk edges for each project", async () => {
    seedProject("p1");
    seedProject("p2");
    const { GET } = await import("../route");
    const { edges } = await (await GET()).json();
    const riskEdges = edges.filter((e: { type: string }) => e.type === "has_risk");
    expect(riskEdges).toHaveLength(2);
  });
});

// ── Storage failure ────────────────────────────────────────────────────────

describe("GET /api/knowledge-graph — storage failure fallback", () => {
  it("returns 200 with empty graph when service throws", async () => {
    vi.doMock("@/lib/services/knowledge-graph-service", () => ({
      getKnowledgeGraph: () => { throw new Error("db_down"); },
    }));
    const { GET } = await import("../route");
    const res  = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nodes).toEqual([]);
    expect(body.edges).toEqual([]);
    expect(body.summary.totalNodes).toBe(0);
    vi.doUnmock("@/lib/services/knowledge-graph-service");
  });
});

// ── Backward compatibility ─────────────────────────────────────────────────

describe("GET /api/knowledge-graph — backward compatibility", () => {
  it("benchmark route still returns correct shape", async () => {
    vi.resetModules();
    mockEngineer();
    const { GET } = await import("../../projects/benchmark/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("summary");
    expect(body).toHaveProperty("leaders");
    expect(body).toHaveProperty("rankings");
  });

  it("analytics route still returns correct shape", async () => {
    vi.resetModules();
    mockEngineer();
    const { GET } = await import("../../projects/analytics/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("projectStats");
    expect(body).toHaveProperty("insights");
  });
});
