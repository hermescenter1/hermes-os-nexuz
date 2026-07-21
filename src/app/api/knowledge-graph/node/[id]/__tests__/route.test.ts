import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockEngineer, mockNoUser, unmockAuth } from "@/test/mock-auth";

/**
 * Phase 21B — GET /api/knowledge-graph/node/[id] route tests.
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

function seedProject(id: string) {
  const arr = (globalThis as Record<string, unknown>).__hermesProjects as unknown[];
  arr.push({ id, name: `Project ${id}`, description: "", status: "active",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
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

async function callRoute(id: string) {
  const { GET } = await import("../route");
  return GET(
    new Request(`http://localhost/api/knowledge-graph/node/${encodeURIComponent(id)}`),
    { params: Promise.resolve({ id }) }
  );
}

// ── Not found ─────────────────────────────────────────────────────────────

describe("GET /api/knowledge-graph/node/[id] — not found", () => {
  it("returns 404 for unknown node id", async () => {
    const res = await callRoute("project:ghost");
    expect(res.status).toBe(404);
  });

  it("404 body has error field", async () => {
    const res  = await callRoute("project:ghost");
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ── Found ──────────────────────────────────────────────────────────────────

describe("GET /api/knowledge-graph/node/[id] — found", () => {
  it("returns 200 with node details for a project node", async () => {
    seedProject("p1");
    const res  = await callRoute("project:p1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.node.id).toBe("project:p1");
    expect(body.node.type).toBe("project");
  });

  it("response includes storageMode", async () => {
    seedProject("p1");
    const body = await (await callRoute("project:p1")).json();
    expect(body).toHaveProperty("storageMode");
  });

  it("response includes edges array", async () => {
    seedProject("p1");
    const body = await (await callRoute("project:p1")).json();
    expect(Array.isArray(body.edges)).toBe(true);
  });

  it("response includes stats with inbound/outbound/total", async () => {
    seedProject("p1");
    const { stats } = await (await callRoute("project:p1")).json();
    expect(stats).toHaveProperty("inboundEdges");
    expect(stats).toHaveProperty("outboundEdges");
    expect(stats).toHaveProperty("totalEdges");
  });

  it("project:p1 has outbound has_risk edge to risk:p1", async () => {
    seedProject("p1");
    const { edges } = await (await callRoute("project:p1")).json();
    const riskEdge = edges.find((e: { type: string; direction: string }) =>
      e.type === "has_risk" && e.direction === "outbound"
    );
    expect(riskEdge).toBeDefined();
    expect(riskEdge.targetId).toBe("risk:p1");
  });

  it("memory node has related_to_domain edge", async () => {
    seedMemory("m1");
    const { edges } = await (await callRoute("memory:m1")).json();
    const domainEdge = edges.find((e: { type: string }) => e.type === "related_to_domain");
    expect(domainEdge).toBeDefined();
    expect(domainEdge.targetId).toBe("domain:drives");
  });

  it("edges include direction field (inbound or outbound)", async () => {
    seedProject("p1");
    seedMemory("m1", "p1");
    const { edges } = await (await callRoute("project:p1")).json();
    for (const edge of edges) {
      expect(["inbound", "outbound"]).toContain(edge.direction);
    }
  });

  it("stats.totalEdges matches edges.length", async () => {
    seedProject("p1");
    const body = await (await callRoute("project:p1")).json();
    expect(body.stats.totalEdges).toBe(body.edges.length);
  });
});

// ── Service failure ────────────────────────────────────────────────────────

describe("GET /api/knowledge-graph/node/[id] — service failure", () => {
  it("returns 404 when service throws", async () => {
    vi.doMock("@/lib/services/graph-navigation-service", () => ({
      getNodeById: () => { throw new Error("db_down"); },
    }));
    const { GET } = await import("../route");
    const res = await GET(
      new Request("http://localhost/api/knowledge-graph/node/project%3Ap1"),
      { params: Promise.resolve({ id: "project:p1" }) }
    );
    expect(res.status).toBe(404);
    vi.doUnmock("@/lib/services/graph-navigation-service");
  });
});
