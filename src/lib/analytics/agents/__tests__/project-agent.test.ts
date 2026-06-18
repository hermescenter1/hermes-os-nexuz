import { describe, it, expect } from "vitest";
import { computeProjectAgent } from "../project-agent";
import type { StoredProject, StoredMemory, StoredMemoryFeedback } from "@/lib/storage/types";

// ── Factories ──────────────────────────────────────────────────────────────

function proj(id: string): StoredProject {
  return { id, name: `Project ${id}`, description: "", status: "active",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
}

function mem(id: string, opts: Partial<StoredMemory> = {}): StoredMemory {
  return {
    id, query: `q-${id}`, domain: "drives", analysisSummary: `s-${id}`,
    confidence: 70, relatedCaseIds: [], relatedDocumentIds: [],
    outcome: "unknown", projectId: undefined,
    createdAt: "2026-01-10T00:00:00.000Z", updatedAt: "2026-01-10T00:00:00.000Z",
    ...opts,
  };
}

function fbMap(...ids: string[]): Map<string, StoredMemoryFeedback[]> {
  return new Map(ids.map(id => [id, [
    { id: `f-${id}`, memoryId: id, feedback: "ok", outcome: "success", createdAt: "2026-01-15T00:00:00.000Z" },
  ]]));
}

const emptyFb = new Map<string, StoredMemoryFeedback[]>();

// ── Empty portfolio ────────────────────────────────────────────────────────

describe("computeProjectAgent — empty portfolio", () => {
  it("returns agentId project and score 0", () => {
    const r = computeProjectAgent([], [], emptyFb);
    expect(r.agentId).toBe("project");
    expect(r.score).toBe(0);
  });

  it("returns no-projects finding", () => {
    const r = computeProjectAgent([], [], emptyFb);
    expect(r.findings).toContain("No projects found");
  });

  it("all data fields are zero", () => {
    const { data } = computeProjectAgent([], [], emptyFb);
    expect(data.totalProjects).toBe(0);
    expect(data.portfolioScore).toBe(0);
    expect(data.atRiskCount).toBe(0);
    expect(data.memoryCoverage).toBe(0);
    expect(data.riskConcentration).toBe(0);
  });
});

// ── Portfolio score ────────────────────────────────────────────────────────

describe("computeProjectAgent — portfolio score", () => {
  it("projects with no memories score 0 failure → portfolioScore 100", () => {
    const { data } = computeProjectAgent([proj("p1"), proj("p2")], [], emptyFb);
    expect(data.portfolioScore).toBe(100);
  });

  it("atRiskCount increments for projects with high failure rate", () => {
    const mems = [
      mem("m1", { projectId: "p1", outcome: "failed", confidence: 40 }),
      mem("m2", { projectId: "p1", outcome: "failed", confidence: 40 }),
    ];
    const { data } = computeProjectAgent([proj("p1")], mems, emptyFb);
    expect(data.atRiskCount).toBe(1);
  });

  it("at-risk finding reported", () => {
    const mems = [
      mem("m1", { projectId: "p1", outcome: "failed", confidence: 30 }),
      mem("m2", { projectId: "p1", outcome: "failed", confidence: 30 }),
    ];
    const { findings } = computeProjectAgent([proj("p1")], mems, emptyFb);
    expect(findings).toContain("1 project(s) at elevated risk");
  });
});

// ── Memory coverage ────────────────────────────────────────────────────────

describe("computeProjectAgent — memory coverage", () => {
  it("memoryCoverage 100% when all projects have memories", () => {
    const mems = [
      mem("m1", { projectId: "p1" }),
      mem("m2", { projectId: "p2" }),
    ];
    const { data } = computeProjectAgent([proj("p1"), proj("p2")], mems, emptyFb);
    expect(data.memoryCoverage).toBe(100);
  });

  it("memoryCoverage 0% when no project has memory", () => {
    const { data } = computeProjectAgent([proj("p1"), proj("p2")], [], emptyFb);
    expect(data.memoryCoverage).toBe(0);
  });

  it("many projects lack memories triggers finding", () => {
    const { findings } = computeProjectAgent([proj("p1"), proj("p2")], [], emptyFb);
    expect(findings).toContain("Many projects lack engineering memories");
  });
});

// ── Risk concentration ─────────────────────────────────────────────────────

describe("computeProjectAgent — risk concentration", () => {
  it("riskConcentration 0 when no at-risk projects", () => {
    const { data } = computeProjectAgent([proj("p1")], [], emptyFb);
    expect(data.riskConcentration).toBe(0);
  });

  it("riskConcentration > 0 when at-risk project exists", () => {
    const mems = [
      mem("m1", { projectId: "p1", outcome: "failed", confidence: 20 }),
      mem("m2", { projectId: "p1", outcome: "failed", confidence: 20 }),
    ];
    const { data } = computeProjectAgent([proj("p1")], mems, emptyFb);
    expect(data.riskConcentration).toBeGreaterThan(0);
  });
});

// ── Portfolio health findings ──────────────────────────────────────────────

describe("computeProjectAgent — health findings", () => {
  it("strong health finding for low-risk portfolio", () => {
    const mems = [
      mem("m1", { projectId: "p1", outcome: "success", confidence: 90 }),
      mem("m2", { projectId: "p1", outcome: "success", confidence: 90 }),
    ];
    const fbm = fbMap("m1", "m2");
    const { findings } = computeProjectAgent([proj("p1")], mems, fbm);
    expect(findings).toContain("Portfolio health is strong");
  });

  it("no at-risk finding when portfolio is clean", () => {
    const { findings } = computeProjectAgent([proj("p1")], [], emptyFb);
    expect(findings).toContain("No projects at elevated risk");
  });
});

// ── Score bounds ───────────────────────────────────────────────────────────

describe("computeProjectAgent — score bounds", () => {
  it("score is always 0-100", () => {
    const mems = [mem("m1", { projectId: "p1", outcome: "failed", confidence: 0 })];
    const { score } = computeProjectAgent([proj("p1")], mems, emptyFb);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ── Determinism ────────────────────────────────────────────────────────────

describe("computeProjectAgent — determinism", () => {
  it("same input produces identical output", () => {
    const mems = [mem("m1", { projectId: "p1" })];
    const r1 = computeProjectAgent([proj("p1")], mems, emptyFb);
    const r2 = computeProjectAgent([proj("p1")], mems, emptyFb);
    expect(r1).toEqual(r2);
  });
});
