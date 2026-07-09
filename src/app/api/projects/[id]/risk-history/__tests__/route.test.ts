import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockEngineer, mockViewer, mockNoUser, unmockAuth } from "@/test/mock-auth";

/**
 * Phase 20C — GET /api/projects/[id]/risk-history route tests.
 * Runs in session mode (no DATABASE_URL).
 *
 * Phase 82D.1: this route is authoring-gated (hard 401/403). Tests mock an
 * authoring session by default; the "auth gate" block overrides it.
 */

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL"] as const;
let saved: Record<string, string | undefined>;

function resetGlobals() {
  (globalThis as Record<string, unknown>).__hermesProjects       = [];
  (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
  (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
}

function seedProject(
  id: string,
  name = "Test Project",
  createdAt = "2026-01-01T00:00:00.000Z"
) {
  const projects = (globalThis as Record<string, unknown>).__hermesProjects as object[];
  projects.push({
    id, name, description: `${name} desc`, status: "active",
    createdAt, updatedAt: createdAt,
  });
}

function seedMemory(
  id: string,
  projectId: string,
  domain: string,
  confidence = 70,
  createdAt = "2026-02-01T00:00:00.000Z"
) {
  const mems = (globalThis as Record<string, unknown>).__hermesEngineeringMemory as object[];
  mems.push({
    id, query: `q-${id}`, domain,
    analysisSummary: `summary for ${domain}`, confidence,
    relatedCaseIds: [], relatedDocumentIds: [],
    outcome: "unknown", projectId,
    createdAt, updatedAt: createdAt,
  });
}

function seedFeedback(
  id: string,
  memoryId: string,
  outcome: string,
  createdAt = "2026-03-01T00:00:00.000Z"
) {
  const fbs = (globalThis as Record<string, unknown>).__hermesMemoryFeedback as object[];
  fbs.push({ id, memoryId, outcome, createdAt });
}

async function GET(id: string) {
  const { GET: handler } = await import("../route");
  return handler(new Request("http://localhost"), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  vi.resetModules();
  resetGlobals();
  mockEngineer();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  unmockAuth();
});

// ── Auth gate (Phase 82D.1) ───────────────────────────────────────────────

describe("GET /api/projects/[id]/risk-history — auth gate", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.resetModules();
    mockNoUser();
    const res = await GET("p1");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required." });
  });

  it("returns 403 for a non-authoring (viewer) user", async () => {
    vi.resetModules();
    mockViewer();
    const res = await GET("p1");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "Insufficient permissions." });
  });

  it("lets an authoring user reach the route (past the gate)", async () => {
    const res = await GET("p1");
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ── 404 / not found ─────────────────────────────────────────────────────────

describe("GET /api/projects/[id]/risk-history — not found", () => {
  it("returns 404 when project does not exist", async () => {
    const res = await GET("nonexistent");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });

  it("404 body does not expose raw error messages", async () => {
    const res = await GET("nonexistent");
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("stack");
    expect(JSON.stringify(body)).not.toContain("Error");
  });
});

// ── Response shape ─────────────────────────────────────────────────────────

describe("GET /api/projects/[id]/risk-history — response shape", () => {
  it("returns 200 with storageMode, projectId, currentRisk, riskTrend, history", async () => {
    seedProject("p1");
    const res = await GET("p1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("storageMode");
    expect(body).toHaveProperty("projectId", "p1");
    expect(body).toHaveProperty("currentRisk");
    expect(body).toHaveProperty("riskTrend");
    expect(body).toHaveProperty("history");
  });

  it("currentRisk has score, riskLevel, reason", async () => {
    seedProject("p1");
    const { currentRisk } = await (await GET("p1")).json();
    expect(currentRisk).toHaveProperty("score");
    expect(currentRisk).toHaveProperty("riskLevel");
    expect(currentRisk).toHaveProperty("reason");
  });

  it("history is an array", async () => {
    seedProject("p1");
    const { history } = await (await GET("p1")).json();
    expect(Array.isArray(history)).toBe(true);
  });

  it("storageMode is session", async () => {
    seedProject("p1");
    const { storageMode } = await (await GET("p1")).json();
    expect(storageMode).toBe("session");
  });
});

// ── Empty project ──────────────────────────────────────────────────────────

describe("GET /api/projects/[id]/risk-history — empty project", () => {
  it("project with no memories returns one history entry (project_created)", async () => {
    seedProject("p1");
    const { history } = await (await GET("p1")).json();
    expect(history).toHaveLength(1);
    expect(history[0].source).toBe("project_created");
  });

  it("initial risk is low with no activity", async () => {
    seedProject("p1");
    const { currentRisk } = await (await GET("p1")).json();
    expect(currentRisk.riskLevel).toBe("low");
    expect(currentRisk.score).toBe(0);
  });

  it("riskTrend is stable for a new project with no activity", async () => {
    seedProject("p1");
    const { riskTrend } = await (await GET("p1")).json();
    expect(riskTrend).toBe("stable");
  });
});

// ── Project with memories ──────────────────────────────────────────────────

describe("GET /api/projects/[id]/risk-history — project with memories", () => {
  it("memory events are included in risk calculation", async () => {
    seedProject("p1");
    seedMemory("m1", "p1", "drives");
    const { currentRisk } = await (await GET("p1")).json();
    // Unresolved memory raises score above 0
    expect(currentRisk.score).toBeGreaterThan(0);
  });

  it("failed feedback generates an outcome_failed history entry", async () => {
    seedProject("p1");
    seedMemory("m1", "p1", "drives");
    seedFeedback("f1", "m1", "failed", "2026-03-01T00:00:00.000Z");
    const { history } = await (await GET("p1")).json();
    const entry = history.find((h: { source: string }) => h.source === "outcome_failed");
    expect(entry).toBeDefined();
    expect(entry.timestamp).toBe("2026-03-01T00:00:00.000Z");
  });

  it("success feedback generates an outcome_resolved history entry", async () => {
    seedProject("p1");
    seedMemory("m1", "p1", "drives");
    seedFeedback("f1", "m1", "success", "2026-03-01T00:00:00.000Z");
    const { history } = await (await GET("p1")).json();
    expect(history.some((h: { source: string }) => h.source === "outcome_resolved")).toBe(true);
  });

  it("history entries are in chronological order (ASC)", async () => {
    seedProject("p1");
    seedMemory("m1", "p1", "drives");
    seedMemory("m2", "p1", "plc");
    seedFeedback("f1", "m1", "failed",  "2026-04-01T00:00:00.000Z");
    seedFeedback("f2", "m2", "success", "2026-02-01T00:00:00.000Z");
    const { history } = await (await GET("p1")).json();
    for (let i = 1; i < history.length; i++) {
      expect(history[i].timestamp >= history[i - 1].timestamp).toBe(true);
    }
  });

  it("risk score increases after a failure event", async () => {
    seedProject("p1");
    seedMemory("m1", "p1", "drives");
    seedFeedback("f1", "m1", "failed", "2026-03-01T00:00:00.000Z");
    const { history } = await (await GET("p1")).json();
    const init   = history[0];
    const failed = history.find((h: { source: string }) => h.source === "outcome_failed")!;
    expect(failed.score).toBeGreaterThan(init.score);
  });

  it("riskLevel values are one of the valid 4 levels", async () => {
    seedProject("p1");
    seedMemory("m1", "p1", "drives");
    seedFeedback("f1", "m1", "failed");
    const { history, currentRisk } = await (await GET("p1")).json();
    const valid = new Set(["low", "medium", "high", "critical"]);
    expect(valid.has(currentRisk.riskLevel)).toBe(true);
    for (const h of history) {
      expect(valid.has(h.riskLevel)).toBe(true);
    }
  });
});

// ── Storage failure fallback ───────────────────────────────────────────────

describe("GET /api/projects/[id]/risk-history — storage failure fallback", () => {
  afterEach(() => { vi.doUnmock("@/lib/services/project-risk-service"); });

  it("returns 404 when service throws unexpectedly", async () => {
    vi.doMock("@/lib/services/project-risk-service", () => ({
      getProjectRisk: vi.fn().mockRejectedValue(new Error("storage crash")),
    }));
    const { GET: handler } = await import("../route");
    const res = await handler(new Request("http://localhost"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(JSON.stringify(body)).not.toContain("storage crash");
  });
});

// ── Backward compatibility ─────────────────────────────────────────────────

describe("GET /api/projects/[id]/risk-history — backward compatibility", () => {
  it("does not affect GET /api/projects/[id]", async () => {
    seedProject("p1", "BC Project");
    const { GET: idHandler } = await import("../../route");
    const res = await idHandler(new Request("http://localhost"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).project.name).toBe("BC Project");
  });

  it("does not affect GET /api/projects/[id]/timeline", async () => {
    seedProject("p1");
    const { GET: tlHandler } = await import("../../timeline/route");
    const res = await tlHandler(new Request("http://localhost"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(200);
    const { timeline } = await res.json();
    expect(Array.isArray(timeline)).toBe(true);
  });

  it("does not affect GET /api/projects/analytics", async () => {
    const { GET: analyticsHandler } = await import("../../../analytics/route");
    const res = await analyticsHandler();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("summary");
  });
});
