import { describe, it, expect } from "vitest";
import { computeProjectAnalytics } from "../project-analytics";
import type { StoredProject, StoredMemory, MemoryOutcome, ProjectStatus } from "@/lib/storage/types";

/**
 * Phase 20A — Analytics engine unit tests.
 *
 * All tests call the pure `computeProjectAnalytics` function directly —
 * no I/O, no mocking, no module state.
 */

// ── Test factories ─────────────────────────────────────────────────────────

function proj(
  id: string,
  name: string,
  status: ProjectStatus = "active"
): StoredProject {
  return {
    id, name,
    description: `${name} description`,
    status,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

let memIdx = 0;
function mem(
  projectId: string | undefined,
  domain: string,
  outcome: MemoryOutcome,
  confidence = 60
): StoredMemory {
  return {
    id: `m${++memIdx}`,
    query: "test query",
    domain,
    analysisSummary: "test summary",
    confidence,
    relatedCaseIds: [],
    relatedDocumentIds: [],
    outcome,
    projectId,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

// ── Empty store ────────────────────────────────────────────────────────────

describe("computeProjectAnalytics — empty store", () => {
  it("returns all-zero summary for no projects and no memories", () => {
    const { summary, projectStats, insights } = computeProjectAnalytics([], []);
    expect(summary.totalProjects).toBe(0);
    expect(summary.activeProjects).toBe(0);
    expect(summary.totalMemories).toBe(0);
    expect(summary.memoriesPerProject).toBe(0);
    expect(summary.successfulOutcomes).toBe(0);
    expect(summary.failedOutcomes).toBe(0);
    expect(summary.partialOutcomes).toBe(0);
    expect(summary.unknownOutcomes).toBe(0);
    expect(summary.projectRiskDistribution).toEqual({ low: 0, medium: 0, high: 0, unknown: 0 });
    expect(projectStats).toEqual([]);
    expect(insights).toEqual([]);
  });

  it("handles memories with no projects gracefully", () => {
    const memories = [mem(undefined, "drives", "success"), mem(undefined, "plc", "failed")];
    const { summary } = computeProjectAnalytics([], memories);
    expect(summary.totalMemories).toBe(2);
    expect(summary.successfulOutcomes).toBe(1);
    expect(summary.failedOutcomes).toBe(1);
    // memoriesPerProject is 0 when no projects
    expect(summary.memoriesPerProject).toBe(0);
  });
});

// ── Single project ─────────────────────────────────────────────────────────

describe("computeProjectAnalytics — single project", () => {
  it("project with no memories has zero stats and unknown risk", () => {
    const { projectStats } = computeProjectAnalytics([proj("p1", "Alpha")], []);
    expect(projectStats).toHaveLength(1);
    const p = projectStats[0];
    expect(p.memoryCount).toBe(0);
    expect(p.successRate).toBe(0);
    expect(p.failureRate).toBe(0);
    expect(p.avgConfidence).toBe(0);
    expect(p.topDomains).toEqual([]);
    expect(p.riskLevel).toBe("unknown");
  });

  it("project fields are mapped correctly", () => {
    const { projectStats } = computeProjectAnalytics([proj("p1", "Alpha", "completed")], []);
    const p = projectStats[0];
    expect(p.projectId).toBe("p1");
    expect(p.projectName).toBe("Alpha");
    expect(p.status).toBe("completed");
  });

  it("counts outcomes correctly for a single project", () => {
    const memories = [
      mem("p1", "drives", "success", 80),
      mem("p1", "drives", "success", 90),
      mem("p1", "plc",    "failed",  30),
      mem("p1", "motors", "partial", 50),
      mem("p1", "scada",  "unknown", 40),
    ];
    const { projectStats } = computeProjectAnalytics([proj("p1", "Alpha")], memories);
    const p = projectStats[0];
    expect(p.memoryCount).toBe(5);
    expect(p.successCount).toBe(2);
    expect(p.failedCount).toBe(1);
    expect(p.partialCount).toBe(1);
    expect(p.unknownCount).toBe(1);
  });

  it("calculates success and failure rates as integer percentages", () => {
    const memories = [
      mem("p1", "drives", "success"),
      mem("p1", "drives", "success"),
      mem("p1", "drives", "failed"),
      mem("p1", "drives", "failed"),
    ];
    const { projectStats } = computeProjectAnalytics([proj("p1", "Alpha")], memories);
    expect(projectStats[0].successRate).toBe(50);
    expect(projectStats[0].failureRate).toBe(50);
  });

  it("rounds success rate correctly (3 of 4 = 75%)", () => {
    const memories = [
      mem("p1", "drives", "success"),
      mem("p1", "drives", "success"),
      mem("p1", "drives", "success"),
      mem("p1", "drives", "failed"),
    ];
    const { projectStats } = computeProjectAnalytics([proj("p1", "Alpha")], memories);
    expect(projectStats[0].successRate).toBe(75);
  });

  it("calculates avgConfidence correctly", () => {
    const memories = [
      mem("p1", "drives", "success", 80),
      mem("p1", "drives", "success", 60),
    ];
    const { projectStats } = computeProjectAnalytics([proj("p1", "Alpha")], memories);
    expect(projectStats[0].avgConfidence).toBe(70);
  });

  it("topDomains returns up to 3 most-used domains, most frequent first", () => {
    const memories = [
      mem("p1", "drives",  "success"),
      mem("p1", "drives",  "success"),
      mem("p1", "drives",  "success"),
      mem("p1", "plc",     "success"),
      mem("p1", "plc",     "success"),
      mem("p1", "sensors", "success"),
    ];
    const { projectStats } = computeProjectAnalytics([proj("p1", "Alpha")], memories);
    expect(projectStats[0].topDomains[0]).toBe("drives");
    expect(projectStats[0].topDomains[1]).toBe("plc");
    expect(projectStats[0].topDomains[2]).toBe("sensors");
  });
});

// ── Risk level ─────────────────────────────────────────────────────────────

describe("computeProjectAnalytics — risk level", () => {
  it("high risk: failureRate > 50", () => {
    const memories = [
      mem("p1", "drives", "failed"),
      mem("p1", "drives", "failed"),
      mem("p1", "drives", "failed"),
      mem("p1", "drives", "success"),
    ];
    const { projectStats } = computeProjectAnalytics([proj("p1", "Alpha")], memories);
    // 75% failure rate → high
    expect(projectStats[0].riskLevel).toBe("high");
  });

  it("medium risk: failureRate > 20", () => {
    // 1 fail in 4 = 25% failure → medium
    const memories = [
      mem("p1", "drives", "failed"),
      mem("p1", "drives", "success"),
      mem("p1", "drives", "success"),
      mem("p1", "drives", "success"),
    ];
    const { projectStats } = computeProjectAnalytics([proj("p1", "Alpha")], memories);
    expect(projectStats[0].riskLevel).toBe("medium");
  });

  it("low risk: successRate >= 60 and failureRate <= 20", () => {
    // 3 of 4 success = 75%, 1 of 4 failure = 25% → medium wins
    // Let's use 0 failures, 3/4 success → 75% success, 0% failure → low
    const memories = [
      mem("p1", "drives", "success"),
      mem("p1", "drives", "success"),
      mem("p1", "drives", "success"),
      mem("p1", "drives", "unknown"),
    ];
    const { projectStats } = computeProjectAnalytics([proj("p1", "Alpha")], memories);
    expect(projectStats[0].successRate).toBe(75);
    expect(projectStats[0].failureRate).toBe(0);
    expect(projectStats[0].riskLevel).toBe("low");
  });

  it("unknown risk: no memories", () => {
    const { projectStats } = computeProjectAnalytics([proj("p1", "Alpha")], []);
    expect(projectStats[0].riskLevel).toBe("unknown");
  });

  it("unknown risk: all unknown outcomes, no success/failure signal", () => {
    const memories = [mem("p1", "drives", "unknown"), mem("p1", "drives", "unknown")];
    const { projectStats } = computeProjectAnalytics([proj("p1", "Alpha")], memories);
    // 0% success, 0% failure — not enough signal
    expect(projectStats[0].riskLevel).toBe("unknown");
  });
});

// ── Multiple projects ──────────────────────────────────────────────────────

describe("computeProjectAnalytics — multiple projects", () => {
  it("counts project statuses correctly in the summary", () => {
    const projects = [
      proj("p1", "A", "active"),
      proj("p2", "B", "active"),
      proj("p3", "C", "completed"),
      proj("p4", "D", "archived"),
    ];
    const { summary } = computeProjectAnalytics(projects, []);
    expect(summary.totalProjects).toBe(4);
    expect(summary.activeProjects).toBe(2);
    expect(summary.completedProjects).toBe(1);
    expect(summary.archivedProjects).toBe(1);
  });

  it("memories are correctly assigned to their respective projects", () => {
    const projects = [proj("p1", "A"), proj("p2", "B")];
    const memories = [
      mem("p1", "drives", "success"),
      mem("p1", "drives", "success"),
      mem("p2", "plc",    "failed"),
    ];
    const { projectStats } = computeProjectAnalytics(projects, memories);
    const pA = projectStats.find((p) => p.projectId === "p1")!;
    const pB = projectStats.find((p) => p.projectId === "p2")!;
    expect(pA.memoryCount).toBe(2);
    expect(pB.memoryCount).toBe(1);
    expect(pA.successCount).toBe(2);
    expect(pB.failedCount).toBe(1);
  });

  it("memoriesPerProject is the average of project-tagged memories, rounded to 1dp", () => {
    const projects = [proj("p1", "A"), proj("p2", "B"), proj("p3", "C")];
    const memories = [
      mem("p1", "drives", "success"),
      mem("p1", "drives", "success"),
      mem("p1", "drives", "success"),
      // p2: 0, p3: 0
    ];
    const { summary } = computeProjectAnalytics(projects, memories);
    // totalProjectMemories=3, totalProjects=3 → 1.0
    expect(summary.memoriesPerProject).toBe(1);
  });

  it("portfolio outcome counts span all memories including untagged", () => {
    const projects = [proj("p1", "A")];
    const memories = [
      mem("p1",       "drives", "success"),
      mem(undefined,  "plc",    "failed"),   // untagged
      mem(undefined,  "plc",    "partial"),  // untagged
    ];
    const { summary } = computeProjectAnalytics(projects, memories);
    expect(summary.totalMemories).toBe(3);
    expect(summary.successfulOutcomes).toBe(1);
    expect(summary.failedOutcomes).toBe(1);
    expect(summary.partialOutcomes).toBe(1);
  });

  it("projectRiskDistribution counts risk levels correctly", () => {
    const projects = [proj("p1", "A"), proj("p2", "B"), proj("p3", "C")];
    const memories = [
      // p1: 3 success, 0 fail → successRate=100, failureRate=0 → low
      mem("p1", "drives", "success"), mem("p1", "drives", "success"), mem("p1", "drives", "success"),
      // p2: 3 fail, 1 success → failureRate=75 → high
      mem("p2", "plc", "failed"), mem("p2", "plc", "failed"), mem("p2", "plc", "failed"), mem("p2", "plc", "success"),
      // p3: no memories → unknown
    ];
    const { summary } = computeProjectAnalytics(projects, memories);
    expect(summary.projectRiskDistribution.low).toBe(1);
    expect(summary.projectRiskDistribution.high).toBe(1);
    expect(summary.projectRiskDistribution.unknown).toBe(1);
    expect(summary.projectRiskDistribution.medium).toBe(0);
  });
});

// ── Insight generation ─────────────────────────────────────────────────────

describe("computeProjectAnalytics — insights", () => {
  it("no insights when store is empty", () => {
    const { insights } = computeProjectAnalytics([], []);
    expect(insights).toEqual([]);
  });

  it("no insights when projects have no memories (except recurring_pattern from global memories)", () => {
    const { insights } = computeProjectAnalytics([proj("p1", "A")], []);
    expect(insights).toHaveLength(0);
  });

  it("highest_memory_activity identifies the project with most memories", () => {
    const projects = [proj("p1", "Alpha"), proj("p2", "Beta")];
    const memories = [
      mem("p1", "drives", "success"),
      mem("p2", "drives", "success"),
      mem("p2", "drives", "success"),
    ];
    const { insights } = computeProjectAnalytics(projects, memories);
    const ins = insights.find((i) => i.type === "highest_memory_activity")!;
    expect(ins).toBeDefined();
    expect(ins.projectId).toBe("p2");
    expect(ins.value).toBe(2);
  });

  it("highest_success_rate identifies the project with the highest success %", () => {
    const projects = [proj("p1", "Alpha"), proj("p2", "Beta")];
    const memories = [
      mem("p1", "drives", "success"),
      mem("p1", "drives", "failed"),    // 50%
      mem("p2", "drives", "success"),
      mem("p2", "drives", "success"),
      mem("p2", "drives", "success"),   // 100%
    ];
    const { insights } = computeProjectAnalytics(projects, memories);
    const ins = insights.find((i) => i.type === "highest_success_rate")!;
    expect(ins.projectId).toBe("p2");
    expect(ins.value).toBe(100);
  });

  it("highest_failure_rate is absent when no project has any failed outcomes", () => {
    const projects = [proj("p1", "Alpha")];
    const memories = [mem("p1", "drives", "success")];
    const { insights } = computeProjectAnalytics(projects, memories);
    expect(insights.find((i) => i.type === "highest_failure_rate")).toBeUndefined();
  });

  it("highest_failure_rate is generated when at least one project has failures", () => {
    const projects = [proj("p1", "Alpha"), proj("p2", "Beta")];
    const memories = [
      mem("p1", "drives", "failed"),
      mem("p1", "drives", "failed"),  // 100% failure
      mem("p2", "drives", "success"),
      mem("p2", "drives", "failed"),  // 50% failure
    ];
    const { insights } = computeProjectAnalytics(projects, memories);
    const ins = insights.find((i) => i.type === "highest_failure_rate")!;
    expect(ins.projectId).toBe("p1");
    expect(ins.value).toBe(100);
  });

  it("most_engineering_incidents identifies the project with most failed outcomes", () => {
    const projects = [proj("p1", "Alpha"), proj("p2", "Beta")];
    const memories = [
      mem("p1", "drives", "failed"),                              // p1: 1 failure
      mem("p2", "plc",    "failed"), mem("p2", "plc", "failed"), // p2: 2 failures
    ];
    const { insights } = computeProjectAnalytics(projects, memories);
    const ins = insights.find((i) => i.type === "most_engineering_incidents")!;
    expect(ins.projectId).toBe("p2");
    expect(ins.value).toBe(2);
  });

  it("recurring_pattern identifies the most common domain across ALL memories", () => {
    const projects = [proj("p1", "A"), proj("p2", "B")];
    const memories = [
      mem("p1",      "drives", "success"),
      mem("p1",      "drives", "success"),
      mem("p2",      "drives", "failed"),
      mem(undefined, "plc",    "success"),  // untagged — still counts
    ];
    const { insights } = computeProjectAnalytics(projects, memories);
    const ins = insights.find((i) => i.type === "recurring_pattern")!;
    expect(ins).toBeDefined();
    expect(ins.value).toBe("drives");
    expect(ins.projectId).toBeUndefined();
  });

  it("recurring_pattern is absent when there are no memories", () => {
    const { insights } = computeProjectAnalytics([proj("p1", "A")], []);
    expect(insights.find((i) => i.type === "recurring_pattern")).toBeUndefined();
  });

  it("tie-breaking is stable (alphabetically by projectId)", () => {
    const projects = [proj("a1", "ZZZ"), proj("b1", "AAA")];
    const memories = [
      mem("a1", "drives", "success"),  // 1 memory each → tie
      mem("b1", "drives", "success"),
    ];
    const { insights } = computeProjectAnalytics(projects, memories);
    const ins = insights.find((i) => i.type === "highest_memory_activity")!;
    // "a1" < "b1" alphabetically → a1 wins the tie
    expect(ins.projectId).toBe("a1");
  });

  it("all insight types are generated when data covers all conditions", () => {
    const projects = [proj("p1", "A"), proj("p2", "B")];
    const memories = [
      mem("p1", "drives", "success"),
      mem("p1", "drives", "failed"),
      mem("p2", "plc",    "success"),
    ];
    const { insights } = computeProjectAnalytics(projects, memories);
    const types = insights.map((i) => i.type);
    expect(types).toContain("highest_memory_activity");
    expect(types).toContain("highest_success_rate");
    expect(types).toContain("highest_failure_rate");
    expect(types).toContain("most_engineering_incidents");
    expect(types).toContain("recurring_pattern");
  });

  it("every insight has a non-empty description", () => {
    const projects = [proj("p1", "A")];
    const memories = [
      mem("p1", "drives", "success"),
      mem("p1", "drives", "failed"),
    ];
    const { insights } = computeProjectAnalytics(projects, memories);
    for (const ins of insights) {
      expect(typeof ins.description).toBe("string");
      expect(ins.description.length).toBeGreaterThan(0);
    }
  });
});

// ── Determinism guarantee ──────────────────────────────────────────────────

describe("computeProjectAnalytics — determinism", () => {
  it("same input always produces identical output (called twice)", () => {
    const projects = [proj("p1", "Alpha"), proj("p2", "Beta")];
    const memories = [
      mem("p1", "drives", "success", 70),
      mem("p1", "plc",    "failed",  30),
      mem("p2", "drives", "partial", 50),
    ];
    const r1 = computeProjectAnalytics(projects, memories);
    const r2 = computeProjectAnalytics(projects, memories);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});
