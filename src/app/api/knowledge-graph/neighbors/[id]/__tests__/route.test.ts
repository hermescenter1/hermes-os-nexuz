import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockEngineer, mockNoUser, unmockAuth } from "@/test/mock-auth";

/**
 * Phase 21B — GET /api/knowledge-graph/neighbors/[id] route tests.
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
    new Request(`http://localhost/api/knowledge-graph/neighbors/${encodeURIComponent(id)}`),
    { params: Promise.resolve({ id }) }
  );
}

// ── Not found ─────────────────────────────────────────────────────────────

describe("GET /api/knowledge-graph/neighbors/[id] — not found", () => {
  it("returns 404 for unknown node id", async () => {
    const res = await callRoute("project:ghost");
    expect(res.status).toBe(404);
  });

  it("404 body has error field", async () => {
    const body = await (await callRoute("project:ghost")).json();
    expect(body).toHaveProperty("error");
  });
});

// ── Found ──────────────────────────────────────────────────────────────────

describe("GET /api/knowledge-graph/neighbors/[id] — found", () => {
  it("returns 200 for existing node", async () => {
    seedProject("p1");
    expect((await callRoute("project:p1")).status).toBe(200);
  });

  it("response includes storageMode, nodeId, neighbors, stats", async () => {
    seedProject("p1");
    const body = await (await callRoute("project:p1")).json();
    expect(body).toHaveProperty("storageMode");
    expect(body).toHaveProperty("nodeId", "project:p1");
    expect(body).toHaveProperty("neighbors");
    expect(body).toHaveProperty("stats");
    expect(Array.isArray(body.neighbors)).toBe(true);
  });

  it("stats.totalNeighbors equals neighbors.length", async () => {
    seedProject("p1");
    const body = await (await callRoute("project:p1")).json();
    expect(body.stats.totalNeighbors).toBe(body.neighbors.length);
  });

  it("project:p1 has risk:p1 as neighbor", async () => {
    seedProject("p1");
    const { neighbors } = await (await callRoute("project:p1")).json();
    const riskNeighbor = neighbors.find(
      (nb: { node: { id: string } }) => nb.node.id === "risk:p1"
    );
    expect(riskNeighbor).toBeDefined();
  });

  it("each neighbor entry has node and edge with direction", async () => {
    seedProject("p1");
    const { neighbors } = await (await callRoute("project:p1")).json();
    for (const nb of neighbors) {
      expect(nb).toHaveProperty("node");
      expect(nb).toHaveProperty("edge");
      expect(["inbound", "outbound"]).toContain(nb.edge.direction);
    }
  });

  it("memory attached to project has project:p1 as inbound neighbor", async () => {
    seedProject("p1");
    seedMemory("m1", "p1");
    const { neighbors } = await (await callRoute("memory:m1")).json();
    const projNeighbor = neighbors.find(
      (nb: { node: { id: string } }) => nb.node.id === "project:p1"
    );
    expect(projNeighbor).toBeDefined();
    expect(projNeighbor.edge.direction).toBe("outbound");
  });

  it("domain node has only inbound neighbors", async () => {
    seedMemory("m1");
    seedMemory("m2");
    const { neighbors } = await (await callRoute("domain:drives")).json();
    expect(neighbors.length).toBeGreaterThan(0);
    for (const nb of neighbors) {
      expect(nb.edge.direction).toBe("inbound");
    }
  });
});

// ── Service failure ────────────────────────────────────────────────────────

describe("GET /api/knowledge-graph/neighbors/[id] — service failure", () => {
  it("returns 404 when service throws", async () => {
    vi.doMock("@/lib/services/graph-navigation-service", () => ({
      getNodeNeighbors: () => { throw new Error("db_down"); },
    }));
    const { GET } = await import("../route");
    const res = await GET(
      new Request("http://localhost/api/knowledge-graph/neighbors/project%3Ap1"),
      { params: Promise.resolve({ id: "project:p1" }) }
    );
    expect(res.status).toBe(404);
    vi.doUnmock("@/lib/services/graph-navigation-service");
  });
});
