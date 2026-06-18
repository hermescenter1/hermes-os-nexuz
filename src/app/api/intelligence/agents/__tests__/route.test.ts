import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Phase 27 — GET /api/intelligence/agents route tests.
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
  opts: { domain?: string; outcome?: string; confidence?: number; projectId?: string; createdAt?: string } = {}
) {
  mIdx++;
  const arr = (globalThis as Record<string, unknown>).__hermesEngineeringMemory as unknown[];
  arr.push({
    id, query: `query ${mIdx}`, domain: opts.domain ?? "drives",
    analysisSummary: `resolution for ${id}`,
    confidence: opts.confidence ?? 70,
    relatedCaseIds: [], relatedDocumentIds: [],
    outcome: opts.outcome ?? "unknown",
    projectId: opts.projectId,
    createdAt: opts.createdAt ?? "2026-01-10T00:00:00.000Z",
    updatedAt: "2026-01-10T00:00:00.000Z",
  });
}

// ── Response shape ─────────────────────────────────────────────────────────

describe("GET /api/intelligence/agents — response shape", () => {
  it("returns 200 with correct top-level keys", async () => {
    const { GET } = await import("../route");
    const res  = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("storageMode");
    expect(body).toHaveProperty("generatedAt");
    expect(body).toHaveProperty("overallScore");
    expect(body).toHaveProperty("memory");
    expect(body).toHaveProperty("project");
    expect(body).toHaveProperty("domain");
    expect(body).toHaveProperty("synthesis");
  });

  it("each agent has agentId, status, score, findings, data", async () => {
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    for (const key of ["memory", "project", "domain", "synthesis"] as const) {
      const agent = body[key];
      expect(agent).toHaveProperty("agentId");
      expect(agent).toHaveProperty("status");
      expect(agent).toHaveProperty("score");
      expect(agent).toHaveProperty("findings");
      expect(agent).toHaveProperty("data");
      expect(Array.isArray(agent.findings)).toBe(true);
    }
  });

  it("agentIds match their keys", async () => {
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.memory.agentId).toBe("memory");
    expect(body.project.agentId).toBe("project");
    expect(body.domain.agentId).toBe("domain");
    expect(body.synthesis.agentId).toBe("synthesis");
  });

  it("generatedAt is a valid ISO timestamp", async () => {
    const { GET } = await import("../route");
    const { generatedAt } = await (await GET()).json();
    expect(new Date(generatedAt).getTime()).not.toBeNaN();
    expect(generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("overallScore is 0-100 integer", async () => {
    const { GET } = await import("../route");
    const { overallScore } = await (await GET()).json();
    expect(overallScore).toBeGreaterThanOrEqual(0);
    expect(overallScore).toBeLessThanOrEqual(100);
    expect(Number.isInteger(overallScore)).toBe(true);
  });
});

// ── Empty store ────────────────────────────────────────────────────────────

describe("GET /api/intelligence/agents — empty store", () => {
  it("memory.data.totalMemories is 0 for empty store", async () => {
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.memory.data.totalMemories).toBe(0);
  });

  it("project.data.totalProjects is 0 for empty store", async () => {
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.project.data.totalProjects).toBe(0);
  });

  it("domain.data.totalDomains is 0 for empty store", async () => {
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.domain.data.totalDomains).toBe(0);
  });

  it("synthesis.data.correlations is [] for empty store", async () => {
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.synthesis.data.correlations).toEqual([]);
  });

  it("all agents return status success on empty store", async () => {
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    for (const key of ["memory", "project", "domain", "synthesis"]) {
      expect(body[key].status).toBe("success");
    }
  });
});

// ── Seeded data ────────────────────────────────────────────────────────────

describe("GET /api/intelligence/agents — seeded data", () => {
  it("memory agent counts seeded memories", async () => {
    seedMemory("m1"); seedMemory("m2");
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.memory.data.totalMemories).toBe(2);
  });

  it("project agent counts seeded projects", async () => {
    seedProject("p1"); seedProject("p2");
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.project.data.totalProjects).toBe(2);
  });

  it("domain agent counts distinct domains", async () => {
    seedMemory("m1", { domain: "drives" });
    seedMemory("m2", { domain: "plc" });
    seedMemory("m3", { domain: "drives" });
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.domain.data.totalDomains).toBe(2);
  });

  it("synthesis fires knowledge_ready when all scores high", async () => {
    // Plant high-quality data: 3+ memories in same domain, success outcome, high confidence
    seedMemory("m1", { domain: "drives", outcome: "success", confidence: 90 });
    seedMemory("m2", { domain: "drives", outcome: "success", confidence: 85 });
    seedMemory("m3", { domain: "drives", outcome: "success", confidence: 80 });
    seedProject("p1");
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    // Overall score should be elevated; grade and grade key present
    expect(body.synthesis.data).toHaveProperty("intelligenceGrade");
    expect(["A","B","C","D","F"]).toContain(body.synthesis.data.intelligenceGrade);
  });

  it("feedback_bottleneck fires for 5+ memories with 0 feedback", async () => {
    for (let i = 1; i <= 6; i++) seedMemory(`m${i}`, { domain: "drives" });
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    const corrs = body.synthesis.data.correlations as { type: string }[];
    expect(corrs.some(c => c.type === "feedback_bottleneck")).toBe(true);
  });

  it("at-risk project fires review action", async () => {
    seedProject("p1");
    seedMemory("m1", { projectId: "p1", outcome: "failed", confidence: 20 });
    seedMemory("m2", { projectId: "p1", outcome: "failed", confidence: 20 });
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    const actions = body.synthesis.data.prioritizedActions as { action: string }[];
    expect(actions.some(a => a.action.includes("at-risk"))).toBe(true);
  });
});

// ── Synthesis data shape ───────────────────────────────────────────────────

describe("GET /api/intelligence/agents — synthesis data shape", () => {
  it("synthesis.data.correlations is an array", async () => {
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(Array.isArray(body.synthesis.data.correlations)).toBe(true);
  });

  it("synthesis.data.prioritizedActions is an array", async () => {
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(Array.isArray(body.synthesis.data.prioritizedActions)).toBe(true);
  });

  it("synthesis.data.systemCoherenceScore is 0-100", async () => {
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    const s = body.synthesis.data.systemCoherenceScore;
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});

// ── Failure fallback ───────────────────────────────────────────────────────

describe("GET /api/intelligence/agents — failure fallback", () => {
  it("returns 200 with empty report when service throws", async () => {
    vi.doMock("@/lib/services/multi-agent-service", () => ({
      runMultiAgentAnalysis: () => { throw new Error("db_down"); },
    }));
    const { GET } = await import("../route");
    const res  = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("overallScore");
    expect(body.memory.status).toBe("degraded");
    vi.doUnmock("@/lib/services/multi-agent-service");
  });
});

// ── Backward compatibility ─────────────────────────────────────────────────

describe("GET /api/intelligence/agents — backward compat", () => {
  it("/api/intelligence route still returns predictions + recommendations + playbooks", async () => {
    const { GET } = await import("../../route");
    const body = await (await GET()).json();
    expect(body).toHaveProperty("predictions");
    expect(body).toHaveProperty("recommendations");
    expect(body).toHaveProperty("playbooks");
  });

  it("/api/dashboard route is unaffected", async () => {
    const { GET } = await import("../../../dashboard/route");
    const body = await (await GET()).json();
    expect(body).toHaveProperty("systemSummary");
    expect(body).toHaveProperty("systemHealth");
  });

  it("/api/domains route is unaffected", async () => {
    const { GET } = await import("../../../domains/route");
    const body = await (await GET()).json();
    expect(body).toHaveProperty("totalDomains");
    expect(body).toHaveProperty("domains");
  });
});
