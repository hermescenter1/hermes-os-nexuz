import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockEngineer, mockViewer, mockNoUser, unmockAuth } from "@/test/mock-auth";

/**
 * Phase 20B — GET /api/projects/[id]/timeline route tests.
 *
 * All tests run in session mode (no DATABASE_URL).
 * Globals are reset before each test to ensure isolation.
 *
 * Phase 82D.1: this route is authoring-gated (hard 401/403). Tests mock an
 * authoring session by default; the "auth gate" block overrides it.
 */

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL"] as const;
let saved: Record<string, string | undefined>;

function resetGlobals() {
  (globalThis as Record<string, unknown>).__hermesProjects = [];
  (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
  (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
}

function seedProject(id: string, name = "Test Project", createdAt = "2026-01-01T00:00:00.000Z") {
  const projects = (globalThis as Record<string, unknown>).__hermesProjects as object[];
  projects.push({
    id, name,
    description: `${name} description`,
    status: "active",
    createdAt,
    updatedAt: createdAt,
  });
}

function seedMemory(
  id: string,
  projectId: string,
  domain: string,
  outcome = "unknown",
  createdAt = "2026-02-01T00:00:00.000Z"
) {
  const mems = (globalThis as Record<string, unknown>).__hermesEngineeringMemory as object[];
  mems.push({
    id, query: `q-${id}`, domain,
    analysisSummary: `summary for ${domain}`,
    confidence: 70,
    relatedCaseIds: [], relatedDocumentIds: [],
    outcome, projectId,
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
  const fakeParams = Promise.resolve({ id });
  return handler(new Request("http://localhost"), { params: fakeParams });
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

describe("GET /api/projects/[id]/timeline — auth gate", () => {
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

describe("GET /api/projects/[id]/timeline — not found", () => {
  it("returns 404 when project does not exist", async () => {
    const res = await GET("nonexistent-id");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("404 body does not expose raw error messages", async () => {
    const res = await GET("nonexistent-id");
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("stack");
    expect(JSON.stringify(body)).not.toContain("Error");
  });
});

// ── Response shape ─────────────────────────────────────────────────────────

describe("GET /api/projects/[id]/timeline — response shape", () => {
  it("returns 200 with storageMode, project, projectId, timeline, stats", async () => {
    seedProject("p1");
    const res = await GET("p1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("storageMode");
    expect(body).toHaveProperty("project");
    expect(body).toHaveProperty("projectId");
    expect(body).toHaveProperty("timeline");
    expect(body).toHaveProperty("stats");
  });

  it("project field contains expected project properties", async () => {
    seedProject("p1", "Line 3 Retrofit");
    const res = await GET("p1");
    const { project } = await res.json();
    expect(project.id).toBe("p1");
    expect(project.name).toBe("Line 3 Retrofit");
    expect(project).toHaveProperty("status");
    expect(project).toHaveProperty("createdAt");
  });

  it("storageMode is session", async () => {
    seedProject("p1");
    const { storageMode } = await (await GET("p1")).json();
    expect(storageMode).toBe("session");
  });

  it("stats object has all required keys", async () => {
    seedProject("p1");
    const { stats } = await (await GET("p1")).json();
    expect(stats).toHaveProperty("firstActivity");
    expect(stats).toHaveProperty("lastActivity");
    expect(stats).toHaveProperty("totalEvents");
    expect(stats).toHaveProperty("projectAgeDays");
    expect(stats).toHaveProperty("activityTrend");
  });
});

// ── Empty project timeline ─────────────────────────────────────────────────

describe("GET /api/projects/[id]/timeline — empty project", () => {
  it("project with no memories still returns timeline with project_created event", async () => {
    seedProject("p1");
    const { timeline } = await (await GET("p1")).json();
    expect(Array.isArray(timeline)).toBe(true);
    expect(timeline.length).toBeGreaterThanOrEqual(1);
    expect(timeline[0].type).toBe("project_created");
  });

  it("stats.totalEvents >= 1 for a project with only project_created", async () => {
    seedProject("p1");
    const { stats } = await (await GET("p1")).json();
    expect(stats.totalEvents).toBeGreaterThanOrEqual(1);
  });

  it("stats.firstActivity equals the project_created timestamp", async () => {
    seedProject("p1", "Alpha", "2026-01-15T00:00:00.000Z");
    const { stats, timeline } = await (await GET("p1")).json();
    expect(stats.firstActivity).toBe(timeline[0].timestamp);
  });
});

// ── Memory events ───────────────────────────────────────────────────────────

describe("GET /api/projects/[id]/timeline — memory_created events", () => {
  it("emits a memory_created event for each tagged memory", async () => {
    seedProject("p1");
    seedMemory("m1", "p1", "drives");
    seedMemory("m2", "p1", "plc");
    const { timeline } = await (await GET("p1")).json();
    const memEvents = timeline.filter((e: { type: string }) => e.type === "memory_created");
    expect(memEvents).toHaveLength(2);
  });

  it("does not emit events for memories tagged to a different project", async () => {
    seedProject("p1");
    seedProject("p2");
    seedMemory("m1", "p2", "drives");   // belongs to p2, not p1
    const { timeline } = await (await GET("p1")).json();
    const memEvents = timeline.filter((e: { type: string }) => e.type === "memory_created");
    expect(memEvents).toHaveLength(0);
  });

  it("memory_created event has non-empty title and details", async () => {
    seedProject("p1");
    seedMemory("m1", "p1", "drives");
    const { timeline } = await (await GET("p1")).json();
    const evt = timeline.find((e: { type: string }) => e.type === "memory_created")!;
    expect(evt.title.length).toBeGreaterThan(0);
    expect(evt.details.length).toBeGreaterThan(0);
  });

  it("memory_created event carries the correct timestamp", async () => {
    seedProject("p1");
    seedMemory("m1", "p1", "sensors", "unknown", "2026-04-10T08:00:00.000Z");
    const { timeline } = await (await GET("p1")).json();
    const evt = timeline.find((e: { type: string }) => e.type === "memory_created")!;
    expect(evt.timestamp).toBe("2026-04-10T08:00:00.000Z");
  });
});

// ── Feedback / outcome events ───────────────────────────────────────────────

describe("GET /api/projects/[id]/timeline — outcome events from feedback", () => {
  it("success feedback → outcome_resolved event in timeline", async () => {
    seedProject("p1");
    seedMemory("m1", "p1", "drives");
    seedFeedback("f1", "m1", "success", "2026-03-01T00:00:00.000Z");
    const { timeline } = await (await GET("p1")).json();
    const evt = timeline.find((e: { type: string }) => e.type === "outcome_resolved");
    expect(evt).toBeDefined();
    expect(evt.timestamp).toBe("2026-03-01T00:00:00.000Z");
  });

  it("failed feedback → outcome_failed event in timeline", async () => {
    seedProject("p1");
    seedMemory("m1", "p1", "plc");
    seedFeedback("f1", "m1", "failed");
    const { timeline } = await (await GET("p1")).json();
    expect(timeline.some((e: { type: string }) => e.type === "outcome_failed")).toBe(true);
  });

  it("partial feedback → outcome_partial event in timeline", async () => {
    seedProject("p1");
    seedMemory("m1", "p1", "motors");
    seedFeedback("f1", "m1", "partial");
    const { timeline } = await (await GET("p1")).json();
    expect(timeline.some((e: { type: string }) => e.type === "outcome_partial")).toBe(true);
  });

  it("unknown feedback → feedback_added event in timeline", async () => {
    seedProject("p1");
    seedMemory("m1", "p1", "sensors");
    seedFeedback("f1", "m1", "unknown");
    const { timeline } = await (await GET("p1")).json();
    expect(timeline.some((e: { type: string }) => e.type === "feedback_added")).toBe(true);
  });
});

// ── Chronological ordering ──────────────────────────────────────────────────

describe("GET /api/projects/[id]/timeline — chronological ordering", () => {
  it("timeline events are ordered by timestamp ascending", async () => {
    seedProject("p1", "P", "2026-01-01T00:00:00.000Z");
    seedMemory("m1", "p1", "drives", "unknown", "2026-03-01T00:00:00.000Z");
    seedMemory("m2", "p1", "plc",    "unknown", "2026-02-01T00:00:00.000Z");
    seedFeedback("f1", "m1", "success", "2026-04-01T00:00:00.000Z");
    const { timeline } = await (await GET("p1")).json();
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].timestamp >= timeline[i - 1].timestamp).toBe(true);
    }
  });

  it("project_created is always the first event", async () => {
    seedProject("p1");
    seedMemory("m1", "p1", "drives");
    const { timeline } = await (await GET("p1")).json();
    expect(timeline[0].type).toBe("project_created");
  });
});

// ── Storage failure fallback ───────────────────────────────────────────────

describe("GET /api/projects/[id]/timeline — storage failure fallback", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/analytics/timeline-service");
  });

  it("returns 404 when timeline service throws unexpectedly", async () => {
    vi.doMock("@/lib/analytics/timeline-service", () => ({
      getProjectTimeline: vi.fn().mockRejectedValue(new Error("unexpected storage crash")),
    }));
    const { GET: handler } = await import("../route");
    const res = await handler(new Request("http://localhost"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    // Internal error message must never leak
    expect(JSON.stringify(body)).not.toContain("unexpected storage crash");
  });
});

// ── Backward compatibility ─────────────────────────────────────────────────

describe("GET /api/projects/[id]/timeline — backward compatibility", () => {
  it("does not affect GET /api/projects/[id] (single project endpoint)", async () => {
    seedProject("p1", "Backward Compat Project");
    const { GET: idHandler } = await import("../../route");
    const res = await idHandler(new Request("http://localhost"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(200);
    const { project } = await res.json();
    expect(project.name).toBe("Backward Compat Project");
  });

  it("does not affect GET /api/projects (list endpoint)", async () => {
    seedProject("p1", "Alpha");
    seedProject("p2", "Beta");
    const { GET: listHandler } = await import("../../../route");
    const res = await listHandler();
    expect(res.status).toBe(200);
    const { projects } = await res.json();
    expect(projects).toHaveLength(2);
  });
});
