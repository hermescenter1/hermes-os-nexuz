/**
 * Industrial Knowledge Graph Query Engine — Phase 41.
 *
 * Loads all org nodes+edges in 2 bulk queries then traverses in memory.
 * No N+1 queries. Every result includes graph staleness.
 *
 * DIRECTIONALITY:
 *   BIDIRECTIONAL edge types: CONNECTED_TO, RELATED_TO
 *   All other edge types are DIRECTED: traversal follows source → target only.
 *
 * CYCLE PROTECTION: visited-set + configurable maxDepth in all traversals.
 *
 * PATH ALGORITHM: Dijkstra over edge cost (1.0 − weight) → strongest-evidence
 * path (not fewest hops). See builder.ts for weight normalization.
 */

import { getPrisma }                  from "@/lib/db/prisma";
import { logInfraFailure }            from "@/lib/logger/security-events";
import { getLatestSnapshot, isStaleSince } from "./builder";
import { applyVisibility, loadVisibleEntitySets, type GraphViewerScope } from "./visibility";

// ── Constants ─────────────────────────────────────────────────────────────────

export const DEFAULT_MAX_DEPTH = 20;
const BIDIRECTIONAL_EDGE_TYPES = new Set(["CONNECTED_TO", "RELATED_TO"]);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IGNodeRecord {
  id:             string;
  organizationId: string;
  nodeType:       string;
  entityId:       string;
  label:          string;
  metadata:       Record<string, unknown>;
  createdAt:      string;
  updatedAt:      string;
}

export interface IGEdgeRecord {
  id:             string;
  organizationId: string;
  sourceNodeId:   string;
  targetNodeId:   string;
  edgeType:       string;
  weight:         number;
  evidence:       Record<string, unknown>;
  metadata:       Record<string, unknown>;
  createdAt:      string;
}

export interface IGStaleness {
  lastBuiltAt:      string | null;
  stale:            boolean;
  stalenessWarning: string | null;
}

export interface IGGraphResult {
  nodes:      IGNodeRecord[];
  edges:      IGEdgeRecord[];
  staleness:  IGStaleness;
  nodeCount:  number;
  edgeCount:  number;
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
}

export interface IGSubgraphResult {
  rootNode:   IGNodeRecord | null;
  nodes:      IGNodeRecord[];
  edges:      IGEdgeRecord[];
  staleness:  IGStaleness;
}

export interface IGPathResult {
  found:           boolean;
  path:            IGPathHop[];
  totalCost:       number;
  evidenceSummary: { edgeType: string; weight: number; evidence: Record<string, unknown> }[];
  staleness:       IGStaleness;
}

export interface IGPathHop {
  node:         IGNodeRecord;
  incomingEdge: IGEdgeRecord | null;
}

// ── Prisma model helper ───────────────────────────────────────────────────────

type FindManyFn = (a: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
interface RawModel { findMany: FindManyFn }

function rawModel(db: Record<string, unknown>, name: string): RawModel {
  return db[name] as RawModel;
}

// ── Row → typed record ────────────────────────────────────────────────────────

function rowToNode(r: Record<string, unknown>): IGNodeRecord {
  return {
    id:             String(r.id),
    organizationId: String(r.organizationId),
    nodeType:       String(r.nodeType),
    entityId:       String(r.entityId),
    label:          String(r.label),
    metadata:       (r.metadata ?? {}) as Record<string, unknown>,
    createdAt:      r.createdAt ? new Date(r.createdAt as string).toISOString() : "",
    updatedAt:      r.updatedAt ? new Date(r.updatedAt as string).toISOString() : "",
  };
}

function rowToEdge(r: Record<string, unknown>): IGEdgeRecord {
  return {
    id:             String(r.id),
    organizationId: String(r.organizationId),
    sourceNodeId:   String(r.sourceNodeId),
    targetNodeId:   String(r.targetNodeId),
    edgeType:       String(r.edgeType),
    weight:         Number(r.weight ?? 0.5),
    evidence:       (r.evidence ?? {}) as Record<string, unknown>,
    metadata:       (r.metadata ?? {}) as Record<string, unknown>,
    createdAt:      r.createdAt ? new Date(r.createdAt as string).toISOString() : "",
  };
}

// ── Bulk load ─────────────────────────────────────────────────────────────────

/**
 * The ONLY way a query reads the graph: the organisation's cached nodes/edges, reduced to
 * what `scope` may see (see ./visibility.ts) BEFORE anything is traversed, counted or
 * explained. Nothing in this module can be handed an unscoped graph.
 *
 * Fails closed: any error (database, policy resolution) returns null, which every public
 * function turns into an empty result — never into the unfiltered graph.
 */
/**
 * One already-authorised scoped graph, reusable within ONE request (independent review S2-03). It
 * carries the scope it was resolved for; passing it to a query that runs with a different scope is
 * refused (fail closed), so it can never widen a later answer.
 */
export interface ScopedGraphContext {
  readonly scope: GraphViewerScope;
  readonly graph: { nodes: IGNodeRecord[]; edges: IGEdgeRecord[] } | null;
  readonly staleness: IGStaleness;
}

/**
 * Resolves the scoped graph and the staleness ONCE so a request that needs several views of the same
 * graph (e.g. `/root-causes/[id]`: subgraph + explanation + evidence path) resolves the visible entity
 * sets a single time instead of once per view.
 */
export async function loadScopedGraphContext(scope: GraphViewerScope): Promise<ScopedGraphContext> {
  const [graph, staleness] = await Promise.all([loadScopedGraph(scope), getStaleness(scope.organizationId)]);
  return { scope, graph, staleness };
}

const sameScope = (a: GraphViewerScope, b: GraphViewerScope): boolean =>
  a === b || (a.organizationId === b.organizationId
    && a.organizationLevelAccess === b.organizationLevelAccess
    && a.allowedSiteIds.length === b.allowedSiteIds.length
    && [...a.allowedSiteIds].sort().join("\u0000") === [...b.allowedSiteIds].sort().join("\u0000"));

/** The context's graph if it belongs to this scope, otherwise a fresh resolution for this scope. */
async function graphFor(
  scope: GraphViewerScope,
  ctx: ScopedGraphContext | undefined,
): Promise<[{ nodes: IGNodeRecord[]; edges: IGEdgeRecord[] } | null, IGStaleness]> {
  if (ctx && sameScope(ctx.scope, scope)) return [ctx.graph, ctx.staleness];
  return Promise.all([loadScopedGraph(scope), getStaleness(scope.organizationId)]);
}

async function loadScopedGraph(
  scope: GraphViewerScope,
): Promise<{ nodes: IGNodeRecord[]; edges: IGEdgeRecord[] } | null> {
  const db = await getPrisma();
  if (!db) return null;
  try {
    const raw = db as unknown as Record<string, unknown>;
    const [nodeRows, edgeRows, visible] = await Promise.all([
      rawModel(db, "industrialKnowledgeGraphNode").findMany({ where: { organizationId: scope.organizationId } }),
      rawModel(db, "industrialKnowledgeGraphEdge").findMany({ where: { organizationId: scope.organizationId } }),
      loadVisibleEntitySets(raw, scope),
    ]);
    return applyVisibility({ nodes: nodeRows.map(rowToNode), edges: edgeRows.map(rowToEdge) }, scope.organizationId, visible);
  } catch (err) {
    logInfraFailure("database", "knowledge_graph.load_scoped_graph", err);
    return null;
  }
}

// ── Staleness helper ──────────────────────────────────────────────────────────

async function getStaleness(organizationId: string): Promise<IGStaleness> {
  const snap = await getLatestSnapshot(organizationId);
  const lastBuiltAt = snap?.createdAt ?? null;
  const stale = isStaleSince(lastBuiltAt);
  return {
    lastBuiltAt:      lastBuiltAt ? lastBuiltAt.toISOString() : null,
    stale,
    stalenessWarning: stale
      ? lastBuiltAt
        ? `Graph was last built ${Math.floor((Date.now() - lastBuiltAt.getTime()) / 3600000)}h ago. POST /api/industrial-graph/rebuild to refresh.`
        : "Graph has never been built. POST /api/industrial-graph/rebuild to initialize."
      : null,
  };
}

// ── Adjacency list builder ────────────────────────────────────────────────────

function buildAdjacency(edges: IGEdgeRecord[]): Map<string, IGEdgeRecord[]> {
  const adj = new Map<string, IGEdgeRecord[]>();
  for (const edge of edges) {
    if (!adj.has(edge.sourceNodeId)) adj.set(edge.sourceNodeId, []);
    adj.get(edge.sourceNodeId)!.push(edge);
    if (BIDIRECTIONAL_EDGE_TYPES.has(edge.edgeType)) {
      if (!adj.has(edge.targetNodeId)) adj.set(edge.targetNodeId, []);
      adj.get(edge.targetNodeId)!.push(edge);
    }
  }
  return adj;
}

// ── BFS traversal (for subgraph queries) ─────────────────────────────────────

function bfsSubgraph(
  startId:  string,
  nodeMap:  Map<string, IGNodeRecord>,
  adj:      Map<string, IGEdgeRecord[]>,
  maxDepth: number,
): { nodes: IGNodeRecord[]; edges: IGEdgeRecord[] } {
  const visitedNodes = new Set<string>();
  const visitedEdges = new Set<string>();
  const queue: { id: string; depth: number }[] = [{ id: startId, depth: 0 }];
  visitedNodes.add(startId);

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;

    for (const edge of adj.get(id) ?? []) {
      const neighbor = edge.sourceNodeId === id ? edge.targetNodeId : edge.sourceNodeId;
      if (!nodeMap.has(neighbor)) continue;       // never keep an edge whose far end is not in the (visible) node set
      visitedEdges.add(edge.id);
      if (!visitedNodes.has(neighbor)) {
        visitedNodes.add(neighbor);
        queue.push({ id: neighbor, depth: depth + 1 });
      }
    }
  }

  return {
    nodes: Array.from(visitedNodes).map(id => nodeMap.get(id)!).filter(Boolean),
    edges: Array.from(visitedEdges).map(id => {
      for (const edgeList of adj.values()) {
        const e = edgeList.find(e => e.id === id);
        if (e) return e;
      }
      return null;
    }).filter((e): e is IGEdgeRecord => e !== null),
  };
}

// ── Dijkstra path-finding (strongest-evidence path) ──────────────────────────
// Cost = 1.0 − weight, so lower cost = stronger evidence.

function dijkstraPath(
  sourceId: string,
  targetId: string,
  nodeMap:  Map<string, IGNodeRecord>,
  adj:      Map<string, IGEdgeRecord[]>,
  maxDepth: number,
): { path: IGPathHop[]; totalCost: number } | null {
  const dist = new Map<string, number>();
  const prev = new Map<string, { fromId: string; edge: IGEdgeRecord }>();
  const depth = new Map<string, number>();
  const visited = new Set<string>();

  dist.set(sourceId, 0);
  depth.set(sourceId, 0);

  // Priority queue as sorted array (adequate for industrial graph size)
  const queue: [number, string][] = [[0, sourceId]];

  while (queue.length > 0) {
    queue.sort((a, b) => a[0] - b[0]);
    const [cost, nodeId] = queue.shift()!;

    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    if (nodeId === targetId) break;

    const curDepth = depth.get(nodeId) ?? 0;
    if (curDepth >= maxDepth) continue;

    for (const edge of adj.get(nodeId) ?? []) {
      const neighbor = edge.sourceNodeId === nodeId ? edge.targetNodeId : edge.sourceNodeId;
      if (!nodeMap.has(neighbor)) continue;

      const edgeCost = 1.0 - Math.min(1, Math.max(0, edge.weight));
      const newCost  = cost + edgeCost;
      const newDepth = curDepth + 1;

      if (!dist.has(neighbor) || newCost < dist.get(neighbor)!) {
        dist.set(neighbor, newCost);
        depth.set(neighbor, newDepth);
        prev.set(neighbor, { fromId: nodeId, edge });
        queue.push([newCost, neighbor]);
      }
    }
  }

  if (!dist.has(targetId)) return null;

  // Reconstruct path
  const hops: IGPathHop[] = [];
  let current = targetId;
  while (current !== sourceId) {
    const p = prev.get(current);
    if (!p) return null;
    hops.unshift({ node: nodeMap.get(current)!, incomingEdge: p.edge });
    current = p.fromId;
  }
  hops.unshift({ node: nodeMap.get(sourceId)!, incomingEdge: null });

  return { path: hops, totalCost: dist.get(targetId)! };
}

// ── Public query functions ────────────────────────────────────────────────────

/**
 * The graph the viewer is entitled to (nodes, edges, counts), with staleness.
 *
 * RV-01: every node type is authorised against its live owner and every edge against both
 * endpoints (./visibility.ts). Counts and `*ByType` are computed from the visible graph only,
 * so they cannot reveal what was hidden. A viewer with no site gets only the organisation-level
 * catalogue.
 */
export async function getKnowledgeGraph(scope: GraphViewerScope): Promise<IGGraphResult> {
  const [graph, staleness] = await Promise.all([
    loadScopedGraph(scope),
    getStaleness(scope.organizationId),
  ]);

  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];

  const nodesByType: Record<string, number> = {};
  const edgesByType: Record<string, number> = {};
  for (const n of nodes) nodesByType[n.nodeType] = (nodesByType[n.nodeType] ?? 0) + 1;
  for (const e of edges) edgesByType[e.edgeType] = (edgesByType[e.edgeType] ?? 0) + 1;

  return { nodes, edges, staleness, nodeCount: nodes.length, edgeCount: edges.length, nodesByType, edgesByType };
}

/** Subgraph rooted at an ASSET node (via entityId = assetId). */
export async function getAssetKnowledgeGraph(
  scope:    GraphViewerScope,
  assetId:  string,
  maxDepth = DEFAULT_MAX_DEPTH,
): Promise<IGSubgraphResult> {
  const [graph, staleness] = await Promise.all([loadScopedGraph(scope), getStaleness(scope.organizationId)]);
  if (!graph) return { rootNode: null, nodes: [], edges: [], staleness };

  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
  const adj     = buildAdjacency(graph.edges);
  const rootRow = graph.nodes.find(n => n.nodeType === "ASSET" && n.entityId === assetId);
  if (!rootRow) return { rootNode: null, nodes: [], edges: [], staleness };

  const sub = bfsSubgraph(rootRow.id, nodeMap, adj, maxDepth);
  return { rootNode: rootRow, ...sub, staleness };
}

/** Subgraph rooted at a FAILURE_MODE node. */
export async function getFailureModeGraph(
  scope:         GraphViewerScope,
  failureModeId: string,
  maxDepth = DEFAULT_MAX_DEPTH,
): Promise<IGSubgraphResult> {
  const [graph, staleness] = await Promise.all([loadScopedGraph(scope), getStaleness(scope.organizationId)]);
  if (!graph) return { rootNode: null, nodes: [], edges: [], staleness };

  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
  const adj     = buildAdjacency(graph.edges);
  const rootRow = graph.nodes.find(n => n.nodeType === "FAILURE_MODE" && n.entityId === failureModeId);
  if (!rootRow) return { rootNode: null, nodes: [], edges: [], staleness };

  const sub = bfsSubgraph(rootRow.id, nodeMap, adj, maxDepth);
  return { rootNode: rootRow, ...sub, staleness };
}

/** Subgraph rooted at a PROCEDURE node (shows what failure modes it mitigates). */
export async function getProcedureImpactGraph(
  scope:       GraphViewerScope,
  procedureId: string,
  maxDepth = DEFAULT_MAX_DEPTH,
): Promise<IGSubgraphResult> {
  const [graph, staleness] = await Promise.all([loadScopedGraph(scope), getStaleness(scope.organizationId)]);
  if (!graph) return { rootNode: null, nodes: [], edges: [], staleness };

  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
  const adj     = buildAdjacency(graph.edges);
  const rootRow = graph.nodes.find(n => n.nodeType === "PROCEDURE" && n.entityId === procedureId);
  if (!rootRow) return { rootNode: null, nodes: [], edges: [], staleness };

  const sub = bfsSubgraph(rootRow.id, nodeMap, adj, maxDepth);
  return { rootNode: rootRow, ...sub, staleness };
}

/** Subgraph rooted at a ROOT_CAUSE node. */
export async function getRootCauseGraph(
  scope:       GraphViewerScope,
  rootCauseId: string,
  maxDepth = DEFAULT_MAX_DEPTH,
  /** Optional already-resolved graph for THIS scope (see {@link loadScopedGraphContext}). */
  ctx?:        ScopedGraphContext,
): Promise<IGSubgraphResult> {
  const [graph, staleness] = await graphFor(scope, ctx);
  if (!graph) return { rootNode: null, nodes: [], edges: [], staleness };

  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
  const adj     = buildAdjacency(graph.edges);
  const rootRow = graph.nodes.find(n => n.nodeType === "ROOT_CAUSE" && n.entityId === rootCauseId);
  if (!rootRow) return { rootNode: null, nodes: [], edges: [], staleness };

  const sub = bfsSubgraph(rootRow.id, nodeMap, adj, maxDepth);
  return { rootNode: rootRow, ...sub, staleness };
}

/**
 * Find the strongest-evidence path between two nodes using Dijkstra.
 * The search runs over the viewer's VISIBLE graph only: it can neither start at, end at,
 * nor pass through a node the viewer may not see, and a hidden endpoint answers exactly
 * like one that does not exist (`found: false`).
 * "Shortest" here means the path with the highest cumulative evidence weight
 * (lowest cumulative cost = 1 − weight), not fewest hops.
 * Directed edges are only traversed source → target;
 * CONNECTED_TO and RELATED_TO are bidirectional.
 */
export async function findShortestEvidencePath(
  scope:        GraphViewerScope,
  sourceNodeId: string,
  targetNodeId: string,
  maxDepth = DEFAULT_MAX_DEPTH,
  /** Optional already-resolved graph for THIS scope (see {@link loadScopedGraphContext}). */
  ctx?:         ScopedGraphContext,
): Promise<IGPathResult> {
  const [graph, staleness] = await graphFor(scope, ctx);

  if (!graph) {
    return { found: false, path: [], totalCost: 0, evidenceSummary: [], staleness };
  }

  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
  const adj     = buildAdjacency(graph.edges);

  if (!nodeMap.has(sourceNodeId) || !nodeMap.has(targetNodeId)) {
    return { found: false, path: [], totalCost: 0, evidenceSummary: [], staleness };
  }

  if (sourceNodeId === targetNodeId) {
    const node = nodeMap.get(sourceNodeId)!;
    return { found: true, path: [{ node, incomingEdge: null }], totalCost: 0, evidenceSummary: [], staleness };
  }

  const result = dijkstraPath(sourceNodeId, targetNodeId, nodeMap, adj, maxDepth);

  if (!result) {
    return { found: false, path: [], totalCost: 0, evidenceSummary: [], staleness };
  }

  const evidenceSummary = result.path
    .filter(h => h.incomingEdge !== null)
    .map(h => ({
      edgeType: h.incomingEdge!.edgeType,
      weight:   h.incomingEdge!.weight,
      evidence: h.incomingEdge!.evidence,
    }));

  return { found: true, path: result.path, totalCost: result.totalCost, evidenceSummary, staleness };
}
