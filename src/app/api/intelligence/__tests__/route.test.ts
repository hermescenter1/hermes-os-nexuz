import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Phase 26 — GET /api/intelligence route tests.
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
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────

function seedProject(id: string, name = `Project ${id}`) {
  const arr = (globalThis as Record<string, unknown>).__hermesProjects as unknown[];
  arr.push({ id, name, description: "", status: "active",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
}

let mIdx = 0;
function seedMemory(
  id: string,
  opts: { domain?: string; outcome?: string; confidence?: number; projectId?: string } = {}
) {
  mIdx++;
  const arr = (globalThis as Record<string, unknown>).__hermesEngineeringMemory as unknown[];
  arr.push({
    id, query: `query ${mIdx}`,
    domain:          opts.domain      ?? "drives",
    analysisSummary: `resolution step for ${id}`,
    confidence:      opts.confidence  ?? 70,
    relatedCaseIds: [], relatedDocumentIds: [],
    outcome:         opts.outcome     ?? "unknown",
    projectId:       opts.projectId,
    createdAt: "2026-01-10T00:00:00.000Z", updatedAt: "2026-01-10T00:00:00.000Z",
  });
}

// ── Response shape ─────────────────────────────────────────────────────────

describe("GET /api/intelligence — response shape", () => {
  it("returns 200 with correct top-level keys", async () => {
    const { GET } = await import("../route");
    const res  = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("storageMode");
    expect(body).toHaveProperty("generatedAt");
    expect(body).toHaveProperty("predictions");
    expect(body).toHaveProperty("recommendations");
    expect(body).toHaveProperty("playbooks");
  });

  it("predictions has predictions[] and summary", async () => {
    const { GET } = await import("../route");
    const { predictions } = await (await GET()).json();
    expect(Array.isArray(predictions.predictions)).toBe(true);
    expect(predictions.summary).toHaveProperty("totalProjects");
    expect(predictions.summary).toHaveProperty("criticalCount");
    expect(predictions.summary).toHaveProperty("highCount");
    expect(predictions.summary).toHaveProperty("avgFailureScore");
    expect(predictions.summary).toHaveProperty("topRiskProject");
  });

  it("recommendations has recommendations[] and totalCount", async () => {
    const { GET } = await import("../route");
    const { recommendations } = await (await GET()).json();
    expect(Array.isArray(recommendations.recommendations)).toBe(true);
    expect(recommendations).toHaveProperty("totalCount");
  });

  it("playbooks has playbooks[] and totalCount", async () => {
    const { GET } = await import("../route");
    const { playbooks } = await (await GET()).json();
    expect(Array.isArray(playbooks.playbooks)).toBe(true);
    expect(playbooks).toHaveProperty("totalCount");
  });

  it("generatedAt is a valid ISO timestamp", async () => {
    const { GET } = await import("../route");
    const { generatedAt } = await (await GET()).json();
    expect(new Date(generatedAt).getTime()).not.toBeNaN();
    expect(generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ── Empty store ────────────────────────────────────────────────────────────

describe("GET /api/intelligence — empty store", () => {
  it("predictions is empty for empty store", async () => {
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.predictions.predictions).toHaveLength(0);
    expect(body.predictions.summary.totalProjects).toBe(0);
  });

  it("recommendations is empty for empty store", async () => {
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.recommendations.totalCount).toBe(0);
  });

  it("playbooks is empty for empty store", async () => {
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.playbooks.totalCount).toBe(0);
  });
});

// ── Seeded data ────────────────────────────────────────────────────────────

describe("GET /api/intelligence — seeded data", () => {
  it("predictions include seeded projects", async () => {
    seedProject("p1");
    seedProject("p2");
    const { GET } = await import("../route");
    const { predictions } = await (await GET()).json();
    expect(predictions.summary.totalProjects).toBe(2);
  });

  it("review_failures recommendation fires for failed memory", async () => {
    seedMemory("m1", { outcome: "failed" });
    const { GET } = await import("../route");
    const { recommendations } = await (await GET()).json();
    expect(recommendations.recommendations.some(
      (r: { type: string }) => r.type === "review_failures"
    )).toBe(true);
  });

  it("expand_domain fires for domain with < 3 memories", async () => {
    seedMemory("m1", { domain: "hydraulics" });
    const { GET } = await import("../route");
    const { recommendations } = await (await GET()).json();
    expect(recommendations.recommendations.some(
      (r: { type: string }) => r.type === "expand_domain"
    )).toBe(true);
  });

  it("playbook generated for domain with >= 2 high-confidence success memories", async () => {
    seedMemory("m1", { outcome: "success", confidence: 80 });
    seedMemory("m2", { outcome: "success", confidence: 80 });
    const { GET } = await import("../route");
    const { playbooks } = await (await GET()).json();
    expect(playbooks.totalCount).toBe(1);
    expect(playbooks.playbooks[0].domain).toBe("drives");
  });

  it("critical project prediction fires for high-failure project", async () => {
    seedProject("p1");
    seedMemory("m1", { projectId: "p1", outcome: "failed", confidence: 40 });
    seedMemory("m2", { projectId: "p1", outcome: "failed", confidence: 40 });
    const { GET } = await import("../route");
    const { predictions } = await (await GET()).json();
    expect(predictions.predictions[0].riskLevel).toBe("critical");
    expect(predictions.summary.criticalCount).toBe(1);
  });

  it("link_to_project fires for memory without projectId", async () => {
    seedMemory("m1");  // no projectId
    const { GET } = await import("../route");
    const { recommendations } = await (await GET()).json();
    expect(recommendations.recommendations.some(
      (r: { type: string }) => r.type === "link_to_project"
    )).toBe(true);
  });
});

// ── Failure fallback ───────────────────────────────────────────────────────

describe("GET /api/intelligence — failure fallback", () => {
  it("returns 200 with empty intelligence when service throws", async () => {
    vi.doMock("@/lib/services/intelligence-service", () => ({
      getIntelligence: () => { throw new Error("db_down"); },
    }));
    const { GET } = await import("../route");
    const res  = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.predictions.predictions).toEqual([]);
    expect(body.predictions.summary.totalProjects).toBe(0);
    expect(body.recommendations.totalCount).toBe(0);
    expect(body.playbooks.totalCount).toBe(0);
    vi.doUnmock("@/lib/services/intelligence-service");
  });
});

// ── Backward compatibility ─────────────────────────────────────────────────

describe("GET /api/intelligence — backward compat", () => {
  it("dashboard route unaffected", async () => {
    const { GET } = await import("../../dashboard/route");
    const body = await (await GET()).json();
    expect(body).toHaveProperty("systemSummary");
    expect(body).toHaveProperty("systemHealth");
  });

  it("domains route unaffected", async () => {
    const { GET } = await import("../../domains/route");
    const body = await (await GET()).json();
    expect(body).toHaveProperty("totalDomains");
    expect(body).toHaveProperty("domains");
  });

  it("knowledge-graph/analytics route unaffected", async () => {
    const { GET } = await import("../../knowledge-graph/analytics/route");
    const body = await (await GET()).json();
    expect(body).toHaveProperty("centrality");
    expect(body).toHaveProperty("health");
  });
});
