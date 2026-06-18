import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Phase 20D — GET /api/projects/benchmark route tests.
 *
 * All tests run in session mode (no DATABASE_URL).
 */

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  vi.resetModules();
  (globalThis as Record<string, unknown>).__hermesProjects         = [];
  (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
  (globalThis as Record<string, unknown>).__hermesMemoryFeedback    = [];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────

function seedProject(overrides: Record<string, unknown>) {
  const projects = (globalThis as Record<string, unknown>).__hermesProjects as unknown[];
  projects.push({
    id: "p1", name: "Project One", description: "",
    status: "active", createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z", ...overrides,
  });
}

let memIdx = 0;
let fbIdx  = 0;

function seedMemory(id: string, projectId: string, confidence = 70) {
  const memories = (globalThis as Record<string, unknown>).__hermesEngineeringMemory as unknown[];
  memories.push({
    id, query: `q${++memIdx}`, domain: "drives",
    analysisSummary: `s${memIdx}`, confidence,
    relatedCaseIds: [], relatedDocumentIds: [],
    outcome: "unknown", projectId,
    createdAt: "2026-01-10T00:00:00.000Z",
    updatedAt: "2026-01-10T00:00:00.000Z",
  });
}

function seedFeedback(memoryId: string, outcome: string) {
  const feedbacks = (globalThis as Record<string, unknown>).__hermesMemoryFeedback as unknown[];
  feedbacks.push({
    id: `fb${++fbIdx}`, memoryId, outcome, createdAt: "2026-02-01T00:00:00.000Z",
  });
}

// ── Response shape ─────────────────────────────────────────────────────────

describe("GET /api/projects/benchmark — response shape", () => {
  it("returns 200 with correct top-level keys", async () => {
    const { GET } = await import("../route");
    const res  = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("storageMode");
    expect(body).toHaveProperty("summary");
    expect(body).toHaveProperty("leaders");
    expect(body).toHaveProperty("rankings");
    expect(body).toHaveProperty("insights");
  });

  it("summary has all required keys", async () => {
    const { GET } = await import("../route");
    const { summary } = await (await GET()).json();
    expect(summary).toHaveProperty("totalProjects");
    expect(summary).toHaveProperty("activeProjects");
    expect(summary).toHaveProperty("completedProjects");
    expect(summary).toHaveProperty("archivedProjects");
  });

  it("leaders has all six leader keys", async () => {
    const { GET } = await import("../route");
    const { leaders } = await (await GET()).json();
    expect(leaders).toHaveProperty("highestSuccessRate");
    expect(leaders).toHaveProperty("highestRisk");
    expect(leaders).toHaveProperty("mostActive");
    expect(leaders).toHaveProperty("mostMemories");
    expect(leaders).toHaveProperty("mostIncidents");
    expect(leaders).toHaveProperty("bestConfidence");
  });

  it("rankings has all four ranking arrays", async () => {
    const { GET } = await import("../route");
    const { rankings } = await (await GET()).json();
    expect(Array.isArray(rankings.successRate)).toBe(true);
    expect(Array.isArray(rankings.riskScore)).toBe(true);
    expect(Array.isArray(rankings.activity)).toBe(true);
    expect(Array.isArray(rankings.confidence)).toBe(true);
  });

  it("insights is an array", async () => {
    const { GET } = await import("../route");
    const { insights } = await (await GET()).json();
    expect(Array.isArray(insights)).toBe(true);
  });
});

// ── Empty store ────────────────────────────────────────────────────────────

describe("GET /api/projects/benchmark — empty store", () => {
  it("summary shows zeros", async () => {
    const { GET } = await import("../route");
    const { summary } = await (await GET()).json();
    expect(summary.totalProjects).toBe(0);
    expect(summary.activeProjects).toBe(0);
  });

  it("all leaders are null", async () => {
    const { GET } = await import("../route");
    const { leaders } = await (await GET()).json();
    expect(leaders.highestSuccessRate).toBeNull();
    expect(leaders.highestRisk).toBeNull();
    expect(leaders.mostActive).toBeNull();
    expect(leaders.mostMemories).toBeNull();
    expect(leaders.mostIncidents).toBeNull();
    expect(leaders.bestConfidence).toBeNull();
  });

  it("rankings are all empty arrays", async () => {
    const { GET } = await import("../route");
    const { rankings } = await (await GET()).json();
    expect(rankings.successRate).toEqual([]);
    expect(rankings.riskScore).toEqual([]);
  });

  it("no insights for empty portfolio", async () => {
    const { GET } = await import("../route");
    const { insights } = await (await GET()).json();
    expect(insights).toEqual([]);
  });
});

// ── Single project ─────────────────────────────────────────────────────────

describe("GET /api/projects/benchmark — single project", () => {
  it("summary counts one active project", async () => {
    seedProject({ id: "p1", status: "active" });
    const { GET } = await import("../route");
    const { summary } = await (await GET()).json();
    expect(summary.totalProjects).toBe(1);
    expect(summary.activeProjects).toBe(1);
  });

  it("rankings have one entry per array with rank=1", async () => {
    seedProject({ id: "p1" });
    const { GET } = await import("../route");
    const { rankings } = await (await GET()).json();
    expect(rankings.successRate.length).toBe(1);
    expect(rankings.successRate[0].rank).toBe(1);
  });

  it("leader values are valid numbers", async () => {
    seedProject({ id: "p1" });
    seedMemory("m1", "p1", 80);
    seedFeedback("m1", "success");
    const { GET } = await import("../route");
    const { leaders } = await (await GET()).json();
    expect(typeof leaders.highestSuccessRate.value).toBe("number");
    expect(leaders.highestSuccessRate.value).toBe(100);
  });
});

// ── Multiple projects ──────────────────────────────────────────────────────

describe("GET /api/projects/benchmark — multiple projects", () => {
  it("rankings list all projects", async () => {
    seedProject({ id: "p1" });
    seedProject({ id: "p2", name: "Project Two" });
    seedProject({ id: "p3", name: "Project Three", status: "completed" });
    const { GET } = await import("../route");
    const { rankings } = await (await GET()).json();
    expect(rankings.successRate.length).toBe(3);
  });

  it("mostIncidents null when no failures", async () => {
    seedProject({ id: "p1" });
    seedMemory("m1", "p1");
    seedFeedback("m1", "success");
    const { GET } = await import("../route");
    const { leaders } = await (await GET()).json();
    expect(leaders.mostIncidents).toBeNull();
  });

  it("mostIncidents non-null when failures exist", async () => {
    seedProject({ id: "p1" });
    seedMemory("m1", "p1");
    seedFeedback("m1", "failed");
    const { GET } = await import("../route");
    const { leaders } = await (await GET()).json();
    expect(leaders.mostIncidents).not.toBeNull();
    expect(leaders.mostIncidents.value).toBe(1);
  });

  it("portfolio_health insight always present", async () => {
    seedProject({ id: "p1" });
    const { GET } = await import("../route");
    const { insights } = await (await GET()).json();
    expect(insights.some((i: { type: string }) => i.type === "portfolio_health")).toBe(true);
  });

  it("riskLevel values are valid strings in ranking entries", async () => {
    seedProject({ id: "p1" });
    seedProject({ id: "p2", name: "P2" });
    const { GET } = await import("../route");
    const { rankings } = await (await GET()).json();
    const levels = ["low", "medium", "high", "critical"];
    for (const entry of rankings.riskScore) {
      expect(levels).toContain(entry.riskLevel);
    }
  });
});

// ── Storage failure ────────────────────────────────────────────────────────

describe("GET /api/projects/benchmark — storage failure fallback", () => {
  it("returns 200 with empty-but-valid body when service throws", async () => {
    vi.doMock("@/lib/services/project-benchmark-service", () => ({
      getBenchmark: () => { throw new Error("db_down"); },
    }));
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.totalProjects).toBe(0);
    expect(body.leaders.highestRisk).toBeNull();
    expect(body.rankings.successRate).toEqual([]);
    expect(body.insights).toEqual([]);
    vi.doUnmock("@/lib/services/project-benchmark-service");
  });
});

// ── Backward compatibility ─────────────────────────────────────────────────

describe("GET /api/projects/benchmark — backward compatibility", () => {
  it("analytics route is unaffected", async () => {
    const { GET } = await import("../../analytics/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("summary");
    expect(body).toHaveProperty("projectStats");
    expect(body).toHaveProperty("insights");
  });

  it("project list route is unaffected", async () => {
    seedProject({ id: "p1" });
    const { GET } = await import("../../route");
    const res  = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.projects)).toBe(true);
  });
});
