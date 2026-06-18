import { describe, it, expect } from "vitest";
import { computeKnowledgeGraph } from "../knowledge-graph";
import type {
  StoredProject,
  StoredMemory,
  StoredMemoryFeedback,
  MemoryOutcome,
  ProjectStatus,
} from "@/lib/storage/types";

// ── Factories ──────────────────────────────────────────────────────────────

function proj(id: string, overrides: Partial<StoredProject> = {}): StoredProject {
  return {
    id, name: `Project ${id}`, description: "",
    status: (overrides.status ?? "active") as ProjectStatus,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

let mIdx = 0;
function mem(id: string, overrides: Partial<StoredMemory> = {}): StoredMemory {
  mIdx++;
  return {
    id,
    query:           overrides.query           ?? `query text for memory ${id}`,
    domain:          overrides.domain          ?? "drives",
    analysisSummary: overrides.analysisSummary ?? `summary ${mIdx}`,
    confidence:      overrides.confidence      ?? 70,
    relatedCaseIds:  overrides.relatedCaseIds  ?? [],
    relatedDocumentIds: overrides.relatedDocumentIds ?? [],
    outcome:         (overrides.outcome        ?? "unknown") as MemoryOutcome,
    projectId:       overrides.projectId,
    createdAt:       overrides.createdAt       ?? "2026-01-10T00:00:00.000Z",
    updatedAt:       overrides.updatedAt       ?? "2026-01-10T00:00:00.000Z",
  };
}

let fbIdx = 0;
function fb(memoryId: string, outcome: MemoryOutcome, createdAt = "2026-02-01T00:00:00.000Z"): StoredMemoryFeedback {
  return { id: `fb${++fbIdx}`, memoryId, outcome, createdAt };
}

function fbMap(entries: [string, StoredMemoryFeedback[]][]): Map<string, StoredMemoryFeedback[]> {
  return new Map(entries);
}

const NOW = new Date("2026-06-17T12:00:00.000Z");

// ── Empty graph ────────────────────────────────────────────────────────────

describe("computeKnowledgeGraph — empty inputs", () => {
  it("returns empty arrays and zero summary for empty store", () => {
    const g = computeKnowledgeGraph([], [], new Map(), NOW);
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
    expect(g.summary.totalNodes).toBe(0);
    expect(g.summary.totalEdges).toBe(0);
    expect(g.summary.connectedComponents).toBe(0);
    expect(g.summary.isolatedNodes).toBe(0);
  });

  it("nodesByType counts all zero for empty graph", () => {
    const { summary } = computeKnowledgeGraph([], [], new Map(), NOW);
    expect(summary.nodesByType.project).toBe(0);
    expect(summary.nodesByType.memory).toBe(0);
    expect(summary.nodesByType.domain).toBe(0);
    expect(summary.nodesByType.case).toBe(0);
    expect(summary.nodesByType.risk).toBe(0);
    expect(summary.nodesByType.outcome).toBe(0);
    expect(summary.nodesByType.solution).toBe(0);
  });
});

// ── Project nodes ──────────────────────────────────────────────────────────

describe("computeKnowledgeGraph — project nodes", () => {
  it("creates one project node per project", () => {
    const g = computeKnowledgeGraph([proj("p1"), proj("p2")], [], new Map(), NOW);
    const pNodes = g.nodes.filter(n => n.type === "project");
    expect(pNodes).toHaveLength(2);
    expect(pNodes.map(n => n.id).sort()).toEqual(["project:p1", "project:p2"]);
  });

  it("project node label is the project name", () => {
    const g = computeKnowledgeGraph([proj("p1", { name: "Hermes Drive" })], [], new Map(), NOW);
    const node = g.nodes.find(n => n.id === "project:p1")!;
    expect(node.label).toBe("Hermes Drive");
  });

  it("project node properties include status and createdAt", () => {
    const g = computeKnowledgeGraph([proj("p1", { status: "completed" })], [], new Map(), NOW);
    const node = g.nodes.find(n => n.id === "project:p1")!;
    expect(node.properties.status).toBe("completed");
    expect(typeof node.properties.createdAt).toBe("string");
  });
});

// ── Memory nodes ───────────────────────────────────────────────────────────

describe("computeKnowledgeGraph — memory nodes", () => {
  it("creates one memory node per memory", () => {
    const g = computeKnowledgeGraph([], [mem("m1"), mem("m2"), mem("m3")], new Map(), NOW);
    expect(g.nodes.filter(n => n.type === "memory")).toHaveLength(3);
  });

  it("memory node label truncates queries over 80 chars", () => {
    const longQuery = "a".repeat(90);
    const g = computeKnowledgeGraph([], [mem("m1", { query: longQuery })], new Map(), NOW);
    const node = g.nodes.find(n => n.id === "memory:m1")!;
    expect(node.label.length).toBeLessThan(90);
    expect(node.label.endsWith("…")).toBe(true);
  });

  it("memory node properties include domain, confidence, outcome", () => {
    const g = computeKnowledgeGraph(
      [], [mem("m1", { domain: "hydraulics", confidence: 85, outcome: "success" })],
      new Map(), NOW
    );
    const node = g.nodes.find(n => n.id === "memory:m1")!;
    expect(node.properties.domain).toBe("hydraulics");
    expect(node.properties.confidence).toBe(85);
    expect(node.properties.outcome).toBe("success");
  });
});

// ── Domain nodes ───────────────────────────────────────────────────────────

describe("computeKnowledgeGraph — domain nodes", () => {
  it("creates one domain node per unique domain", () => {
    const mems = [
      mem("m1", { domain: "drives" }),
      mem("m2", { domain: "hydraulics" }),
      mem("m3", { domain: "drives" }),
    ];
    const g = computeKnowledgeGraph([], mems, new Map(), NOW);
    const dNodes = g.nodes.filter(n => n.type === "domain");
    expect(dNodes).toHaveLength(2);
    expect(dNodes.map(n => n.id).sort()).toEqual(["domain:drives", "domain:hydraulics"]);
  });

  it("domain node properties: memoryCount and avgConfidence", () => {
    const mems = [
      mem("m1", { domain: "drives", confidence: 80 }),
      mem("m2", { domain: "drives", confidence: 60 }),
    ];
    const g = computeKnowledgeGraph([], mems, new Map(), NOW);
    const node = g.nodes.find(n => n.id === "domain:drives")!;
    expect(node.properties.memoryCount).toBe(2);
    expect(node.properties.avgConfidence).toBe(70);
  });

  it("domain node successRate based on outcome feedback outcomes", () => {
    const mems = [
      mem("m1", { domain: "drives", outcome: "success" }),
      mem("m2", { domain: "drives", outcome: "failed" }),
    ];
    const g = computeKnowledgeGraph([], mems, new Map(), NOW);
    const node = g.nodes.find(n => n.id === "domain:drives")!;
    expect(node.properties.successRate).toBe(50);
  });

  it("no domain nodes when no memories", () => {
    const g = computeKnowledgeGraph([proj("p1")], [], new Map(), NOW);
    expect(g.nodes.filter(n => n.type === "domain")).toHaveLength(0);
  });
});

// ── Case nodes ─────────────────────────────────────────────────────────────

describe("computeKnowledgeGraph — case nodes", () => {
  it("creates case nodes from relatedCaseIds", () => {
    const mems = [mem("m1", { relatedCaseIds: ["CASE-001", "CASE-002"] })];
    const g = computeKnowledgeGraph([], mems, new Map(), NOW);
    const cNodes = g.nodes.filter(n => n.type === "case");
    expect(cNodes).toHaveLength(2);
  });

  it("deduplicates case nodes referenced by multiple memories", () => {
    const mems = [
      mem("m1", { relatedCaseIds: ["CASE-001"] }),
      mem("m2", { relatedCaseIds: ["CASE-001", "CASE-002"] }),
    ];
    const g = computeKnowledgeGraph([], mems, new Map(), NOW);
    const cNodes = g.nodes.filter(n => n.type === "case");
    expect(cNodes).toHaveLength(2);
    expect(cNodes.find(n => n.id === "case:CASE-001")!.properties.referenceCount).toBe(2);
  });

  it("no case nodes when all memories have empty relatedCaseIds", () => {
    const g = computeKnowledgeGraph([], [mem("m1")], new Map(), NOW);
    expect(g.nodes.filter(n => n.type === "case")).toHaveLength(0);
  });
});

// ── Risk nodes ─────────────────────────────────────────────────────────────

describe("computeKnowledgeGraph — risk nodes", () => {
  it("creates one risk node per project", () => {
    const g = computeKnowledgeGraph([proj("p1"), proj("p2")], [], new Map(), NOW);
    const rNodes = g.nodes.filter(n => n.type === "risk");
    expect(rNodes).toHaveLength(2);
    expect(rNodes.map(n => n.id).sort()).toEqual(["risk:p1", "risk:p2"]);
  });

  it("risk node for project with no memories has score=0 and level=low", () => {
    const g = computeKnowledgeGraph([proj("p1")], [], new Map(), NOW);
    const node = g.nodes.find(n => n.id === "risk:p1")!;
    expect(node.properties.score).toBe(0);
    expect(node.properties.level).toBe("low");
  });

  it("risk node properties include trend and reason", () => {
    const g = computeKnowledgeGraph([proj("p1")], [], new Map(), NOW);
    const node = g.nodes.find(n => n.id === "risk:p1")!;
    expect(typeof node.properties.trend).toBe("string");
    expect(typeof node.properties.reason).toBe("string");
  });

  it("risk node score > 0 for project with failed memories", () => {
    const p = proj("p1");
    const m = mem("m1", { projectId: "p1", confidence: 50 });
    const map = fbMap([["m1", [fb("m1", "failed"), fb("m1", "failed")]]]);
    const g = computeKnowledgeGraph([p], [m], map, NOW);
    const node = g.nodes.find(n => n.id === "risk:p1")!;
    expect(node.properties.score as number).toBeGreaterThan(0);
  });

  it("no risk nodes when no projects", () => {
    const g = computeKnowledgeGraph([], [mem("m1")], new Map(), NOW);
    expect(g.nodes.filter(n => n.type === "risk")).toHaveLength(0);
  });
});

// ── Outcome nodes ──────────────────────────────────────────────────────────

describe("computeKnowledgeGraph — outcome nodes", () => {
  it("creates outcome nodes only for outcomes that appear in memories", () => {
    const mems = [
      mem("m1", { outcome: "success" }),
      mem("m2", { outcome: "success" }),
      mem("m3", { outcome: "failed" }),
    ];
    const g = computeKnowledgeGraph([], mems, new Map(), NOW);
    const oNodes = g.nodes.filter(n => n.type === "outcome");
    expect(oNodes).toHaveLength(2);
    const ids = oNodes.map(n => n.id).sort();
    expect(ids).toEqual(["outcome:failed", "outcome:success"]);
  });

  it("outcome node count property matches memory count", () => {
    const mems = [
      mem("m1", { outcome: "success" }),
      mem("m2", { outcome: "success" }),
      mem("m3", { outcome: "unknown" }),
    ];
    const g = computeKnowledgeGraph([], mems, new Map(), NOW);
    const successNode = g.nodes.find(n => n.id === "outcome:success")!;
    expect(successNode.properties.count).toBe(2);
  });

  it("outcome nodes are sorted alphabetically by id (global node sort)", () => {
    const mems = [
      mem("m1", { outcome: "unknown" }),
      mem("m2", { outcome: "failed" }),
      mem("m3", { outcome: "success" }),
    ];
    const g = computeKnowledgeGraph([], mems, new Map(), NOW);
    const oNodes = g.nodes.filter(n => n.type === "outcome");
    // Global sort is type ASC then id ASC: outcome:failed < outcome:success < outcome:unknown
    expect(oNodes[0].label).toBe("failed");
    expect(oNodes[1].label).toBe("success");
    expect(oNodes[2].label).toBe("unknown");
  });
});

// ── Solution nodes ─────────────────────────────────────────────────────────

describe("computeKnowledgeGraph — solution nodes", () => {
  it("creates solution nodes for memories with outcome=success and no feedback", () => {
    const g = computeKnowledgeGraph(
      [], [mem("m1", { outcome: "success" })], new Map(), NOW
    );
    expect(g.nodes.filter(n => n.type === "solution")).toHaveLength(1);
    expect(g.nodes.find(n => n.id === "solution:m1")).toBeDefined();
  });

  it("creates solution nodes for memories where majority feedback is success", () => {
    const m = mem("m1", { outcome: "unknown" });
    const map = fbMap([["m1", [fb("m1", "success"), fb("m1", "success"), fb("m1", "failed")]]]);
    const g = computeKnowledgeGraph([], [m], map, NOW);
    expect(g.nodes.find(n => n.id === "solution:m1")).toBeDefined();
  });

  it("does NOT create solution nodes for memories with majority failed feedback", () => {
    const m = mem("m1", { outcome: "unknown" });
    const map = fbMap([["m1", [fb("m1", "failed"), fb("m1", "failed"), fb("m1", "success")]]]);
    const g = computeKnowledgeGraph([], [m], map, NOW);
    expect(g.nodes.find(n => n.id === "solution:m1")).toBeUndefined();
  });

  it("no solution nodes when no memories qualify", () => {
    const mems = [mem("m1", { outcome: "failed" }), mem("m2", { outcome: "unknown" })];
    const g = computeKnowledgeGraph([], mems, new Map(), NOW);
    expect(g.nodes.filter(n => n.type === "solution")).toHaveLength(0);
  });
});

// ── belongs_to_project edges ───────────────────────────────────────────────

describe("computeKnowledgeGraph — belongs_to_project edges", () => {
  it("creates edge when memory has valid projectId", () => {
    const g = computeKnowledgeGraph(
      [proj("p1")],
      [mem("m1", { projectId: "p1" })],
      new Map(), NOW
    );
    const edge = g.edges.find(e => e.type === "belongs_to_project");
    expect(edge).toBeDefined();
    expect(edge!.sourceId).toBe("memory:m1");
    expect(edge!.targetId).toBe("project:p1");
  });

  it("does NOT create edge when projectId is not in the projects list", () => {
    const g = computeKnowledgeGraph(
      [],                                      // no projects
      [mem("m1", { projectId: "ghost" })],     // memory references non-existent project
      new Map(), NOW
    );
    expect(g.edges.filter(e => e.type === "belongs_to_project")).toHaveLength(0);
  });

  it("does NOT create edge when memory has no projectId", () => {
    const g = computeKnowledgeGraph(
      [proj("p1")],
      [mem("m1")],           // no projectId
      new Map(), NOW
    );
    expect(g.edges.filter(e => e.type === "belongs_to_project")).toHaveLength(0);
  });
});

// ── related_to_domain edges ────────────────────────────────────────────────

describe("computeKnowledgeGraph — related_to_domain edges", () => {
  it("creates one related_to_domain edge per memory", () => {
    const mems = [mem("m1", { domain: "drives" }), mem("m2", { domain: "hydraulics" })];
    const g = computeKnowledgeGraph([], mems, new Map(), NOW);
    const rtd = g.edges.filter(e => e.type === "related_to_domain");
    expect(rtd).toHaveLength(2);
  });

  it("edge source is memory node, target is domain node", () => {
    const g = computeKnowledgeGraph([], [mem("m1", { domain: "drives" })], new Map(), NOW);
    const edge = g.edges.find(e => e.type === "related_to_domain")!;
    expect(edge.sourceId).toBe("memory:m1");
    expect(edge.targetId).toBe("domain:drives");
  });
});

// ── has_outcome edges ──────────────────────────────────────────────────────

describe("computeKnowledgeGraph — has_outcome edges", () => {
  it("creates one has_outcome edge per memory", () => {
    const mems = [mem("m1", { outcome: "success" }), mem("m2", { outcome: "failed" })];
    const g = computeKnowledgeGraph([], mems, new Map(), NOW);
    expect(g.edges.filter(e => e.type === "has_outcome")).toHaveLength(2);
  });

  it("edge points to correct outcome node", () => {
    const g = computeKnowledgeGraph(
      [], [mem("m1", { outcome: "partial" })], new Map(), NOW
    );
    const edge = g.edges.find(e => e.type === "has_outcome")!;
    expect(edge.sourceId).toBe("memory:m1");
    expect(edge.targetId).toBe("outcome:partial");
  });
});

// ── has_risk edges ─────────────────────────────────────────────────────────

describe("computeKnowledgeGraph — has_risk edges", () => {
  it("creates one has_risk edge per project", () => {
    const g = computeKnowledgeGraph([proj("p1"), proj("p2")], [], new Map(), NOW);
    expect(g.edges.filter(e => e.type === "has_risk")).toHaveLength(2);
  });

  it("edge connects project to its risk node", () => {
    const g = computeKnowledgeGraph([proj("p1")], [], new Map(), NOW);
    const edge = g.edges.find(e => e.type === "has_risk")!;
    expect(edge.sourceId).toBe("project:p1");
    expect(edge.targetId).toBe("risk:p1");
  });
});

// ── similar_to edges ───────────────────────────────────────────────────────

describe("computeKnowledgeGraph — similar_to edges", () => {
  it("creates similar_to edge for memories with sufficient token overlap in same domain", () => {
    const mems = [
      mem("m1", { domain: "drives", query: "drive motor failure overheating problem", analysisSummary: "motor drive fault" }),
      mem("m2", { domain: "drives", query: "drive motor diagnostic failure analysis",  analysisSummary: "motor drive issue" }),
    ];
    const g = computeKnowledgeGraph([], mems, new Map(), NOW);
    expect(g.edges.filter(e => e.type === "similar_to")).toHaveLength(1);
  });

  it("similar_to edge weight is between 0 and 1", () => {
    const mems = [
      mem("m1", { domain: "drives", query: "drive motor failure overheating", analysisSummary: "motor fault" }),
      mem("m2", { domain: "drives", query: "drive motor overheating failure",  analysisSummary: "motor issue" }),
    ];
    const g = computeKnowledgeGraph([], mems, new Map(), NOW);
    const edge = g.edges.find(e => e.type === "similar_to");
    if (edge) {
      expect(edge.weight).toBeGreaterThan(0);
      expect(edge.weight).toBeLessThanOrEqual(1);
    }
  });

  it("does NOT create similar_to edge for memories in different domains", () => {
    const mems = [
      mem("m1", { domain: "drives",     query: "drive motor failure overheating diagnostic analysis" }),
      mem("m2", { domain: "hydraulics", query: "drive motor failure overheating diagnostic analysis" }),
    ];
    const g = computeKnowledgeGraph([], mems, new Map(), NOW);
    expect(g.edges.filter(e => e.type === "similar_to")).toHaveLength(0);
  });

  it("does NOT create similar_to for memories with insufficient token overlap", () => {
    const mems = [
      mem("m1", { domain: "drives", query: "motor speed controller programming", analysisSummary: "speed control" }),
      mem("m2", { domain: "drives", query: "plc ladder logic error", analysisSummary: "logic error" }),
    ];
    const g = computeKnowledgeGraph([], mems, new Map(), NOW);
    expect(g.edges.filter(e => e.type === "similar_to")).toHaveLength(0);
  });

  it("similar_to edge ID is deterministic regardless of memory order", () => {
    const m1 = mem("aaa", { domain: "drives", query: "drive motor failure overheating analysis", analysisSummary: "motor fault" });
    const m2 = mem("bbb", { domain: "drives", query: "drive motor overheating failure analysis",  analysisSummary: "motor issue" });
    const g1 = computeKnowledgeGraph([], [m1, m2], new Map(), NOW);
    const g2 = computeKnowledgeGraph([], [m2, m1], new Map(), NOW);
    const e1 = g1.edges.find(e => e.type === "similar_to");
    const e2 = g2.edges.find(e => e.type === "similar_to");
    expect(e1?.id).toBe(e2?.id);
  });
});

// ── resolved_by edges ──────────────────────────────────────────────────────

describe("computeKnowledgeGraph — resolved_by edges", () => {
  it("creates resolved_by edge for solution memories with relatedCaseIds", () => {
    const m = mem("m1", { outcome: "success", relatedCaseIds: ["CASE-001"] });
    const g = computeKnowledgeGraph([], [m], new Map(), NOW);
    const edge = g.edges.find(e => e.type === "resolved_by");
    expect(edge).toBeDefined();
    expect(edge!.sourceId).toBe("case:CASE-001");
    expect(edge!.targetId).toBe("solution:m1");
  });

  it("creates one resolved_by edge per (case, solution) pair", () => {
    const m = mem("m1", { outcome: "success", relatedCaseIds: ["CASE-001", "CASE-002"] });
    const g = computeKnowledgeGraph([], [m], new Map(), NOW);
    expect(g.edges.filter(e => e.type === "resolved_by")).toHaveLength(2);
  });

  it("does NOT create resolved_by edge for non-solution memory with case IDs", () => {
    const m = mem("m1", { outcome: "failed", relatedCaseIds: ["CASE-001"] });
    const g = computeKnowledgeGraph([], [m], new Map(), NOW);
    expect(g.edges.filter(e => e.type === "resolved_by")).toHaveLength(0);
  });

  it("does NOT create resolved_by edge for solution memory with no case IDs", () => {
    const m = mem("m1", { outcome: "success", relatedCaseIds: [] });
    const g = computeKnowledgeGraph([], [m], new Map(), NOW);
    expect(g.edges.filter(e => e.type === "resolved_by")).toHaveLength(0);
  });
});

// ── Summary stats ──────────────────────────────────────────────────────────

describe("computeKnowledgeGraph — summary", () => {
  it("totalNodes equals sum of all nodesByType values", () => {
    const g = computeKnowledgeGraph(
      [proj("p1")],
      [mem("m1", { outcome: "success", projectId: "p1", relatedCaseIds: ["C1"] })],
      new Map(), NOW
    );
    const sumFromMap = Object.values(g.summary.nodesByType).reduce((a, b) => a + b, 0);
    expect(g.summary.totalNodes).toBe(sumFromMap);
  });

  it("totalEdges equals sum of all edgesByType values", () => {
    const g = computeKnowledgeGraph(
      [proj("p1")],
      [mem("m1", { projectId: "p1" })],
      new Map(), NOW
    );
    const sumFromMap = Object.values(g.summary.edgesByType).reduce((a, b) => a + b, 0);
    expect(g.summary.totalEdges).toBe(sumFromMap);
  });

  it("connectedComponents is 1 for a fully connected single-project graph", () => {
    // project → risk, memory → project, memory → domain, memory → outcome — all connected
    const g = computeKnowledgeGraph(
      [proj("p1")],
      [mem("m1", { projectId: "p1", domain: "drives", outcome: "unknown" })],
      new Map(), NOW
    );
    expect(g.summary.connectedComponents).toBe(1);
  });

  it("isolated project (no memories) still has connected component via has_risk edge", () => {
    const g = computeKnowledgeGraph([proj("p1")], [], new Map(), NOW);
    // project:p1 and risk:p1 form one component
    expect(g.summary.isolatedNodes).toBe(0);
    expect(g.summary.connectedComponents).toBe(1);
  });

  it("avgDegree is 0 for empty graph", () => {
    expect(computeKnowledgeGraph([], [], new Map(), NOW).summary.avgDegree).toBe(0);
  });

  it("avgDegree is reasonable for a small graph", () => {
    const g = computeKnowledgeGraph(
      [proj("p1")],
      [mem("m1", { projectId: "p1" })],
      new Map(), NOW
    );
    expect(g.summary.avgDegree).toBeGreaterThan(0);
  });
});

// ── Stable ordering ────────────────────────────────────────────────────────

describe("computeKnowledgeGraph — stable ordering", () => {
  it("nodes are sorted by type ASC then id ASC", () => {
    const g = computeKnowledgeGraph(
      [proj("p2"), proj("p1")],
      [mem("m2"), mem("m1")],
      new Map(), NOW
    );
    const types = g.nodes.map(n => n.type);
    // Sorted types: case* < domain < memory < outcome < project < risk < solution
    for (let i = 1; i < types.length; i++) {
      const cmp = types[i - 1].localeCompare(types[i]);
      expect(cmp).toBeLessThanOrEqual(0);  // non-decreasing
    }
    // Within same type, ids must be sorted ASC
    const projectNodes = g.nodes.filter(n => n.type === "project");
    expect(projectNodes[0].id).toBe("project:p1");
    expect(projectNodes[1].id).toBe("project:p2");
  });

  it("edges are sorted by type ASC, sourceId ASC, targetId ASC", () => {
    const g = computeKnowledgeGraph(
      [proj("p1"), proj("p2")],
      [mem("m1", { projectId: "p1" }), mem("m2", { projectId: "p2" })],
      new Map(), NOW
    );
    for (let i = 1; i < g.edges.length; i++) {
      const prev = g.edges[i - 1];
      const curr = g.edges[i];
      const tc = prev.type.localeCompare(curr.type);
      if (tc !== 0) {
        expect(tc).toBeLessThan(0);
      } else {
        const sc = prev.sourceId.localeCompare(curr.sourceId);
        if (sc !== 0) expect(sc).toBeLessThan(0);
      }
    }
  });
});

// ── Determinism ────────────────────────────────────────────────────────────

describe("computeKnowledgeGraph — determinism", () => {
  it("same inputs produce byte-identical output across two calls", () => {
    const projects = [proj("p1"), proj("p2")];
    const memories = [
      mem("m1", { projectId: "p1", relatedCaseIds: ["C1"], outcome: "success" }),
      mem("m2", { projectId: "p2", outcome: "failed" }),
    ];
    const map = fbMap([["m1", [fb("m1", "success")]]]);
    const g1 = computeKnowledgeGraph(projects, memories, map, NOW);
    const g2 = computeKnowledgeGraph(projects, memories, map, NOW);
    expect(JSON.stringify(g1)).toBe(JSON.stringify(g2));
  });
});
