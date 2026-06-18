import { describe, it, expect } from "vitest";
import { computeGraphAnalytics } from "../graph-analytics";
import type { KnowledgeGraph, GraphNode, GraphEdge } from "../knowledge-graph";

// ── Graph builder helpers ──────────────────────────────────────────────────

function n(id: string, type: GraphNode["type"], label: string, props: Record<string, string | number> = {}): GraphNode {
  return { id, type, label, properties: props };
}
function e(type: GraphEdge["type"], src: string, tgt: string, w = 1): GraphEdge {
  return { id: `${type}:${src}:${tgt}`, type, sourceId: src, targetId: tgt, weight: w };
}

function makeGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  components = 1
): KnowledgeGraph {
  const nt = Object.fromEntries(
    (["project","memory","domain","case","risk","outcome","solution"] as GraphNode["type"][])
      .map(t => [t, nodes.filter(n => n.type === t).length])
  ) as KnowledgeGraph["summary"]["nodesByType"];

  const et = Object.fromEntries(
    (["belongs_to_project","related_to_domain","has_outcome","has_risk","similar_to","resolved_by"] as GraphEdge["type"][])
      .map(t => [t, edges.filter(e => e.type === t).length])
  ) as KnowledgeGraph["summary"]["edgesByType"];

  return {
    nodes, edges,
    summary: {
      totalNodes: nodes.length, totalEdges: edges.length,
      nodesByType: nt, edgesByType: et,
      connectedComponents: components, avgDegree: 0, isolatedNodes: 0,
    },
  };
}

const EMPTY: KnowledgeGraph = makeGraph([], [], 0);

// ── Minimal single-project graph ───────────────────────────────────────────
// project:p1 --[has_risk]--> risk:p1
// memory:m1  --[belongs_to_project]--> project:p1
// memory:m1  --[related_to_domain]--> domain:drives
// memory:m1  --[has_outcome]--> outcome:unknown
// memory:m2  --[related_to_domain]--> domain:drives
// memory:m2  --[has_outcome]--> outcome:success

const DOMAIN_DRIVES = n("domain:drives", "domain", "drives", {
  memoryCount: 2, avgConfidence: 75, successRate: 50,
});

const SINGLE_PROJECT = makeGraph(
  [
    n("project:p1",      "project",  "P1"),
    n("risk:p1",         "risk",     "P1 Risk"),
    n("memory:m1",       "memory",   "M1",  { confidence: 70 }),
    n("memory:m2",       "memory",   "M2",  { confidence: 80 }),
    DOMAIN_DRIVES,
    n("outcome:unknown", "outcome",  "unknown"),
    n("outcome:success", "outcome",  "success"),
  ],
  [
    e("has_risk",           "project:p1", "risk:p1"),
    e("belongs_to_project", "memory:m1",  "project:p1"),
    e("related_to_domain",  "memory:m1",  "domain:drives"),
    e("related_to_domain",  "memory:m2",  "domain:drives"),
    e("has_outcome",        "memory:m1",  "outcome:unknown"),
    e("has_outcome",        "memory:m2",  "outcome:success"),
  ],
  1   // single connected component (m2 reaches via domain:drives)
);

// ── Empty graph ────────────────────────────────────────────────────────────

describe("computeGraphAnalytics — empty graph", () => {
  it("returns empty arrays and zero health scores", () => {
    const r = computeGraphAnalytics(EMPTY);
    expect(r.centrality).toEqual([]);
    expect(r.domainHealth).toEqual([]);
    expect(r.projectConnectivity).toEqual([]);
    expect(r.health.overallScore).toBe(0);
    expect(r.health.coverageScore).toBe(0);
    expect(r.health.connectivityScore).toBe(0);
    expect(r.health.qualityScore).toBe(0);
    expect(r.health.insights).toEqual([]);
  });
});

// ── Centrality ─────────────────────────────────────────────────────────────

describe("computeGraphAnalytics — centrality", () => {
  it("returns one entry per node", () => {
    const { centrality } = computeGraphAnalytics(SINGLE_PROJECT);
    expect(centrality.length).toBe(SINGLE_PROJECT.nodes.length);
  });

  it("sorted by degree DESC then nodeId ASC", () => {
    const { centrality } = computeGraphAnalytics(SINGLE_PROJECT);
    for (let i = 1; i < centrality.length; i++) {
      const prev = centrality[i - 1];
      const cur  = centrality[i];
      if (prev.degree === cur.degree) {
        expect(prev.nodeId.localeCompare(cur.nodeId)).toBeLessThanOrEqual(0);
      } else {
        expect(prev.degree).toBeGreaterThanOrEqual(cur.degree);
      }
    }
  });

  it("highest-degree node is memory:m1 (4 edges)", () => {
    // memory:m1: belongs_to_project(1) + related_to_domain(1) + has_outcome(1) = 3 outgoing
    // Let's verify by adding similar_to edge
    const g = makeGraph(
      [...SINGLE_PROJECT.nodes],
      [...SINGLE_PROJECT.edges, e("similar_to", "memory:m1", "memory:m2", 0.5)],
      1
    );
    const { centrality } = computeGraphAnalytics(g);
    expect(centrality[0].nodeId).toBe("memory:m1");
    expect(centrality[0].degree).toBe(4);
  });

  it("includes nodeType and label on each entry", () => {
    const { centrality } = computeGraphAnalytics(SINGLE_PROJECT);
    const proj = centrality.find(c => c.nodeId === "project:p1")!;
    expect(proj.nodeType).toBe("project");
    expect(proj.label).toBe("P1");
  });

  it("tie-break: domain:drives before project:p1 at same degree", () => {
    // Both have degree 2 in SINGLE_PROJECT: project:p1(has_risk + belongs_to_project) and domain:drives(two related_to_domain)
    const { centrality } = computeGraphAnalytics(SINGLE_PROJECT);
    const dIdx = centrality.findIndex(c => c.nodeId === "domain:drives");
    const pIdx = centrality.findIndex(c => c.nodeId === "project:p1");
    // "domain:drives" < "project:p1" alphabetically
    expect(dIdx).toBeLessThan(pIdx);
  });

  it("isolated node has degree 0", () => {
    const g = makeGraph(
      [...SINGLE_PROJECT.nodes, n("project:lone", "project", "Lone")],
      [...SINGLE_PROJECT.edges],
      2
    );
    const { centrality } = computeGraphAnalytics(g);
    const lone = centrality.find(c => c.nodeId === "project:lone")!;
    expect(lone.degree).toBe(0);
    expect(lone.nodeId).toBe("project:lone");
  });
});

// ── Domain health ──────────────────────────────────────────────────────────

describe("computeGraphAnalytics — domainHealth", () => {
  it("returns one entry per domain node", () => {
    const { domainHealth } = computeGraphAnalytics(SINGLE_PROJECT);
    expect(domainHealth).toHaveLength(1);
    expect(domainHealth[0].domain).toBe("drives");
  });

  it("healthScore = round((avgConfidence + successRate) / 2)", () => {
    const { domainHealth } = computeGraphAnalytics(SINGLE_PROJECT);
    const d = domainHealth[0];
    expect(d.healthScore).toBe(Math.round((75 + 50) / 2)); // 63
  });

  it("connectionCount equals degree of domain node", () => {
    const { domainHealth } = computeGraphAnalytics(SINGLE_PROJECT);
    expect(domainHealth[0].connectionCount).toBe(2); // m1 + m2
  });

  it("memoryCount, avgConfidence, successRate from node properties", () => {
    const { domainHealth } = computeGraphAnalytics(SINGLE_PROJECT);
    const d = domainHealth[0];
    expect(d.memoryCount).toBe(2);
    expect(d.avgConfidence).toBe(75);
    expect(d.successRate).toBe(50);
  });

  it("sorted by healthScore DESC then domain ASC", () => {
    const domA = n("domain:aaa", "domain", "aaa", { memoryCount: 1, avgConfidence: 80, successRate: 80 });
    const domB = n("domain:bbb", "domain", "bbb", { memoryCount: 1, avgConfidence: 20, successRate: 20 });
    const g = makeGraph([domA, domB], [], 2);
    const { domainHealth } = computeGraphAnalytics(g);
    expect(domainHealth[0].domain).toBe("aaa"); // healthScore=80
    expect(domainHealth[1].domain).toBe("bbb"); // healthScore=20
  });

  it("stable sort: alphabetical tie-break", () => {
    const domA = n("domain:alpha", "domain", "alpha", { memoryCount: 2, avgConfidence: 60, successRate: 60 });
    const domB = n("domain:beta",  "domain", "beta",  { memoryCount: 2, avgConfidence: 60, successRate: 60 });
    const g = makeGraph([domB, domA], [], 2);
    const { domainHealth } = computeGraphAnalytics(g);
    expect(domainHealth[0].domain).toBe("alpha");
    expect(domainHealth[1].domain).toBe("beta");
  });

  it("empty domainHealth when no domain nodes", () => {
    const g = makeGraph([n("project:p1", "project", "P1")], [], 1);
    expect(computeGraphAnalytics(g).domainHealth).toEqual([]);
  });
});

// ── Project connectivity ───────────────────────────────────────────────────

describe("computeGraphAnalytics — projectConnectivity", () => {
  it("returns one entry per project node", () => {
    const { projectConnectivity } = computeGraphAnalytics(SINGLE_PROJECT);
    expect(projectConnectivity).toHaveLength(1);
    expect(projectConnectivity[0].projectId).toBe("p1");
  });

  it("projectName is the project node label", () => {
    const { projectConnectivity } = computeGraphAnalytics(SINGLE_PROJECT);
    expect(projectConnectivity[0].projectName).toBe("P1");
  });

  it("reachableNodes counts BFS-reachable nodes excluding self", () => {
    // project:p1 in SINGLE_PROJECT reaches: risk:p1, memory:m1, memory:m2, domain:drives,
    // outcome:unknown, outcome:success — that's 6 out of 7 total (cannot reach self)
    const { projectConnectivity } = computeGraphAnalytics(SINGLE_PROJECT);
    expect(projectConnectivity[0].reachableNodes).toBe(6);
  });

  it("directEdges equals undirected degree of project node", () => {
    // project:p1: has_risk (outbound) + belongs_to_project (inbound) = degree 2
    const { projectConnectivity } = computeGraphAnalytics(SINGLE_PROJECT);
    expect(projectConnectivity[0].directEdges).toBe(2);
  });

  it("isolationScore = 0 when project reaches all other nodes", () => {
    // project:p1 reaches 6 out of 6 others (total 7, totalNodes-1=6)
    const { projectConnectivity } = computeGraphAnalytics(SINGLE_PROJECT);
    expect(projectConnectivity[0].isolationScore).toBe(0);
  });

  it("isolationScore = 100 for completely isolated project (single node)", () => {
    const g = makeGraph([n("project:lone", "project", "Lone")], [], 1);
    const { projectConnectivity } = computeGraphAnalytics(g);
    // reachableNodes=0, totalNodes=1, isolationScore=round((1 - 0/max(0,1))*100)=100
    expect(projectConnectivity[0].isolationScore).toBe(100);
  });

  it("sorted by reachableNodes DESC then projectId ASC", () => {
    const g = makeGraph(
      [
        n("project:p2",   "project", "P2"),
        n("project:p1",   "project", "P1"),
        n("risk:p1",      "risk",    "P1 Risk"),
        n("risk:p2",      "risk",    "P2 Risk"),
        n("memory:m1",    "memory",  "M1", { confidence: 70 }),
      ],
      [
        e("has_risk",           "project:p1",  "risk:p1"),
        e("has_risk",           "project:p2",  "risk:p2"),
        e("belongs_to_project", "memory:m1",   "project:p1"),
      ],
      2
    );
    const { projectConnectivity } = computeGraphAnalytics(g);
    // p1 reaches: risk:p1, memory:m1 → 2; p2 reaches: risk:p2 → 1
    expect(projectConnectivity[0].projectId).toBe("p1");
    expect(projectConnectivity[1].projectId).toBe("p2");
  });
});

// ── Health scores ──────────────────────────────────────────────────────────

describe("computeGraphAnalytics — health scores", () => {
  it("coverageScore=100 when all memories are linked to a project", () => {
    // SINGLE_PROJECT: only memory:m1 is linked, memory:m2 is not → 50%
    // Let's test with a graph where all are linked
    const g = makeGraph(
      [
        n("project:p1",  "project", "P1"),
        n("memory:m1",   "memory",  "M1", { confidence: 80 }),
      ],
      [e("belongs_to_project", "memory:m1", "project:p1")],
      1
    );
    expect(computeGraphAnalytics(g).health.coverageScore).toBe(100);
  });

  it("coverageScore=0 when no memories are linked to any project", () => {
    const g = makeGraph(
      [n("memory:m1", "memory", "M1", { confidence: 70 })],
      [],
      1
    );
    expect(computeGraphAnalytics(g).health.coverageScore).toBe(0);
  });

  it("coverageScore=100 when no memory nodes exist", () => {
    const g = makeGraph([n("project:p1", "project", "P1")], [], 1);
    expect(computeGraphAnalytics(g).health.coverageScore).toBe(100);
  });

  it("coverageScore=50 when half of memories are project-linked", () => {
    expect(computeGraphAnalytics(SINGLE_PROJECT).health.coverageScore).toBe(50);
  });

  it("connectivityScore=100 for single connected component", () => {
    expect(computeGraphAnalytics(SINGLE_PROJECT).health.connectivityScore).toBe(100);
  });

  it("connectivityScore=80 for two components", () => {
    const g = makeGraph(
      SINGLE_PROJECT.nodes,
      SINGLE_PROJECT.edges,
      2  // two components
    );
    expect(computeGraphAnalytics(g).health.connectivityScore).toBe(80);
  });

  it("connectivityScore floors at 0 for 6+ components", () => {
    const g = makeGraph(SINGLE_PROJECT.nodes, SINGLE_PROJECT.edges, 6);
    expect(computeGraphAnalytics(g).health.connectivityScore).toBe(0);
  });

  it("qualityScore = avg confidence of memory nodes", () => {
    // m1=70, m2=80 → avg=75
    expect(computeGraphAnalytics(SINGLE_PROJECT).health.qualityScore).toBe(75);
  });

  it("qualityScore=0 when no memory nodes", () => {
    const g = makeGraph([n("project:p1", "project", "P1")], [], 1);
    expect(computeGraphAnalytics(g).health.qualityScore).toBe(0);
  });

  it("overallScore = round(coverage×0.3 + connectivity×0.4 + quality×0.3)", () => {
    const { health } = computeGraphAnalytics(SINGLE_PROJECT);
    const expected = Math.round(
      health.coverageScore * 0.3 + health.connectivityScore * 0.4 + health.qualityScore * 0.3
    );
    expect(health.overallScore).toBe(expected);
  });
});

// ── Insights ───────────────────────────────────────────────────────────────

describe("computeGraphAnalytics — insights", () => {
  it("hub_node insight fires for graph with edges", () => {
    const { health } = computeGraphAnalytics(SINGLE_PROJECT);
    const hub = health.insights.find(i => i.type === "hub_node");
    expect(hub).toBeDefined();
    expect(hub!.nodeId).toBeDefined();
  });

  it("hub_node insight does NOT fire for edgeless graph", () => {
    const g = makeGraph([n("project:p1", "project", "P1")], [], 1);
    const { health } = computeGraphAnalytics(g);
    expect(health.insights.find(i => i.type === "hub_node")).toBeUndefined();
  });

  it("isolated_project insight fires for project with no memory connections", () => {
    const g = makeGraph(
      [n("project:lone", "project", "Lone"), n("risk:lone", "risk", "Risk")],
      [e("has_risk", "project:lone", "risk:lone")],
      1
    );
    const insight = computeGraphAnalytics(g).health.insights.find(i => i.type === "isolated_project");
    expect(insight).toBeDefined();
    expect(insight!.nodeId).toBe("project:lone");
  });

  it("isolated_project insight does NOT fire when project has linked memory", () => {
    const g = makeGraph(
      [n("project:p1", "project", "P1"), n("memory:m1", "memory", "M1", { confidence: 70 })],
      [e("belongs_to_project", "memory:m1", "project:p1")],
      1
    );
    expect(computeGraphAnalytics(g).health.insights.find(i => i.type === "isolated_project")).toBeUndefined();
  });

  it("knowledge_depth fires when a domain has ≥ 2 memories", () => {
    const { health } = computeGraphAnalytics(SINGLE_PROJECT); // drives has 2
    const kd = health.insights.find(i => i.type === "knowledge_depth");
    expect(kd).toBeDefined();
    expect(kd!.nodeId).toBe("domain:drives");
  });

  it("knowledge_depth does NOT fire when all domains have < 2 memories", () => {
    const g = makeGraph(
      [n("domain:solo", "domain", "solo", { memoryCount: 1, avgConfidence: 70, successRate: 60 })],
      [],
      1
    );
    expect(computeGraphAnalytics(g).health.insights.find(i => i.type === "knowledge_depth")).toBeUndefined();
  });

  it("domain_gap fires when a domain has healthScore < 40", () => {
    const g = makeGraph(
      [n("domain:bad", "domain", "bad", { memoryCount: 1, avgConfidence: 20, successRate: 30 })],
      [],
      1
    );
    const insight = computeGraphAnalytics(g).health.insights.find(i => i.type === "domain_gap");
    expect(insight).toBeDefined();
    expect(insight!.nodeId).toBe("domain:bad");
  });

  it("domain_gap does NOT fire when all domains score ≥ 40", () => {
    const g = makeGraph(
      [n("domain:ok", "domain", "ok", { memoryCount: 2, avgConfidence: 80, successRate: 80 })],
      [],
      1
    );
    expect(computeGraphAnalytics(g).health.insights.find(i => i.type === "domain_gap")).toBeUndefined();
  });

  it("orphan_memories fires when a memory has no belongs_to_project edge", () => {
    // memory:m2 in SINGLE_PROJECT has no project
    const { health } = computeGraphAnalytics(SINGLE_PROJECT);
    const orphan = health.insights.find(i => i.type === "orphan_memories");
    expect(orphan).toBeDefined();
    expect(orphan!.message).toContain("1 memory is");
  });

  it("orphan_memories does NOT fire when all memories are linked", () => {
    const g = makeGraph(
      [n("project:p1", "project", "P1"), n("memory:m1", "memory", "M1", { confidence: 70 })],
      [e("belongs_to_project", "memory:m1", "project:p1")],
      1
    );
    expect(computeGraphAnalytics(g).health.insights.find(i => i.type === "orphan_memories")).toBeUndefined();
  });

  it("orphan_memories does NOT fire when no memory nodes exist", () => {
    const g = makeGraph([n("project:p1", "project", "P1")], [], 1);
    expect(computeGraphAnalytics(g).health.insights.find(i => i.type === "orphan_memories")).toBeUndefined();
  });

  it("all insight types have message and type fields", () => {
    const { health } = computeGraphAnalytics(SINGLE_PROJECT);
    for (const insight of health.insights) {
      expect(typeof insight.type).toBe("string");
      expect(typeof insight.message).toBe("string");
      expect(insight.message.length).toBeGreaterThan(0);
    }
  });
});

// ── Determinism ────────────────────────────────────────────────────────────

describe("computeGraphAnalytics — determinism", () => {
  it("same graph produces byte-identical output on two calls", () => {
    const r1 = computeGraphAnalytics(SINGLE_PROJECT);
    const r2 = computeGraphAnalytics(SINGLE_PROJECT);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it("reversed node/edge arrays produce same output", () => {
    const reversed = makeGraph(
      [...SINGLE_PROJECT.nodes].reverse(),
      [...SINGLE_PROJECT.edges].reverse(),
      1
    );
    const r1 = computeGraphAnalytics(SINGLE_PROJECT);
    const r2 = computeGraphAnalytics(reversed);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});
