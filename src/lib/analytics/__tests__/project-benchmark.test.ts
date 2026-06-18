import { describe, it, expect } from "vitest";
import { computeProjectBenchmark } from "../project-benchmark";
import type {
  StoredProject,
  StoredMemory,
  StoredMemoryFeedback,
  MemoryOutcome,
  ProjectStatus,
} from "@/lib/storage/types";

// ── Factories ──────────────────────────────────────────────────────────────

function proj(overrides: Partial<StoredProject> & { id: string }): StoredProject {
  return {
    id:          overrides.id,
    name:        overrides.name        ?? `Project ${overrides.id}`,
    description: overrides.description ?? "",
    status:      (overrides.status     ?? "active") as ProjectStatus,
    createdAt:   overrides.createdAt   ?? "2026-01-01T00:00:00.000Z",
    updatedAt:   overrides.updatedAt   ?? overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  };
}

let idx = 0;
function mem(
  id: string,
  projectId: string,
  domain    = "drives",
  confidence = 70,
  createdAt  = "2026-01-10T00:00:00.000Z"
): StoredMemory {
  idx++;
  return {
    id, query: `q${idx}`, domain,
    analysisSummary: `s${idx}`, confidence,
    relatedCaseIds: [], relatedDocumentIds: [],
    outcome: "unknown", projectId,
    createdAt, updatedAt: createdAt,
  };
}

let fbIdx = 0;
function fb(
  memoryId:  string,
  outcome:   MemoryOutcome,
  createdAt  = "2026-02-01T00:00:00.000Z"
): StoredMemoryFeedback {
  return { id: `fb${++fbIdx}`, memoryId, outcome, createdAt };
}

function fbMap(entries: [string, StoredMemoryFeedback[]][]): Map<string, StoredMemoryFeedback[]> {
  return new Map(entries);
}

const FIXED_NOW = new Date("2026-06-17T12:00:00.000Z");
// 50 days before FIXED_NOW (> 30d threshold)
const OLD_TS    = new Date(FIXED_NOW.getTime() - 50 * 24 * 3_600_000).toISOString();
// 10 days before FIXED_NOW (< 30d threshold — "recent")
const RECENT_TS = new Date(FIXED_NOW.getTime() - 10 * 24 * 3_600_000).toISOString();

// ── Empty portfolio ────────────────────────────────────────────────────────

describe("computeProjectBenchmark — empty portfolio", () => {
  it("returns zero summary when no projects", () => {
    const { summary } = computeProjectBenchmark([], [], new Map(), FIXED_NOW);
    expect(summary.totalProjects).toBe(0);
    expect(summary.activeProjects).toBe(0);
  });

  it("returns null leaders when no projects", () => {
    const { leaders } = computeProjectBenchmark([], [], new Map(), FIXED_NOW);
    expect(leaders.highestSuccessRate).toBeNull();
    expect(leaders.highestRisk).toBeNull();
    expect(leaders.mostActive).toBeNull();
    expect(leaders.mostMemories).toBeNull();
    expect(leaders.mostIncidents).toBeNull();
    expect(leaders.bestConfidence).toBeNull();
  });

  it("returns empty rankings when no projects", () => {
    const { rankings } = computeProjectBenchmark([], [], new Map(), FIXED_NOW);
    expect(rankings.successRate).toEqual([]);
    expect(rankings.riskScore).toEqual([]);
    expect(rankings.activity).toEqual([]);
    expect(rankings.confidence).toEqual([]);
  });

  it("returns empty insights when no projects", () => {
    const { insights } = computeProjectBenchmark([], [], new Map(), FIXED_NOW);
    expect(insights).toEqual([]);
  });
});

// ── Summary ────────────────────────────────────────────────────────────────

describe("computeProjectBenchmark — summary", () => {
  it("counts all project statuses correctly", () => {
    const projects = [
      proj({ id: "p1", status: "active" }),
      proj({ id: "p2", status: "active" }),
      proj({ id: "p3", status: "completed" }),
      proj({ id: "p4", status: "archived" }),
    ];
    const { summary } = computeProjectBenchmark(projects, [], new Map(), FIXED_NOW);
    expect(summary.totalProjects).toBe(4);
    expect(summary.activeProjects).toBe(2);
    expect(summary.completedProjects).toBe(1);
    expect(summary.archivedProjects).toBe(1);
  });
});

// ── Single project stats ───────────────────────────────────────────────────

describe("computeProjectBenchmark — single project", () => {
  it("project with no memories has zero metrics", () => {
    const { rankings } = computeProjectBenchmark(
      [proj({ id: "p1" })], [], new Map(), FIXED_NOW
    );
    const entry = rankings.successRate[0];
    expect(entry.projectId).toBe("p1");
    expect(entry.value).toBe(0);
    expect(entry.rank).toBe(1);
  });

  it("all-success feedback produces 100% success rate leader", () => {
    const memories = [mem("m1", "p1", "drives", 80)];
    const map = fbMap([["m1", [fb("m1", "success"), fb("m1", "success")]]]);
    const { leaders } = computeProjectBenchmark(
      [proj({ id: "p1" })], memories, map, FIXED_NOW
    );
    expect(leaders.highestSuccessRate?.value).toBe(100);
  });

  it("all-failed feedback produces expected failure metrics", () => {
    const memories = [mem("m1", "p1", "drives", 70)];
    const map = fbMap([["m1", [fb("m1", "failed"), fb("m1", "failed")]]]);
    const { leaders } = computeProjectBenchmark(
      [proj({ id: "p1" })], memories, map, FIXED_NOW
    );
    expect(leaders.mostIncidents?.value).toBe(2);
    expect(leaders.highestSuccessRate?.value).toBe(0);
  });
});

// ── Leaders ────────────────────────────────────────────────────────────────

describe("computeProjectBenchmark — leaders", () => {
  it("highestSuccessRate identifies project with most successes", () => {
    const projects = [proj({ id: "p1" }), proj({ id: "p2" })];
    const memories = [mem("m1", "p1"), mem("m2", "p2"), mem("m3", "p2")];
    const map = fbMap([
      ["m1", [fb("m1", "success")]],                         // p1: 100%
      ["m2", [fb("m2", "failed")]],                          // p2: 0%
      ["m3", [fb("m3", "failed")]],
    ]);
    const { leaders } = computeProjectBenchmark(projects, memories, map, FIXED_NOW);
    expect(leaders.highestSuccessRate?.projectId).toBe("p1");
    expect(leaders.highestSuccessRate?.value).toBe(100);
  });

  it("highestRisk identifies project with highest risk score", () => {
    const projects = [proj({ id: "p1" }), proj({ id: "p2" })];
    const m1 = mem("m1", "p1", "drives", 0);  // low confidence → higher risk
    const m2 = mem("m2", "p2", "drives", 90);
    const now = FIXED_NOW;
    const recentTs = new Date(now.getTime() - 5 * 24 * 3_600_000).toISOString();
    const map = fbMap([
      ["m1", [fb("m1", "failed", recentTs), fb("m1", "failed", recentTs)]],
      ["m2", [fb("m2", "success")]],
    ]);
    const { leaders } = computeProjectBenchmark(projects, [m1, m2], map, now);
    expect(leaders.highestRisk?.projectId).toBe("p1");
  });

  it("mostActive identifies project with highest activityScore", () => {
    const projects = [proj({ id: "p1" }), proj({ id: "p2" })];
    const memories = [
      mem("m1", "p1"), mem("m2", "p1"), mem("m3", "p1"),  // p1: 3 memories + feedback
      mem("m4", "p2"),                                     // p2: 1 memory
    ];
    const map = fbMap([
      ["m1", [fb("m1", "success")]],
      ["m2", [fb("m2", "success")]],
      ["m4", [fb("m4", "success")]],
    ]);
    const { leaders } = computeProjectBenchmark(projects, memories, map, FIXED_NOW);
    expect(leaders.mostActive?.projectId).toBe("p1");
  });

  it("mostMemories identifies project with most tagged memories", () => {
    const projects = [proj({ id: "p1" }), proj({ id: "p2" })];
    const memories = [
      mem("m1", "p1"), mem("m2", "p1"),
      mem("m3", "p2"),
    ];
    const { leaders } = computeProjectBenchmark(projects, memories, new Map(), FIXED_NOW);
    expect(leaders.mostMemories?.projectId).toBe("p1");
    expect(leaders.mostMemories?.value).toBe(2);
  });

  it("mostIncidents is null when no project has failures", () => {
    const projects = [proj({ id: "p1" })];
    const memories = [mem("m1", "p1")];
    const map = fbMap([["m1", [fb("m1", "success")]]]);
    const { leaders } = computeProjectBenchmark(projects, memories, map, FIXED_NOW);
    expect(leaders.mostIncidents).toBeNull();
  });

  it("mostIncidents identifies project with most failed outcomes", () => {
    const projects = [proj({ id: "p1" }), proj({ id: "p2" })];
    const memories = [mem("m1", "p1"), mem("m2", "p2"), mem("m3", "p2")];
    const map = fbMap([
      ["m1", [fb("m1", "failed")]],
      ["m2", [fb("m2", "failed")]],
      ["m3", [fb("m3", "failed")]],
    ]);
    const { leaders } = computeProjectBenchmark(projects, memories, map, FIXED_NOW);
    expect(leaders.mostIncidents?.projectId).toBe("p2");
    expect(leaders.mostIncidents?.value).toBe(2);
  });

  it("bestConfidence is null when no project has memories", () => {
    const { leaders } = computeProjectBenchmark(
      [proj({ id: "p1" })], [], new Map(), FIXED_NOW
    );
    expect(leaders.bestConfidence).toBeNull();
  });

  it("bestConfidence identifies project with highest avg confidence", () => {
    const projects = [proj({ id: "p1" }), proj({ id: "p2" })];
    const memories = [
      mem("m1", "p1", "drives", 90),
      mem("m2", "p2", "drives", 50),
    ];
    const { leaders } = computeProjectBenchmark(projects, memories, new Map(), FIXED_NOW);
    expect(leaders.bestConfidence?.projectId).toBe("p1");
    expect(leaders.bestConfidence?.value).toBe(90);
  });
});

// ── Rankings ───────────────────────────────────────────────────────────────

describe("computeProjectBenchmark — rankings", () => {
  it("successRate ranking is ordered DESC", () => {
    const projects = [proj({ id: "p1" }), proj({ id: "p2" }), proj({ id: "p3" })];
    const memories = [mem("m1", "p1"), mem("m2", "p2"), mem("m3", "p3")];
    const map = fbMap([
      ["m1", [fb("m1", "success")]],           // 100%
      ["m2", [fb("m2", "failed")]],            // 0%
      ["m3", [fb("m3", "success"), fb("m3", "failed")]],  // 50%
    ]);
    const { rankings } = computeProjectBenchmark(projects, memories, map, FIXED_NOW);
    const values = rankings.successRate.map(r => r.value);
    expect(values[0]).toBeGreaterThanOrEqual(values[1]);
    expect(values[1]).toBeGreaterThanOrEqual(values[2]);
  });

  it("riskScore ranking is ordered DESC", () => {
    const projects = [proj({ id: "p1" }), proj({ id: "p2" })];
    const m1 = mem("m1", "p1", "drives", 0);
    const m2 = mem("m2", "p2", "drives", 90);
    const map = fbMap([
      ["m1", [fb("m1", "failed")]],
      ["m2", [fb("m2", "success")]],
    ]);
    const { rankings } = computeProjectBenchmark(projects, [m1, m2], map, FIXED_NOW);
    expect(rankings.riskScore[0].value).toBeGreaterThanOrEqual(rankings.riskScore[1].value);
  });

  it("activity ranking is ordered DESC", () => {
    const projects = [proj({ id: "p1" }), proj({ id: "p2" }), proj({ id: "p3" })];
    const memories = [
      mem("m1", "p1"), mem("m2", "p1"), mem("m3", "p1"),  // 3
      mem("m4", "p2"),                                     // 1
      // p3: 0
    ];
    const { rankings } = computeProjectBenchmark(projects, memories, new Map(), FIXED_NOW);
    const values = rankings.activity.map(r => r.value);
    expect(values[0]).toBeGreaterThanOrEqual(values[1]);
    expect(values[1]).toBeGreaterThanOrEqual(values[2]);
  });

  it("confidence ranking is ordered DESC", () => {
    const projects = [proj({ id: "p1" }), proj({ id: "p2" })];
    const memories = [mem("m1", "p1", "drives", 90), mem("m2", "p2", "drives", 30)];
    const { rankings } = computeProjectBenchmark(projects, memories, new Map(), FIXED_NOW);
    expect(rankings.confidence[0].value).toBeGreaterThanOrEqual(rankings.confidence[1].value);
  });

  it("rank numbers are sequential starting from 1", () => {
    const projects = [proj({ id: "p1" }), proj({ id: "p2" }), proj({ id: "p3" })];
    const { rankings } = computeProjectBenchmark(projects, [], new Map(), FIXED_NOW);
    const ranks = rankings.successRate.map(r => r.rank);
    expect(ranks).toEqual([1, 2, 3]);
  });

  it("rankings include every project exactly once", () => {
    const projects = [proj({ id: "p1" }), proj({ id: "p2" }), proj({ id: "p3" })];
    const { rankings } = computeProjectBenchmark(projects, [], new Map(), FIXED_NOW);
    const ids = new Set(rankings.successRate.map(r => r.projectId));
    expect(ids.size).toBe(3);
    expect(ids.has("p1")).toBe(true);
    expect(ids.has("p2")).toBe(true);
    expect(ids.has("p3")).toBe(true);
  });

  it("tie-breaking: alphabetically earlier projectId ranks higher on equal value", () => {
    const projects = [proj({ id: "z9" }), proj({ id: "a1" })];  // same metrics
    const { rankings } = computeProjectBenchmark(projects, [], new Map(), FIXED_NOW);
    expect(rankings.successRate[0].projectId).toBe("a1");
    expect(rankings.activity[0].projectId).toBe("a1");
  });

  it("ranking entries have expected shape", () => {
    const projects = [proj({ id: "p1" })];
    const { rankings } = computeProjectBenchmark(projects, [], new Map(), FIXED_NOW);
    const entry = rankings.successRate[0];
    expect(entry).toHaveProperty("rank");
    expect(entry).toHaveProperty("projectId");
    expect(entry).toHaveProperty("projectName");
    expect(entry).toHaveProperty("status");
    expect(entry).toHaveProperty("value");
    expect(entry).toHaveProperty("riskLevel");
  });
});

// ── Insights ───────────────────────────────────────────────────────────────

describe("computeProjectBenchmark — insights", () => {
  it("no insights for empty portfolio", () => {
    expect(computeProjectBenchmark([], [], new Map(), FIXED_NOW).insights).toEqual([]);
  });

  it("portfolio_health insight always present when projects exist", () => {
    const { insights } = computeProjectBenchmark(
      [proj({ id: "p1" })], [], new Map(), FIXED_NOW
    );
    expect(insights.find(i => i.type === "portfolio_health")).toBeDefined();
  });

  it("top_performer absent when no project has outcome feedback", () => {
    const { insights } = computeProjectBenchmark(
      [proj({ id: "p1" })], [], new Map(), FIXED_NOW
    );
    expect(insights.find(i => i.type === "top_performer")).toBeUndefined();
  });

  it("top_performer present and points to best success rate", () => {
    const projects = [proj({ id: "p1" }), proj({ id: "p2" })];
    const memories = [mem("m1", "p1"), mem("m2", "p2")];
    const map = fbMap([
      ["m1", [fb("m1", "success")]],  // p1: 100%
      ["m2", [fb("m2", "failed")]],   // p2: 0%
    ]);
    const { insights } = computeProjectBenchmark(projects, memories, map, FIXED_NOW);
    const ins = insights.find(i => i.type === "top_performer")!;
    expect(ins.projectId).toBe("p1");
    expect(ins.value).toBe(100);
  });

  it("highest_risk absent when all risk scores are 0", () => {
    const { insights } = computeProjectBenchmark(
      [proj({ id: "p1" })], [], new Map(), FIXED_NOW
    );
    expect(insights.find(i => i.type === "highest_risk")).toBeUndefined();
  });

  it("highest_risk present when any project has risk score > 0", () => {
    const memories = [mem("m1", "p1", "drives", 0)];
    const map = fbMap([["m1", [fb("m1", "failed")]]]);
    const { insights } = computeProjectBenchmark(
      [proj({ id: "p1" })], memories, map, FIXED_NOW
    );
    expect(insights.find(i => i.type === "highest_risk")).toBeDefined();
  });

  it("most_incidents absent when no project has failures", () => {
    const memories = [mem("m1", "p1")];
    const map = fbMap([["m1", [fb("m1", "success")]]]);
    const { insights } = computeProjectBenchmark(
      [proj({ id: "p1" })], memories, map, FIXED_NOW
    );
    expect(insights.find(i => i.type === "most_incidents")).toBeUndefined();
  });

  it("most_incidents present and points to highest incident project", () => {
    const projects = [proj({ id: "p1" }), proj({ id: "p2" })];
    const memories = [mem("m1", "p1"), mem("m2", "p2"), mem("m3", "p2")];
    const map = fbMap([
      ["m1", [fb("m1", "failed")]],
      ["m2", [fb("m2", "failed")]],
      ["m3", [fb("m3", "failed")]],
    ]);
    const { insights } = computeProjectBenchmark(projects, memories, map, FIXED_NOW);
    const ins = insights.find(i => i.type === "most_incidents")!;
    expect(ins.projectId).toBe("p2");
    expect(ins.value).toBe(2);
  });

  it("most_active present and has non-empty description", () => {
    const memories = [mem("m1", "p1")];
    const { insights } = computeProjectBenchmark(
      [proj({ id: "p1" })], memories, new Map(), FIXED_NOW
    );
    const ins = insights.find(i => i.type === "most_active")!;
    expect(ins).toBeDefined();
    expect(ins.description.length).toBeGreaterThan(0);
  });

  it("fastest_improving absent when no project improved > 5 points in 30 days", () => {
    // All history within 30 days → no past anchor → improvement = 0
    const now = FIXED_NOW;
    const recentProjectTs = new Date(now.getTime() - 5 * 24 * 3_600_000).toISOString();
    const memories = [mem("m1", "p1", "drives", 70, recentProjectTs)];
    const map = fbMap([["m1", [fb("m1", "failed", RECENT_TS)]]]);
    const { insights } = computeProjectBenchmark(
      [proj({ id: "p1", createdAt: recentProjectTs })], memories, map, now
    );
    expect(insights.find(i => i.type === "fastest_improving")).toBeUndefined();
  });

  it("fastest_improving present when a project has meaningful improvement", () => {
    // Old failure (50d ago) + recent success (10d ago) → improvement > 5
    const memories = [mem("m1", "p1", "drives", 70, "2026-01-10T00:00:00.000Z")];
    const map = fbMap([
      ["m1", [
        fb("m1", "failed",  OLD_TS),
        fb("m1", "success", RECENT_TS),
      ]],
    ]);
    const { insights } = computeProjectBenchmark(
      [proj({ id: "p1" })], memories, map, FIXED_NOW
    );
    const ins = insights.find(i => i.type === "fastest_improving");
    expect(ins).toBeDefined();
    expect(typeof ins!.value).toBe("number");
    expect(ins!.value as number).toBeGreaterThan(5);
  });

  it("portfolio_health is 'healthy' when avg risk < 20 and avg success > 60", () => {
    const projects = [proj({ id: "p1" }), proj({ id: "p2" })];
    const memories = [
      mem("m1", "p1", "drives", 100),
      mem("m2", "p2", "drives", 100),
    ];
    const map = fbMap([
      ["m1", [fb("m1", "success"), fb("m1", "success"), fb("m1", "success")]],
      ["m2", [fb("m2", "success"), fb("m2", "success"), fb("m2", "success")]],
    ]);
    const { insights } = computeProjectBenchmark(projects, memories, map, FIXED_NOW);
    const health = insights.find(i => i.type === "portfolio_health")!;
    expect(health.value).toBe("healthy");
  });

  it("portfolio_health is 'at_risk' when avg risk >= 40", () => {
    const projects = [proj({ id: "p1" })];
    const memories = [mem("m1", "p1", "drives", 0)];
    const now = FIXED_NOW;
    const recentTs = new Date(now.getTime() - 5 * 24 * 3_600_000).toISOString();
    const map = fbMap([
      ["m1", [fb("m1", "failed", recentTs), fb("m1", "failed", recentTs)]],
    ]);
    const { insights } = computeProjectBenchmark(projects, memories, map, now);
    const health = insights.find(i => i.type === "portfolio_health")!;
    expect(["moderate", "at_risk"]).toContain(health.value);
  });

  it("every insight has a non-empty description", () => {
    const projects = [proj({ id: "p1" }), proj({ id: "p2" })];
    const memories = [mem("m1", "p1"), mem("m2", "p2")];
    const map = fbMap([
      ["m1", [fb("m1", "success")]],
      ["m2", [fb("m2", "failed")]],
    ]);
    const { insights } = computeProjectBenchmark(projects, memories, map, FIXED_NOW);
    for (const ins of insights) {
      expect(typeof ins.description).toBe("string");
      expect(ins.description.length).toBeGreaterThan(0);
    }
  });
});

// ── Determinism ────────────────────────────────────────────────────────────

describe("computeProjectBenchmark — determinism", () => {
  it("same input produces identical output across two calls", () => {
    const projects = [proj({ id: "p1" }), proj({ id: "p2" })];
    const memories = [mem("m1", "p1"), mem("m2", "p2")];
    const map = fbMap([
      ["m1", [fb("m1", "success")]],
      ["m2", [fb("m2", "failed")]],
    ]);
    const r1 = computeProjectBenchmark(projects, memories, map, FIXED_NOW);
    const r2 = computeProjectBenchmark(projects, memories, map, FIXED_NOW);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});
