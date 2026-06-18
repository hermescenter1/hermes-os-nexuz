import { describe, it, expect } from "vitest";
import { computeSynthesisAgent } from "../synthesis-agent";
import type { MemoryAgentResult }  from "../memory-agent";
import type { ProjectAgentResult } from "../project-agent";
import type { DomainAgentResult }  from "../domain-agent";

// ── Factories ──────────────────────────────────────────────────────────────

function memoryResult(overrides: Partial<MemoryAgentResult["data"]> = {}, score = 70): MemoryAgentResult {
  return {
    agentId: "memory", score, findings: [],
    data: {
      totalMemories: 10, qualityScore: 70, feedbackCompleteness: 50,
      successRate: 40, coverageGaps: [], learningVelocity: "stable", ...overrides,
    },
  };
}

function projectResult(overrides: Partial<ProjectAgentResult["data"]> = {}, score = 70): ProjectAgentResult {
  return {
    agentId: "project", score, findings: [],
    data: {
      totalProjects: 3, portfolioScore: 70, atRiskCount: 0,
      memoryCoverage: 80, riskConcentration: 0, ...overrides,
    },
  };
}

function domainResult(overrides: Partial<DomainAgentResult["data"]> = {}, score = 70): DomainAgentResult {
  return {
    agentId: "domain", score, findings: [],
    data: {
      totalDomains: 4, expertiseBreadth: 60, expertiseDepth: 70,
      emergingDomains: [], criticalGaps: [], ...overrides,
    },
  };
}

// ── Basic shape ────────────────────────────────────────────────────────────

describe("computeSynthesisAgent — basic shape", () => {
  it("returns agentId synthesis", () => {
    const r = computeSynthesisAgent(memoryResult(), projectResult(), domainResult(), 70);
    expect(r.agentId).toBe("synthesis");
  });

  it("score equals systemCoherenceScore", () => {
    const r = computeSynthesisAgent(memoryResult(), projectResult(), domainResult(), 70);
    expect(r.score).toBe(r.data.systemCoherenceScore);
  });

  it("data has required keys", () => {
    const { data } = computeSynthesisAgent(memoryResult(), projectResult(), domainResult(), 70);
    expect(data).toHaveProperty("systemCoherenceScore");
    expect(data).toHaveProperty("correlations");
    expect(data).toHaveProperty("prioritizedActions");
    expect(data).toHaveProperty("intelligenceGrade");
  });
});

// ── System coherence ───────────────────────────────────────────────────────

describe("computeSynthesisAgent — system coherence", () => {
  it("coherence is 100 when all scores are equal", () => {
    const r = computeSynthesisAgent(memoryResult({}, 70), projectResult({}, 70), domainResult({}, 70), 70);
    expect(r.data.systemCoherenceScore).toBe(100);
  });

  it("coherence is lower when scores diverge", () => {
    const r = computeSynthesisAgent(memoryResult({}, 100), projectResult({}, 0), domainResult({}, 50), 50);
    expect(r.data.systemCoherenceScore).toBeLessThan(100);
  });

  it("coherence never goes below 0", () => {
    const r = computeSynthesisAgent(memoryResult({}, 100), projectResult({}, 0), domainResult({}, 0), 0);
    expect(r.data.systemCoherenceScore).toBeGreaterThanOrEqual(0);
  });
});

// ── Intelligence grade ─────────────────────────────────────────────────────

describe("computeSynthesisAgent — intelligence grade", () => {
  it.each([
    [80, "A"], [79, "B"], [65, "B"], [64, "C"], [50, "C"],
    [49, "D"], [35, "D"], [34, "F"], [0, "F"],
  ])("overallScore %i → grade %s", (score, grade) => {
    const r = computeSynthesisAgent(memoryResult(), projectResult(), domainResult(), score);
    expect(r.data.intelligenceGrade).toBe(grade);
  });

  it("grade appears in findings", () => {
    const r = computeSynthesisAgent(memoryResult(), projectResult(), domainResult(), 70);
    expect(r.findings[0]).toMatch(/grade/i);
  });
});

// ── Correlations ───────────────────────────────────────────────────────────

describe("computeSynthesisAgent — correlations", () => {
  it("knowledge_ready fires when all scores >= 70", () => {
    const { data } = computeSynthesisAgent(memoryResult({}, 70), projectResult({}, 70), domainResult({}, 70), 70);
    expect(data.correlations.some(c => c.type === "knowledge_ready")).toBe(true);
  });

  it("low_memory_high_risk fires for at-risk projects + low coverage", () => {
    const pResult = projectResult({ atRiskCount: 2, memoryCoverage: 30 }, 40);
    const { data } = computeSynthesisAgent(memoryResult(), pResult, domainResult(), 60);
    expect(data.correlations.some(c => c.type === "low_memory_high_risk")).toBe(true);
  });

  it("domain_gap_risk fires for critical gaps + at-risk projects", () => {
    const pResult = projectResult({ atRiskCount: 1 }, 60);
    const dResult = domainResult({ criticalGaps: ["plc"] }, 60);
    const { data } = computeSynthesisAgent(memoryResult(), pResult, dResult, 60);
    expect(data.correlations.some(c => c.type === "domain_gap_risk")).toBe(true);
  });

  it("feedback_bottleneck fires for many memories + low feedback", () => {
    const mResult = memoryResult({ totalMemories: 10, feedbackCompleteness: 10 }, 40);
    const { data } = computeSynthesisAgent(mResult, projectResult(), domainResult(), 60);
    expect(data.correlations.some(c => c.type === "feedback_bottleneck")).toBe(true);
  });

  it("expertise_concentration fires for >= 3 domains + low breadth", () => {
    const dResult = domainResult({ totalDomains: 4, expertiseBreadth: 20 }, 30);
    const { data } = computeSynthesisAgent(memoryResult(), projectResult(), dResult, 60);
    expect(data.correlations.some(c => c.type === "expertise_concentration")).toBe(true);
  });

  it("correlations are sorted critical → warning → info", () => {
    const pResult = projectResult({ atRiskCount: 2, memoryCoverage: 30 }, 40);
    const mResult = memoryResult({ totalMemories: 10, feedbackCompleteness: 10 }, 40);
    const { data } = computeSynthesisAgent(mResult, pResult, domainResult(), 40);
    const sevs = data.correlations.map(c => c.severity);
    const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    for (let i = 1; i < sevs.length; i++) {
      expect(order[sevs[i]]).toBeGreaterThanOrEqual(order[sevs[i - 1]]);
    }
  });
});

// ── Prioritized actions ────────────────────────────────────────────────────

describe("computeSynthesisAgent — prioritized actions", () => {
  it("no actions for pristine system", () => {
    const mResult = memoryResult({ feedbackCompleteness: 80, coverageGaps: [], learningVelocity: "stable", totalMemories: 0 }, 90);
    const pResult = projectResult({ atRiskCount: 0, memoryCoverage: 100, totalProjects: 2 }, 90);
    const dResult = domainResult({ criticalGaps: [] }, 90);
    const { data } = computeSynthesisAgent(mResult, pResult, dResult, 90);
    expect(data.prioritizedActions.length).toBe(0);
  });

  it("at-risk projects fires high-impact action", () => {
    const pResult = projectResult({ atRiskCount: 1 }, 50);
    const { data } = computeSynthesisAgent(memoryResult(), pResult, domainResult(), 60);
    const action = data.prioritizedActions.find(a => a.impact === "high");
    expect(action).toBeDefined();
    expect(action?.agents).toContain("project");
  });

  it("actions have sequential ranks starting at 1", () => {
    const pResult = projectResult({ atRiskCount: 1, memoryCoverage: 40 }, 50);
    const mResult = memoryResult({ feedbackCompleteness: 10, totalMemories: 8 }, 50);
    const { data } = computeSynthesisAgent(mResult, pResult, domainResult(), 50);
    data.prioritizedActions.forEach((a, i) => {
      expect(a.rank).toBe(i + 1);
    });
  });

  it("at most 5 prioritized actions returned", () => {
    const mResult = memoryResult({ feedbackCompleteness: 10, totalMemories: 8, coverageGaps: ["a", "b"], learningVelocity: "decelerating" }, 30);
    const pResult = projectResult({ atRiskCount: 2, memoryCoverage: 30, totalProjects: 3 }, 30);
    const dResult = domainResult({ criticalGaps: ["c"] }, 30);
    const { data } = computeSynthesisAgent(mResult, pResult, dResult, 30);
    expect(data.prioritizedActions.length).toBeLessThanOrEqual(5);
  });
});

// ── Determinism ────────────────────────────────────────────────────────────

describe("computeSynthesisAgent — determinism", () => {
  it("same input produces identical output", () => {
    const r1 = computeSynthesisAgent(memoryResult(), projectResult(), domainResult(), 70);
    const r2 = computeSynthesisAgent(memoryResult(), projectResult(), domainResult(), 70);
    expect(r1).toEqual(r2);
  });
});
