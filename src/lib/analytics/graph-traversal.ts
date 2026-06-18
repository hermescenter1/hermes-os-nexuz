/**
 * Phase 21B — Pure graph traversal engine.
 *
 * All functions are deterministic: same graph + same inputs → same output.
 * No I/O; no side effects.
 */

import type { GraphNode, GraphEdge, KnowledgeGraph } from "./knowledge-graph";

// ── Extended types ─────────────────────────────────────────────────────────

export type EdgeDirection = "inbound" | "outbound";

export interface NavigationEdge extends GraphEdge {
  direction: EdgeDirection;
}

export interface NodeDetails {
  node:  GraphNode;
  edges: NavigationEdge[];
  stats: {
    inboundEdges:  number;
    outboundEdges: number;
    totalEdges:    number;
  };
}

export interface NeighborEntry {
  node:      GraphNode;
  edge:      NavigationEdge;
}

export interface NeighborResult {
  nodeId:    string;
  neighbors: NeighborEntry[];
  stats: {
    totalNeighbors: number;
  };
}

export interface PathResult {
  nodes:  GraphNode[];
  edges:  GraphEdge[];
  length: number;
}

// ── Internal helpers ───────────────────────────────────────────────────────

function nodeMap(graph: KnowledgeGraph): Map<string, GraphNode> {
  return new Map(graph.nodes.map(n => [n.id, n]));
}

function edgeSortKey(e: NavigationEdge): string {
  return `${e.type}\x00${e.sourceId}\x00${e.targetId}`;
}

// ── getNodeDetails ─────────────────────────────────────────────────────────

/**
 * Returns a node and all its edges (annotated with direction) or null when the
 * nodeId is not in the graph.
 */
export function getNodeDetails(
  graph: KnowledgeGraph,
  nodeId: string
): NodeDetails | null {
  const nMap = nodeMap(graph);
  const node = nMap.get(nodeId);
  if (!node) return null;

  const edges: NavigationEdge[] = [];
  for (const e of graph.edges) {
    if (e.sourceId === nodeId) {
      edges.push({ ...e, direction: "outbound" });
    } else if (e.targetId === nodeId) {
      edges.push({ ...e, direction: "inbound" });
    }
  }

  edges.sort((a, b) => edgeSortKey(a).localeCompare(edgeSortKey(b)));

  const inbound  = edges.filter(e => e.direction === "inbound").length;
  const outbound = edges.filter(e => e.direction === "outbound").length;

  return {
    node,
    edges,
    stats: { inboundEdges: inbound, outboundEdges: outbound, totalEdges: edges.length },
  };
}

// ── getNeighbors ───────────────────────────────────────────────────────────

/**
 * Returns all immediately adjacent nodes (via any edge in either direction),
 * each paired with the connecting edge. Sorted by neighbor type then id.
 */
export function getNeighbors(
  graph: KnowledgeGraph,
  nodeId: string
): NeighborResult | null {
  const nMap = nodeMap(graph);
  if (!nMap.has(nodeId)) return null;

  const entries: NeighborEntry[] = [];

  for (const e of graph.edges) {
    let neighborId: string;
    let direction:  EdgeDirection;

    if (e.sourceId === nodeId) {
      neighborId = e.targetId;
      direction  = "outbound";
    } else if (e.targetId === nodeId) {
      neighborId = e.sourceId;
      direction  = "inbound";
    } else {
      continue;
    }

    const neighbor = nMap.get(neighborId);
    if (!neighbor) continue;

    entries.push({ node: neighbor, edge: { ...e, direction } });
  }

  entries.sort((a, b) => {
    const tc = a.node.type.localeCompare(b.node.type);
    return tc !== 0 ? tc : a.node.id.localeCompare(b.node.id);
  });

  return {
    nodeId,
    neighbors: entries,
    stats: { totalNeighbors: entries.length },
  };
}

// ── findShortestPath ───────────────────────────────────────────────────────

/**
 * BFS shortest path between two nodes, treating all edges as undirected.
 * Neighbors are explored in alphabetical order for strict determinism.
 * Returns null when either node is absent or no path exists.
 */
export function findShortestPath(
  graph:  KnowledgeGraph,
  fromId: string,
  toId:   string
): PathResult | null {
  const nMap = nodeMap(graph);
  if (!nMap.has(fromId) || !nMap.has(toId)) return null;

  if (fromId === toId) {
    return { nodes: [nMap.get(fromId)!], edges: [], length: 0 };
  }

  // Build undirected adjacency list
  const adj = new Map<string, { neighborId: string; edge: GraphEdge }[]>();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const e of graph.edges) {
    adj.get(e.sourceId)?.push({ neighborId: e.targetId, edge: e });
    adj.get(e.targetId)?.push({ neighborId: e.sourceId, edge: e });
  }

  const visited = new Set<string>([fromId]);
  const prev    = new Map<string, { from: string; edge: GraphEdge }>();
  const queue   = [fromId];

  outer: while (queue.length > 0) {
    const current = queue.shift()!;
    // Sort for determinism before exploring
    const nexts = (adj.get(current) ?? [])
      .slice()
      .sort((a, b) => a.neighborId.localeCompare(b.neighborId));

    for (const { neighborId, edge } of nexts) {
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);
      prev.set(neighborId, { from: current, edge });
      if (neighborId === toId) break outer;
      queue.push(neighborId);
    }
  }

  if (!prev.has(toId)) return null;

  // Reconstruct path back from toId
  const pathNodeIds: string[] = [];
  const pathEdges:   GraphEdge[] = [];
  let cur = toId;
  while (cur !== fromId) {
    const p = prev.get(cur)!;
    pathNodeIds.unshift(cur);
    pathEdges.unshift(p.edge);
    cur = p.from;
  }
  pathNodeIds.unshift(fromId);

  return {
    nodes:  pathNodeIds.map(id => nMap.get(id)!),
    edges:  pathEdges,
    length: pathEdges.length,
  };
}
