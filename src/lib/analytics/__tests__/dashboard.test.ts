import { describe, it, expect } from "vitest";
import { computeDashboard } from "../dashboard";
import type { KnowledgeGraph, GraphNode, GraphEdge } from "../knowledge-graph";
import type {
  StoredProject,
  StoredMemory,
  StoredMemoryFeedback,
  MemoryOutcome,
  ProjectStatus,
} from "@/lib/storage/types";

// ── Factories ──────────────────────────────────────────────────────────────

function proj(id: string, status: ProjectStatus = "active"): StoredProject {
  return { id, name: `Project ${id}`, description: "", status,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
}

let mIdx = 0;
function mem(id: string, opts: Partial<StoredMemory> = {}): StoredMemory {
  mIdx++;
  return {
    id, query: `query ${mIdx}`,
    domain:          opts.domain          ?? "drives",
    analysisSummary: opts.analysisSummary ?? `summary ${mIdx}`,
    confidence:      opts.confidence      ?? 70,
    relatedCaseIds:  opts.relatedCaseIds  ?? [],
    relatedDocumentIds: opts.relatedDocumentIds ?? [],
    outcome:         (opts.outcome        ?? "unknown") as MemoryOutcome,
    projectId:       opts.projectId,
    createdAt:       opts.createdAt       ?? "2026-01-10T00:00:00.000Z",
    updatedAt:       opts.updatedAt       ?? "2026-01-10T00:00:00.000Z",
  };
}

let fbIdx = 0;
function fb(memId: string, outcome: MemoryOutcome): StoredMemoryFeedback {
  return { id: `fb${++fbIdx}`, memoryId: memId, outcome, createdAt: "2026-02-01T00:00:00.000Z" };
}

function fbMap(entries: [string, StoredMemoryFeedback[]][]): Map<string, StoredMemoryFeedback[]> {
  return new Map(entries);
}

// Minimal empty KnowledgeGraph
function emptyGraph(): KnowledgeGraph {
  return {
    nodes: [], edges: [],
    summary: {
      totalNodes: 0, totalEdges: 0,
      nodesByType:  { project: 0, memory: 0, domain: 0, case: 0, risk: 0, outcome: 0, solution: 0 },
      edgesByType:  { belongs_to_project: 0, related_to_domain: 0, has_outcome: 0, has_risk: 0, similar_to: 0, resolved_by: 0 },
      connectedComponents: 0, avgDegree: 0, isolatedNodes: 0,
    },
  };
}

// Graph with two components (for fragmented_graph insight)
function fragmentedGraph(): KnowledgeGraph {
  const gn = (id: string, type: GraphNode["type"]): GraphNode =>
    ({ id, type, label: id, properties: {} });
  const ge = (type: GraphEdge["type"], src: string, tgt: string): GraphEdge =>
    ({ id: `${type}:${src}:${tgt}`, type, sourceId: src, targetId: tgt, weight: 1 });
  return {
    nodes: [gn("project:p1", "project"), gn("risk:p1", "risk"), gn("project:p2", "project"), gn("risk:p2", "risk")],
    edges: [ge("has_risk", "project:p1", "risk:p1"), ge("has_risk", "project:p2", "risk:p2")],
    summary: {
      totalNodes: 4, totalEdges: 2,
      nodesByType:  { project: 2, memory: 0, domain: 0, case: 0, risk: 2, outcome: 0, solution: 0 },
      edgesByType:  { belongs_to_project: 0, related_to_domain: 0, has_outcome: 0, has_risk: 2, similar_to: 0, resolved_by: 0 },
      connectedComponents: 2, avgDegree: 1, isolatedNodes: 0,
    },
  };
}

const NOW = new Date("2026-06-18T12:00:00.000Z");

// ── generatedAt ────────────────────────────────────────────────────────────

describe("computeDashboard — generatedAt", () => {
  it("uses the now parameter for generatedAt", () => {
    const r = computeDashboard([], [], new Map(), emptyGraph(), NOW);
    expect(r.generatedAt).toBe(NOW.toISOString());
  });
});

// ── systemSummary ──────────────────────────────────────────────────────────

describe("computeDashboard — systemSummary", () => {
  it("all zeros for empty inputs", () => {
    const { systemSummary } = computeDashboard([], [], new Map(), emptyGraph(), NOW);
    expect(systemSummary.totalProjects).toBe(0);
    expect(systemSummary.totalMemories).toBe(0);
    expect(systemSummary.linkedMemories).toBe(0);
    expect(systemSummary.totalDomains).toBe(0);
    expect(systemSummary.totalCases).toBe(0);
  });

  it("counts projects by presence, active by status", () => {
    const { systemSummary } = computeDashboard(
      [proj("p1", "active"), proj("p2", "archived"), proj("p3", "completed")],
      [], new Map(), emptyGraph(), NOW
    );
    expect(systemSummary.totalProjects).toBe(3);
    expect(systemSummary.activeProjects).toBe(1);
  });

  it("linkedMemories = memories with a non-empty projectId", () => {
    const mems = [mem("m1", { projectId: "p1" }), mem("m2"), mem("m3", { projectId: "p2" })];
    const { systemSummary } = computeDashboard([], mems, new Map(), emptyGraph(), NOW);
    expect(systemSummary.totalMemories).toBe(3);
    expect(systemSummary.linkedMemories).toBe(2);
  });

  it("totalDomains = unique domain values across memories", () => {
    const mems = [
      mem("m1", { domain: "drives" }),
      mem("m2", { domain: "hydraulics" }),
      mem("m3", { domain: "drives" }),
    ];
    const { systemSummary } = computeDashboard([], mems, new Map(), emptyGraph(), NOW);
    expect(systemSummary.totalDomains).toBe(2);
  });

  it("totalCases = unique case IDs across all memories", () => {
    const mems = [
      mem("m1", { relatedCaseIds: ["C1", "C2"] }),
      mem("m2", { relatedCaseIds: ["C1", "C3"] }),
    ];
    const { systemSummary } = computeDashboard([], mems, new Map(), emptyGraph(), NOW);
    expect(systemSummary.totalCases).toBe(3);
  });
});

// ── memoryHealth ───────────────────────────────────────────────────────────

describe("computeDashboard — memoryHealth", () => {
  it("all zeros for no memories", () => {
    const { memoryHealth } = computeDashboard([], [], new Map(), emptyGraph(), NOW);
    expect(memoryHealth.avgConfidence).toBe(0);
    expect(memoryHealth.feedbackRate).toBe(0);
    expect(memoryHealth.successRate).toBe(0);
  });

  it("avgConfidence is rounded mean of memory.confidence values", () => {
    const mems = [mem("m1", { confidence: 60 }), mem("m2", { confidence: 80 })];
    const { memoryHealth } = computeDashboard([], mems, new Map(), emptyGraph(), NOW);
    expect(memoryHealth.avgConfidence).toBe(70);
  });

  it("highConfidenceCount = memories with confidence >= 70", () => {
    const mems = [mem("m1", { confidence: 70 }), mem("m2", { confidence: 69 }), mem("m3", { confidence: 90 })];
    const { memoryHealth } = computeDashboard([], mems, new Map(), emptyGraph(), NOW);
    expect(memoryHealth.highConfidenceCount).toBe(2);
  });

  it("lowConfidenceCount = memories with confidence < 40", () => {
    const mems = [mem("m1", { confidence: 39 }), mem("m2", { confidence: 40 }), mem("m3", { confidence: 20 })];
    const { memoryHealth } = computeDashboard([], mems, new Map(), emptyGraph(), NOW);
    expect(memoryHealth.lowConfidenceCount).toBe(2);
  });

  it("outcomeDistribution counts each outcome type", () => {
    const mems = [
      mem("m1", { outcome: "success" }),
      mem("m2", { outcome: "success" }),
      mem("m3", { outcome: "failed" }),
      mem("m4", { outcome: "unknown" }),
    ];
    const { memoryHealth } = computeDashboard([], mems, new Map(), emptyGraph(), NOW);
    expect(memoryHealth.outcomeDistribution.success).toBe(2);
    expect(memoryHealth.outcomeDistribution.failed).toBe(1);
    expect(memoryHealth.outcomeDistribution.unknown).toBe(1);
    expect(memoryHealth.outcomeDistribution.partial).toBe(0);
  });

  it("successRate = % with outcome=success, rounded", () => {
    const mems = [mem("m1", { outcome: "success" }), mem("m2", { outcome: "failed" })];
    const { memoryHealth } = computeDashboard([], mems, new Map(), emptyGraph(), NOW);
    expect(memoryHealth.successRate).toBe(50);
  });

  it("feedbackRate = % of memories with at least 1 feedback entry", () => {
    const mems = [mem("m1"), mem("m2"), mem("m3")];
    const map  = fbMap([["m1", [fb("m1", "success")]]]);
    const { memoryHealth } = computeDashboard([], mems, map, emptyGraph(), NOW);
    expect(memoryHealth.feedbackRate).toBe(33); // round(1/3*100)
  });
});

// ── projectHealth ──────────────────────────────────────────────────────────

describe("computeDashboard — projectHealth", () => {
  it("byStatus counts all three status types", () => {
    const projects = [proj("p1","active"), proj("p2","archived"), proj("p3","completed"), proj("p4","active")];
    const { projectHealth } = computeDashboard(projects, [], new Map(), emptyGraph(), NOW);
    expect(projectHealth.byStatus.active).toBe(2);
    expect(projectHealth.byStatus.archived).toBe(1);
    expect(projectHealth.byStatus.completed).toBe(1);
  });

  it("avgFailureRate=0 and systemRiskLevel=low when no project has memories", () => {
    const { projectHealth } = computeDashboard([proj("p1")], [], new Map(), emptyGraph(), NOW);
    expect(projectHealth.avgFailureRate).toBe(0);
    expect(projectHealth.systemRiskLevel).toBe("low");
  });

  it("avgFailureRate is avg of per-project failure rates (only projects with memories)", () => {
    // p1: 2 mems, 1 failed → 50%; p2: 1 mem, 0 failed → 0% → avg=25
    const mems = [
      mem("m1", { projectId: "p1", outcome: "failed" }),
      mem("m2", { projectId: "p1", outcome: "success" }),
      mem("m3", { projectId: "p2", outcome: "success" }),
    ];
    const { projectHealth } = computeDashboard([proj("p1"),proj("p2")], mems, new Map(), emptyGraph(), NOW);
    expect(projectHealth.avgFailureRate).toBe(25);
  });

  it("highRiskProjects = count of projects with failureRate > 50%", () => {
    // p1: 3 mems, 2 failed → 67%; p2: 1 mem, 0 failed → 0%
    const mems = [
      mem("m1", { projectId: "p1", outcome: "failed" }),
      mem("m2", { projectId: "p1", outcome: "failed" }),
      mem("m3", { projectId: "p1", outcome: "success" }),
      mem("m4", { projectId: "p2", outcome: "success" }),
    ];
    const { projectHealth } = computeDashboard([proj("p1"),proj("p2")], mems, new Map(), emptyGraph(), NOW);
    expect(projectHealth.highRiskProjects).toBe(1);
  });

  it("systemRiskLevel boundaries: low<20, moderate>=20, elevated>=40, critical>=65", () => {
    function makeScenario(failed: number, total: number) {
      const p = proj("p1");
      const mems = Array.from({ length: total }, (_, i) =>
        mem(`m${i}`, { projectId: "p1", outcome: i < failed ? "failed" : "success" })
      );
      return computeDashboard([p], mems, new Map(), emptyGraph(), NOW).projectHealth.systemRiskLevel;
    }
    expect(makeScenario(0, 5)).toBe("low");       // 0% → low
    expect(makeScenario(1, 5)).toBe("moderate");  // 20% → moderate (>= 20)
    expect(makeScenario(2, 5)).toBe("elevated");  // 40% → elevated (>= 40)
  });

  it("exact systemRiskLevel threshold check", () => {
    // 1 project, 5 mems: exactly 40% failure → elevated
    const mems = [
      mem("x1", { projectId: "p1", outcome: "failed" }),
      mem("x2", { projectId: "p1", outcome: "failed" }),
      mem("x3", { projectId: "p1", outcome: "success" }),
      mem("x4", { projectId: "p1", outcome: "success" }),
      mem("x5", { projectId: "p1", outcome: "success" }),
    ];
    const r = computeDashboard([proj("p1")], mems, new Map(), emptyGraph(), NOW);
    expect(r.projectHealth.avgFailureRate).toBe(40);
    expect(r.projectHealth.systemRiskLevel).toBe("elevated");
  });
});

// ── graphSnapshot ──────────────────────────────────────────────────────────

describe("computeDashboard — graphSnapshot", () => {
  it("reflects graph.summary values", () => {
    const { graphSnapshot } = computeDashboard([], [], new Map(), fragmentedGraph(), NOW);
    expect(graphSnapshot.totalNodes).toBe(4);
    expect(graphSnapshot.totalEdges).toBe(2);
    expect(graphSnapshot.connectedComponents).toBe(2);
  });

  it("healthScore from computeGraphAnalytics.health.overallScore", () => {
    // empty graph → graphAnalytics.health.overallScore = 0
    const { graphSnapshot } = computeDashboard([], [], new Map(), emptyGraph(), NOW);
    expect(graphSnapshot.healthScore).toBe(0);
  });
});

// ── systemHealth ───────────────────────────────────────────────────────────

describe("computeDashboard — systemHealth", () => {
  it("memory = round((avgConfidence + successRate) / 2)", () => {
    const mems = [mem("m1", { confidence: 80, outcome: "success" })];
    const { systemHealth, memoryHealth } = computeDashboard([], mems, new Map(), emptyGraph(), NOW);
    const expected = Math.round((memoryHealth.avgConfidence + memoryHealth.successRate) / 2);
    expect(systemHealth.memory).toBe(expected);
  });

  it("projects = max(0, 100 - avgFailureRate)", () => {
    const mems = [
      mem("mx1", { projectId: "p1", outcome: "failed" }),
      mem("mx2", { projectId: "p1", outcome: "failed" }),
      mem("mx3", { projectId: "p1", outcome: "success" }),
    ];
    const { systemHealth, projectHealth } = computeDashboard([proj("p1")], mems, new Map(), emptyGraph(), NOW);
    expect(systemHealth.projects).toBe(Math.max(0, 100 - projectHealth.avgFailureRate));
  });

  it("overall = round(memory×0.35 + projects×0.35 + graph×0.30)", () => {
    const mems = [mem("my1", { confidence: 80, outcome: "success" })];
    const { systemHealth } = computeDashboard([], mems, new Map(), emptyGraph(), NOW);
    const expected = Math.round(systemHealth.memory * 0.35 + systemHealth.projects * 0.35 + systemHealth.graph * 0.30);
    expect(systemHealth.overall).toBe(expected);
  });

  it("all components are numbers in [0, 100]", () => {
    const mems = [mem("mz1", { confidence: 75, outcome: "success" }), mem("mz2", { confidence: 50 })];
    const { systemHealth } = computeDashboard([], mems, new Map(), emptyGraph(), NOW);
    for (const [k, v] of Object.entries(systemHealth)) {
      expect(typeof v).toBe("number");
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

// ── Insights ───────────────────────────────────────────────────────────────

describe("computeDashboard — insights", () => {
  it("empty_system fires when totalMemories = 0", () => {
    const { insights } = computeDashboard([], [], new Map(), emptyGraph(), NOW);
    expect(insights.some(i => i.type === "empty_system")).toBe(true);
  });

  it("empty_system does NOT fire when memories exist", () => {
    const { insights } = computeDashboard([], [mem("m1")], new Map(), emptyGraph(), NOW);
    expect(insights.some(i => i.type === "empty_system")).toBe(false);
  });

  it("high_risk_projects fires when a project has >50% failure rate", () => {
    const mems = [
      mem("m1", { projectId: "p1", outcome: "failed" }),
      mem("m2", { projectId: "p1", outcome: "failed" }),
      mem("m3", { projectId: "p1", outcome: "success" }),
    ];
    const { insights } = computeDashboard([proj("p1")], mems, new Map(), emptyGraph(), NOW);
    expect(insights.some(i => i.type === "high_risk_projects")).toBe(true);
  });

  it("high_risk_projects does NOT fire when all projects have <= 50% failure", () => {
    const mems = [
      mem("m1", { projectId: "p1", outcome: "failed" }),
      mem("m2", { projectId: "p1", outcome: "success" }),
    ];
    const { insights } = computeDashboard([proj("p1")], mems, new Map(), emptyGraph(), NOW);
    expect(insights.some(i => i.type === "high_risk_projects")).toBe(false);
  });

  it("low_confidence fires when avgConfidence < 50 and memories exist", () => {
    const { insights } = computeDashboard([], [mem("m1", { confidence: 30 })], new Map(), emptyGraph(), NOW);
    expect(insights.some(i => i.type === "low_confidence")).toBe(true);
  });

  it("low_feedback_rate fires when feedbackRate < 50% and totalMemories >= 3", () => {
    const mems = [mem("m1"), mem("m2"), mem("m3")];
    const { insights } = computeDashboard([], mems, new Map(), emptyGraph(), NOW);
    expect(insights.some(i => i.type === "low_feedback_rate")).toBe(true);
  });

  it("low_feedback_rate does NOT fire when fewer than 3 memories", () => {
    const mems = [mem("m1"), mem("m2")];
    const { insights } = computeDashboard([], mems, new Map(), emptyGraph(), NOW);
    expect(insights.some(i => i.type === "low_feedback_rate")).toBe(false);
  });

  it("coverage_gap fires when some memories have no projectId", () => {
    const mems = [mem("m1", { projectId: "p1" }), mem("m2")];
    const { insights } = computeDashboard([], mems, new Map(), emptyGraph(), NOW);
    expect(insights.some(i => i.type === "coverage_gap")).toBe(true);
  });

  it("coverage_gap does NOT fire when all memories are linked", () => {
    const mems = [mem("m1", { projectId: "p1" }), mem("m2", { projectId: "p1" })];
    const { insights } = computeDashboard([], mems, new Map(), emptyGraph(), NOW);
    expect(insights.some(i => i.type === "coverage_gap")).toBe(false);
  });

  it("fragmented_graph fires when connectedComponents > 1 and nodes exist", () => {
    const { insights } = computeDashboard([], [], new Map(), fragmentedGraph(), NOW);
    expect(insights.some(i => i.type === "fragmented_graph")).toBe(true);
  });

  it("fragmented_graph does NOT fire for empty graph (no nodes)", () => {
    const { insights } = computeDashboard([], [], new Map(), emptyGraph(), NOW);
    expect(insights.some(i => i.type === "fragmented_graph")).toBe(false);
  });

  it("knowledge_ready fires when system is healthy (>=5 memories, >=70 confidence, >=50% success)", () => {
    const mems = Array.from({ length: 5 }, (_, i) =>
      mem(`kr${i}`, { confidence: 75, outcome: "success" })
    );
    const { insights } = computeDashboard([], mems, new Map(), emptyGraph(), NOW);
    expect(insights.some(i => i.type === "knowledge_ready")).toBe(true);
  });

  it("insights are sorted critical → warning → info", () => {
    // high_risk_projects (warning) and coverage_gap (info) should be ordered correctly
    const mems = [
      mem("m1", { projectId: "p1", outcome: "failed" }),
      mem("m2", { projectId: "p1", outcome: "failed" }),
      mem("m3"),
    ];
    const { insights } = computeDashboard([proj("p1")], mems, new Map(), emptyGraph(), NOW);
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    for (let i = 1; i < insights.length; i++) {
      expect(severityOrder[insights[i-1].severity]).toBeLessThanOrEqual(severityOrder[insights[i].severity]);
    }
  });

  it("each insight has type, source, severity, message", () => {
    const { insights } = computeDashboard([], [], new Map(), emptyGraph(), NOW);
    for (const ins of insights) {
      expect(typeof ins.type).toBe("string");
      expect(typeof ins.source).toBe("string");
      expect(typeof ins.severity).toBe("string");
      expect(typeof ins.message).toBe("string");
      expect(ins.message.length).toBeGreaterThan(0);
    }
  });
});

// ── Determinism ────────────────────────────────────────────────────────────

describe("computeDashboard — determinism", () => {
  it("same inputs produce identical JSON output", () => {
    const projects = [proj("p1")];
    const memories = [mem("m1", { projectId: "p1", outcome: "success" })];
    const map = fbMap([["m1", [fb("m1", "success")]]]);
    const r1 = computeDashboard(projects, memories, map, emptyGraph(), NOW);
    const r2 = computeDashboard(projects, memories, map, emptyGraph(), NOW);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});
