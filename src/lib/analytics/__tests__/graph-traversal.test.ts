import { describe, it, expect } from "vitest";
import {
  getNodeDetails,
  getNeighbors,
  findShortestPath,
} from "../graph-traversal";
import type { KnowledgeGraph, GraphNode, GraphEdge } from "../knowledge-graph";

// ── Minimal graph fixture ──────────────────────────────────────────────────
//
//  project:p1 --[has_risk]--> risk:p1
//  memory:m1  --[belongs_to_project]--> project:p1
//  memory:m1  --[related_to_domain]-->  domain:drives
//  memory:m1  --[has_outcome]-->        outcome:unknown
//  memory:m2  --[related_to_domain]-->  domain:drives
//  memory:m2  --[has_outcome]-->        outcome:success
//  memory:m1  --[similar_to]-->         memory:m2
//  case:C1    --[resolved_by]-->        solution:m2
//

function n(id: string, type: GraphNode["type"], label: string): GraphNode {
  return { id, type, label, properties: {} };
}
function e(
  type: GraphEdge["type"],
  src: string,
  tgt: string,
  weight = 1
): GraphEdge {
  return { id: `${type}:${src}:${tgt}`, type, sourceId: src, targetId: tgt, weight };
}

const NODES: GraphNode[] = [
  n("project:p1",      "project",  "P1"),
  n("risk:p1",         "risk",     "P1 Risk"),
  n("memory:m1",       "memory",   "M1"),
  n("memory:m2",       "memory",   "M2"),
  n("domain:drives",   "domain",   "drives"),
  n("outcome:unknown", "outcome",  "unknown"),
  n("outcome:success", "outcome",  "success"),
  n("solution:m2",     "solution", "Solution M2"),
  n("case:C1",         "case",     "C1"),
];

const EDGES: GraphEdge[] = [
  e("has_risk",            "project:p1",  "risk:p1"),
  e("belongs_to_project",  "memory:m1",   "project:p1"),
  e("related_to_domain",   "memory:m1",   "domain:drives"),
  e("related_to_domain",   "memory:m2",   "domain:drives"),
  e("has_outcome",         "memory:m1",   "outcome:unknown"),
  e("has_outcome",         "memory:m2",   "outcome:success"),
  e("similar_to",          "memory:m1",   "memory:m2", 0.4),
  e("resolved_by",         "case:C1",     "solution:m2"),
];

const STUB_SUMMARY: KnowledgeGraph["summary"] = {
  totalNodes: NODES.length, totalEdges: EDGES.length,
  nodesByType:  { project: 1, memory: 2, domain: 1, case: 1, risk: 1, outcome: 2, solution: 1 },
  edgesByType:  { has_risk: 1, belongs_to_project: 1, related_to_domain: 2, has_outcome: 2, similar_to: 1, resolved_by: 1 },
  connectedComponents: 2, avgDegree: 0, isolatedNodes: 0,
};

const G: KnowledgeGraph = { nodes: NODES, edges: EDGES, summary: STUB_SUMMARY };
const EMPTY: KnowledgeGraph = {
  nodes: [], edges: [],
  summary: {
    totalNodes: 0, totalEdges: 0,
    nodesByType:  { project: 0, memory: 0, domain: 0, case: 0, risk: 0, outcome: 0, solution: 0 },
    edgesByType:  { belongs_to_project: 0, related_to_domain: 0, has_outcome: 0, has_risk: 0, similar_to: 0, resolved_by: 0 },
    connectedComponents: 0, avgDegree: 0, isolatedNodes: 0,
  },
};

// ── getNodeDetails ─────────────────────────────────────────────────────────

describe("getNodeDetails — not found", () => {
  it("returns null for empty graph", () => {
    expect(getNodeDetails(EMPTY, "project:p1")).toBeNull();
  });

  it("returns null for unknown nodeId", () => {
    expect(getNodeDetails(G, "project:ghost")).toBeNull();
  });
});

describe("getNodeDetails — found", () => {
  it("returns the correct node", () => {
    const result = getNodeDetails(G, "project:p1")!;
    expect(result.node.id).toBe("project:p1");
    expect(result.node.type).toBe("project");
    expect(result.node.label).toBe("P1");
  });

  it("includes outbound edges", () => {
    const result = getNodeDetails(G, "project:p1")!;
    const outbound = result.edges.filter(e => e.direction === "outbound");
    expect(outbound).toHaveLength(1);
    expect(outbound[0].type).toBe("has_risk");
    expect(outbound[0].targetId).toBe("risk:p1");
  });

  it("includes inbound edges", () => {
    const result = getNodeDetails(G, "project:p1")!;
    const inbound = result.edges.filter(e => e.direction === "inbound");
    expect(inbound).toHaveLength(1);
    expect(inbound[0].type).toBe("belongs_to_project");
    expect(inbound[0].sourceId).toBe("memory:m1");
  });

  it("stats reflect inbound / outbound counts", () => {
    const { stats } = getNodeDetails(G, "project:p1")!;
    expect(stats.inboundEdges).toBe(1);
    expect(stats.outboundEdges).toBe(1);
    expect(stats.totalEdges).toBe(2);
  });

  it("domain node has only inbound edges (related_to_domain)", () => {
    const { edges, stats } = getNodeDetails(G, "domain:drives")!;
    expect(stats.outboundEdges).toBe(0);
    expect(stats.inboundEdges).toBe(2);
    expect(edges.every(e => e.direction === "inbound")).toBe(true);
  });

  it("node with no edges returns empty edge list and zero stats", () => {
    const isolated: KnowledgeGraph = {
      ...G,
      nodes: [...G.nodes, n("project:lone", "project", "Lone")],
    };
    const result = getNodeDetails(isolated, "project:lone")!;
    expect(result.edges).toEqual([]);
    expect(result.stats.totalEdges).toBe(0);
  });

  it("edges are sorted by type then sourceId then targetId", () => {
    const result = getNodeDetails(G, "memory:m1")!;
    for (let i = 1; i < result.edges.length; i++) {
      const a = result.edges[i - 1];
      const b = result.edges[i];
      const key = (x: typeof a) => `${x.type}\x00${x.sourceId}\x00${x.targetId}`;
      expect(key(a).localeCompare(key(b))).toBeLessThanOrEqual(0);
    }
  });
});

// ── getNeighbors ───────────────────────────────────────────────────────────

describe("getNeighbors — not found", () => {
  it("returns null for empty graph", () => {
    expect(getNeighbors(EMPTY, "project:p1")).toBeNull();
  });

  it("returns null for unknown nodeId", () => {
    expect(getNeighbors(G, "memory:ghost")).toBeNull();
  });
});

describe("getNeighbors — found", () => {
  it("project:p1 neighbors: risk:p1 (outbound) and memory:m1 (inbound)", () => {
    const { neighbors } = getNeighbors(G, "project:p1")!;
    const ids = neighbors.map(nb => nb.node.id).sort();
    expect(ids).toEqual(["memory:m1", "risk:p1"]);
  });

  it("outbound neighbor has direction outbound", () => {
    const { neighbors } = getNeighbors(G, "project:p1")!;
    const riskEntry = neighbors.find(nb => nb.node.id === "risk:p1")!;
    expect(riskEntry.edge.direction).toBe("outbound");
  });

  it("inbound neighbor has direction inbound", () => {
    const { neighbors } = getNeighbors(G, "project:p1")!;
    const memEntry = neighbors.find(nb => nb.node.id === "memory:m1")!;
    expect(memEntry.edge.direction).toBe("inbound");
  });

  it("stats.totalNeighbors matches neighbors array length", () => {
    const result = getNeighbors(G, "memory:m1")!;
    expect(result.stats.totalNeighbors).toBe(result.neighbors.length);
  });

  it("memory:m1 has 4 neighbors: project:p1, domain:drives, outcome:unknown, memory:m2", () => {
    const { neighbors } = getNeighbors(G, "memory:m1")!;
    const ids = neighbors.map(nb => nb.node.id).sort();
    expect(ids).toEqual([
      "domain:drives",
      "memory:m2",
      "outcome:unknown",
      "project:p1",
    ]);
  });

  it("domain:drives has 2 neighbors (memory:m1 and memory:m2, both inbound)", () => {
    const { neighbors } = getNeighbors(G, "domain:drives")!;
    expect(neighbors).toHaveLength(2);
    expect(neighbors.every(nb => nb.edge.direction === "inbound")).toBe(true);
  });

  it("neighbors are sorted by node type then node id", () => {
    const { neighbors } = getNeighbors(G, "memory:m1")!;
    for (let i = 1; i < neighbors.length; i++) {
      const a = neighbors[i - 1].node;
      const b = neighbors[i].node;
      const tc = a.type.localeCompare(b.type);
      if (tc !== 0) expect(tc).toBeLessThan(0);
      else expect(a.id.localeCompare(b.id)).toBeLessThanOrEqual(0);
    }
  });

  it("isolated node has empty neighbors", () => {
    const isolated: KnowledgeGraph = {
      ...G,
      nodes: [...G.nodes, n("project:lone", "project", "Lone")],
    };
    const result = getNeighbors(isolated, "project:lone")!;
    expect(result.neighbors).toEqual([]);
    expect(result.stats.totalNeighbors).toBe(0);
  });
});

// ── findShortestPath ───────────────────────────────────────────────────────

describe("findShortestPath — null cases", () => {
  it("returns null when fromId not in graph", () => {
    expect(findShortestPath(G, "project:ghost", "risk:p1")).toBeNull();
  });

  it("returns null when toId not in graph", () => {
    expect(findShortestPath(G, "project:p1", "domain:ghost")).toBeNull();
  });

  it("returns null for empty graph", () => {
    expect(findShortestPath(EMPTY, "project:p1", "risk:p1")).toBeNull();
  });

  it("returns null when nodes are disconnected", () => {
    // project:p1 component and case:C1/solution:m2 component are disconnected
    const result = findShortestPath(G, "project:p1", "case:C1");
    expect(result).toBeNull();
  });
});

describe("findShortestPath — same node", () => {
  it("returns path of length 0 with one node and no edges", () => {
    const result = findShortestPath(G, "project:p1", "project:p1")!;
    expect(result.length).toBe(0);
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
    expect(result.nodes[0].id).toBe("project:p1");
  });
});

describe("findShortestPath — direct connection", () => {
  it("finds path of length 1 between directly connected nodes", () => {
    const result = findShortestPath(G, "project:p1", "risk:p1")!;
    expect(result.length).toBe(1);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].id).toBe("project:p1");
    expect(result.nodes[1].id).toBe("risk:p1");
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].type).toBe("has_risk");
  });

  it("finds path from memory to project (undirected over inbound edge)", () => {
    // Edge is memory:m1 → project:p1 (belongs_to_project), traversed in reverse
    const result = findShortestPath(G, "project:p1", "memory:m1")!;
    expect(result.length).toBe(1);
    expect(result.edges[0].type).toBe("belongs_to_project");
  });

  it("direct case→solution path length 1", () => {
    const result = findShortestPath(G, "case:C1", "solution:m2")!;
    expect(result.length).toBe(1);
    expect(result.edges[0].type).toBe("resolved_by");
  });
});

describe("findShortestPath — indirect path", () => {
  it("finds path of length 2: project:p1 → memory:m1 → domain:drives", () => {
    const result = findShortestPath(G, "project:p1", "domain:drives")!;
    expect(result.length).toBe(2);
    expect(result.nodes[0].id).toBe("project:p1");
    expect(result.nodes[2].id).toBe("domain:drives");
  });

  it("path nodes length equals edges length + 1", () => {
    const result = findShortestPath(G, "project:p1", "outcome:unknown")!;
    expect(result.nodes.length).toBe(result.edges.length + 1);
  });

  it("finds path of length 3: risk:p1 → project:p1 → memory:m1 → outcome:unknown", () => {
    const result = findShortestPath(G, "risk:p1", "outcome:unknown")!;
    expect(result.length).toBe(3);
    expect(result.nodes[0].id).toBe("risk:p1");
    expect(result.nodes[3].id).toBe("outcome:unknown");
  });

  it("path is the SHORTEST (no path of length 1 between risk:p1 and domain:drives)", () => {
    const result = findShortestPath(G, "risk:p1", "domain:drives")!;
    expect(result.length).toBe(3);  // risk:p1 → project:p1 → memory:m1 → domain:drives
  });
});

describe("findShortestPath — determinism", () => {
  it("returns the same path regardless of node array order", () => {
    const shuffledNodes = [...NODES].reverse();
    const G2: KnowledgeGraph = { ...G, nodes: shuffledNodes };
    const r1 = findShortestPath(G,  "project:p1", "outcome:unknown")!;
    const r2 = findShortestPath(G2, "project:p1", "outcome:unknown")!;
    expect(r1.nodes.map(n => n.id)).toEqual(r2.nodes.map(n => n.id));
    expect(r1.edges.map(e => e.id)).toEqual(r2.edges.map(e => e.id));
  });

  it("returns the same path on repeated calls", () => {
    const r1 = findShortestPath(G, "risk:p1", "outcome:success")!;
    const r2 = findShortestPath(G, "risk:p1", "outcome:success")!;
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});
