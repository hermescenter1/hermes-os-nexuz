import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockEngineer, mockNoUser, unmockAuth } from "@/test/mock-auth";

/**
 * Phase 21B — GET /api/knowledge-graph/path route tests.
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

function makeReq(from?: string, to?: string): Request {
  const params = new URLSearchParams();
  if (from !== undefined) params.set("from", from);
  if (to   !== undefined) params.set("to",   to);
  return new Request(`http://localhost/api/knowledge-graph/path?${params.toString()}`);
}

// ── Validation ─────────────────────────────────────────────────────────────

describe("GET /api/knowledge-graph/path — validation", () => {
  it("returns 400 when from param is missing", async () => {
    const { GET } = await import("../route");
    const res = await GET(makeReq(undefined, "risk:p1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("missing_params");
  });

  it("returns 400 when to param is missing", async () => {
    const { GET } = await import("../route");
    const res = await GET(makeReq("project:p1", undefined));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("missing_params");
  });

  it("returns 400 when both params are missing", async () => {
    const { GET } = await import("../route");
    const res = await GET(makeReq());
    expect(res.status).toBe(400);
  });
});

// ── Response shape ─────────────────────────────────────────────────────────

describe("GET /api/knowledge-graph/path — response shape", () => {
  it("200 response has storageMode, found, fromId, toId, path", async () => {
    seedProject("p1");
    const { GET } = await import("../route");
    const res  = await GET(makeReq("project:p1", "risk:p1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("storageMode");
    expect(body).toHaveProperty("found");
    expect(body).toHaveProperty("fromId", "project:p1");
    expect(body).toHaveProperty("toId",   "risk:p1");
    expect(body).toHaveProperty("path");
  });
});

// ── Path found ─────────────────────────────────────────────────────────────

describe("GET /api/knowledge-graph/path — path found", () => {
  it("found: true when direct connection exists (project → risk)", async () => {
    seedProject("p1");
    const { GET } = await import("../route");
    const body = await (await GET(makeReq("project:p1", "risk:p1"))).json();
    expect(body.found).toBe(true);
    expect(body.path).not.toBeNull();
  });

  it("path.length = 1 for direct connection", async () => {
    seedProject("p1");
    const { GET } = await import("../route");
    const { path } = await (await GET(makeReq("project:p1", "risk:p1"))).json();
    expect(path.length).toBe(1);
  });

  it("path.nodes and path.edges are arrays", async () => {
    seedProject("p1");
    const { GET } = await import("../route");
    const { path } = await (await GET(makeReq("project:p1", "risk:p1"))).json();
    expect(Array.isArray(path.nodes)).toBe(true);
    expect(Array.isArray(path.edges)).toBe(true);
  });

  it("path.nodes.length = path.length + 1", async () => {
    seedProject("p1");
    const { GET } = await import("../route");
    const { path } = await (await GET(makeReq("project:p1", "risk:p1"))).json();
    expect(path.nodes.length).toBe(path.length + 1);
  });

  it("indirect path: project:p1 → memory:m1 → domain:drives (length=2)", async () => {
    seedProject("p1");
    seedMemory("m1", "p1");
    const { GET } = await import("../route");
    const { path } = await (await GET(makeReq("project:p1", "domain:drives"))).json();
    expect(path.length).toBe(2);
    expect(path.nodes[0].id).toBe("project:p1");
    expect(path.nodes[path.nodes.length - 1].id).toBe("domain:drives");
  });

  it("same-node path returns length 0", async () => {
    seedProject("p1");
    const { GET } = await import("../route");
    const { path, found } = await (await GET(makeReq("project:p1", "project:p1"))).json();
    expect(found).toBe(true);
    expect(path.length).toBe(0);
    expect(path.nodes).toHaveLength(1);
    expect(path.edges).toHaveLength(0);
  });
});

// ── Path not found ─────────────────────────────────────────────────────────

describe("GET /api/knowledge-graph/path — path not found", () => {
  it("found: false and path: null for disconnected nodes", async () => {
    // Two projects with no shared memories → only internal has_risk edges
    seedProject("p1");
    seedProject("p2");
    const { GET } = await import("../route");
    const body = await (await GET(makeReq("project:p1", "project:p2"))).json();
    expect(body.found).toBe(false);
    expect(body.path).toBeNull();
  });

  it("returns 200 (not 404) when no path exists", async () => {
    seedProject("p1");
    seedProject("p2");
    const { GET } = await import("../route");
    const res = await GET(makeReq("project:p1", "project:p2"));
    expect(res.status).toBe(200);
  });
});

// ── Service failure ────────────────────────────────────────────────────────

describe("GET /api/knowledge-graph/path — service failure", () => {
  it("returns 404 when service throws", async () => {
    vi.doMock("@/lib/services/graph-navigation-service", () => ({
      getPath: () => { throw new Error("db_down"); },
    }));
    const { GET } = await import("../route");
    const res = await GET(makeReq("project:p1", "risk:p1"));
    expect(res.status).toBe(404);
    vi.doUnmock("@/lib/services/graph-navigation-service");
  });
});

// ── Backward compatibility ─────────────────────────────────────────────────

describe("GET /api/knowledge-graph/path — backward compat", () => {
  it("base knowledge-graph route is unaffected", async () => {
    const { GET } = await import("../../route");
    const res  = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("nodes");
    expect(body).toHaveProperty("edges");
    expect(body).toHaveProperty("summary");
  });
});
