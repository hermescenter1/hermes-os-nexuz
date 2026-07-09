import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockEngineer, mockViewer, mockNoUser, unmockAuth } from "@/test/mock-auth";

/**
 * Phase 20A — GET /api/projects/analytics route tests.
 *
 * All tests run in session mode (no DATABASE_URL).
 *
 * Phase 82D.1: /api/projects/analytics is authoring-gated (hard 401/403).
 * Tests mock an authoring session by default; the "auth gate" block overrides
 * it to prove the invariants.
 */

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  vi.resetModules();
  (globalThis as Record<string, unknown>).__hermesProjects = [];
  (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
  (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
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

describe("GET /api/projects/analytics — auth gate", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.resetModules();
    mockNoUser();
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required." });
  });

  it("returns 403 for a non-authoring (viewer) user", async () => {
    vi.resetModules();
    mockViewer();
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "Insufficient permissions." });
  });

  it("lets an authoring user reach the analytics service (200)", async () => {
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

// ── Response shape ─────────────────────────────────────────────────────────

describe("GET /api/projects/analytics — response shape", () => {
  it("returns 200 with correct top-level keys", async () => {
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("storageMode");
    expect(body).toHaveProperty("summary");
    expect(body).toHaveProperty("projectStats");
    expect(body).toHaveProperty("insights");
  });

  it("summary has all required keys", async () => {
    const { GET } = await import("../route");
    const res = await GET();
    const { summary } = await res.json();
    expect(summary).toHaveProperty("totalProjects");
    expect(summary).toHaveProperty("activeProjects");
    expect(summary).toHaveProperty("completedProjects");
    expect(summary).toHaveProperty("archivedProjects");
    expect(summary).toHaveProperty("totalMemories");
    expect(summary).toHaveProperty("memoriesPerProject");
    expect(summary).toHaveProperty("successfulOutcomes");
    expect(summary).toHaveProperty("failedOutcomes");
    expect(summary).toHaveProperty("partialOutcomes");
    expect(summary).toHaveProperty("unknownOutcomes");
    expect(summary).toHaveProperty("projectRiskDistribution");
  });

  it("projectRiskDistribution has low/medium/high/unknown keys", async () => {
    const { GET } = await import("../route");
    const res = await GET();
    const { summary } = await res.json();
    const rd = summary.projectRiskDistribution;
    expect(rd).toHaveProperty("low");
    expect(rd).toHaveProperty("medium");
    expect(rd).toHaveProperty("high");
    expect(rd).toHaveProperty("unknown");
  });
});

// ── Empty store ────────────────────────────────────────────────────────────

describe("GET /api/projects/analytics — empty store", () => {
  it("returns 200 with all-zero summary", async () => {
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(200);
    const { summary } = await res.json();
    expect(summary.totalProjects).toBe(0);
    expect(summary.totalMemories).toBe(0);
    expect(summary.successfulOutcomes).toBe(0);
  });

  it("returns empty projectStats and insights arrays", async () => {
    const { GET } = await import("../route");
    const { projectStats, insights } = await (await GET()).json();
    expect(projectStats).toEqual([]);
    expect(insights).toEqual([]);
  });

  it("reports session storageMode", async () => {
    const { GET } = await import("../route");
    const { storageMode } = await (await GET()).json();
    expect(storageMode).toBe("session");
  });
});

// ── Single project ─────────────────────────────────────────────────────────

describe("GET /api/projects/analytics — single project", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__hermesProjects = [
      {
        id: "proj-1", name: "Line 3 Retrofit",
        description: "Kiln drive upgrade", status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [
      {
        id: "m1", query: "VFD fault",   domain: "drives",
        analysisSummary: "check ramp",  confidence: 70,
        relatedCaseIds: [], relatedDocumentIds: [],
        outcome: "success", projectId: "proj-1",
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
      {
        id: "m2", query: "PLC timeout", domain: "plc",
        analysisSummary: "check comm",  confidence: 50,
        relatedCaseIds: [], relatedDocumentIds: [],
        outcome: "failed",  projectId: "proj-1",
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
    ];
  });

  it("summary reflects the single project and its memories", async () => {
    const { GET } = await import("../route");
    const { summary } = await (await GET()).json();
    expect(summary.totalProjects).toBe(1);
    expect(summary.activeProjects).toBe(1);
    expect(summary.totalMemories).toBe(2);
    expect(summary.successfulOutcomes).toBe(1);
    expect(summary.failedOutcomes).toBe(1);
  });

  it("projectStats has one entry with correct outcome counts", async () => {
    const { GET } = await import("../route");
    const { projectStats } = await (await GET()).json();
    expect(projectStats).toHaveLength(1);
    const p = projectStats[0];
    expect(p.projectId).toBe("proj-1");
    expect(p.projectName).toBe("Line 3 Retrofit");
    expect(p.memoryCount).toBe(2);
    expect(p.successCount).toBe(1);
    expect(p.failedCount).toBe(1);
    expect(p.successRate).toBe(50);
    expect(p.failureRate).toBe(50);
  });
});

// ── Multiple projects ──────────────────────────────────────────────────────

describe("GET /api/projects/analytics — multiple projects with mixed outcomes", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__hermesProjects = [
      { id: "p1", name: "Alpha", description: "", status: "active",   createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "p2", name: "Beta",  description: "", status: "archived", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [
      { id: "m1", query: "q1", domain: "drives", analysisSummary: "", confidence: 80, relatedCaseIds: [], relatedDocumentIds: [], outcome: "success", projectId: "p1", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "m2", query: "q2", domain: "drives", analysisSummary: "", confidence: 80, relatedCaseIds: [], relatedDocumentIds: [], outcome: "success", projectId: "p1", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "m3", query: "q3", domain: "plc",    analysisSummary: "", confidence: 40, relatedCaseIds: [], relatedDocumentIds: [], outcome: "failed",  projectId: "p2", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
  });

  it("summary counts statuses and outcomes correctly", async () => {
    const { GET } = await import("../route");
    const { summary } = await (await GET()).json();
    expect(summary.totalProjects).toBe(2);
    expect(summary.activeProjects).toBe(1);
    expect(summary.archivedProjects).toBe(1);
    expect(summary.totalMemories).toBe(3);
    expect(summary.successfulOutcomes).toBe(2);
    expect(summary.failedOutcomes).toBe(1);
  });

  it("insights include highest_memory_activity pointing to the correct project", async () => {
    const { GET } = await import("../route");
    const { insights } = await (await GET()).json();
    const ins = insights.find((i: { type: string }) => i.type === "highest_memory_activity");
    expect(ins).toBeDefined();
    expect(ins.projectId).toBe("p1");
    expect(ins.value).toBe(2);
  });

  it("insights include recurring_pattern for the most-used domain", async () => {
    const { GET } = await import("../route");
    const { insights } = await (await GET()).json();
    const ins = insights.find((i: { type: string }) => i.type === "recurring_pattern");
    expect(ins).toBeDefined();
    expect(ins.value).toBe("drives");
  });
});

// ── Storage failure fallback ───────────────────────────────────────────────

describe("GET /api/projects/analytics — storage failure fallback", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/analytics/analytics-service");
  });

  it("returns 200 with empty analytics when service throws", async () => {
    vi.doMock("@/lib/analytics/analytics-service", () => ({
      getProjectAnalytics: vi.fn().mockRejectedValue(new Error("simulated storage failure")),
    }));
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.totalProjects).toBe(0);
    expect(body.projectStats).toEqual([]);
    expect(body.insights).toEqual([]);
    // Raw error never leaks
    expect(JSON.stringify(body)).not.toContain("simulated storage failure");
  });
});

// ── Backward compatibility ─────────────────────────────────────────────────

describe("GET /api/projects/analytics — backward compatibility", () => {
  it("does not affect GET /api/projects (list) endpoint", async () => {
    (globalThis as Record<string, unknown>).__hermesProjects = [
      { id: "p1", name: "Test", description: "", status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
    const { GET: listGET } = await import("../../route");
    const res = await listGET();
    expect(res.status).toBe(200);
    const { projects } = await res.json();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("Test");
  });
});
