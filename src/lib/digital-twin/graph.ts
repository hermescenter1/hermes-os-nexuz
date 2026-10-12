/**
 * Digital Twin Graph Engine — Phase 36.
 *
 * getAssetGraph() loads all nodes + relations for a site in exactly 2 DB queries,
 * then builds the adjacency representation in memory — no per-node N+1 queries.
 *
 * READ/OBSERVE ONLY: No control commands to industrial hardware.
 */

import { getPrisma }     from "@/lib/db/prisma";
import { rowToNode }     from "./nodes";
import { rowToRelation, buildAdjacency, traverseDownstream, traverseUpstream } from "./relations";
import { TWIN_LIMITS }   from "./schemas";
import { MAX_TRAVERSAL_DEPTH } from "./types";
import type {
  AssetGraph, GraphNode, TwinNodeRecord, TwinRelationRecord,
  DigitalTwinRelationType,
} from "./types";

type NodeModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
type RelModel  = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

/**
 * Load all nodes and relations for a site in 2 queries.
 * Builds in-memory adjacency lists; safe for sites with hundreds of nodes.
 */
export async function getAssetGraph(
  organizationId: string,
  siteId: string,
): Promise<AssetGraph | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;

  // Slice 1: both reads are bounded and scoped IN THE QUERY. Relations used to be
  // fetched for the whole organisation and discarded in memory; now only edges
  // whose two endpoints are at this site are read, and a graph past the ceiling is
  // reported as `truncated` rather than loaded without limit.
  const [rawNodes, rawRelations] = await Promise.all([
    (prisma.digitalTwinNode as unknown as NodeModel).findMany({
      where:   { organizationId, siteId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take:    TWIN_LIMITS.GRAPH_NODES + 1,
    }),
    (prisma.digitalTwinRelation as unknown as RelModel).findMany({
      where: {
        organizationId,
        sourceNode: { siteId },
        targetNode: { siteId },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take:    TWIN_LIMITS.GRAPH_RELATIONS + 1,
    }),
  ]);
  const truncated = rawNodes.length > TWIN_LIMITS.GRAPH_NODES || rawRelations.length > TWIN_LIMITS.GRAPH_RELATIONS;
  rawNodes.length     = Math.min(rawNodes.length,     TWIN_LIMITS.GRAPH_NODES);
  rawRelations.length = Math.min(rawRelations.length, TWIN_LIMITS.GRAPH_RELATIONS);

  const nodeMap = new Map<string, GraphNode>();
  for (const r of rawNodes) {
    const n = rowToNode(r);
    nodeMap.set(n.id, { ...n, children: [], relations: [] });
  }

  const siteNodeIds = new Set(nodeMap.keys());
  const relations   = rawRelations
    .map(rowToRelation)
    .filter((rel) => siteNodeIds.has(rel.sourceNodeId) && siteNodeIds.has(rel.targetNodeId));

  for (const rel of relations) {
    const src = nodeMap.get(rel.sourceNodeId);
    const tgt = nodeMap.get(rel.targetNodeId);
    if (src) src.relations.push({ relationType: rel.relationType, targetId: rel.targetNodeId, direction: "out" });
    if (tgt) tgt.relations.push({ relationType: rel.relationType, targetId: rel.sourceNodeId, direction: "in" });
    // Track parent children via PART_OF
    if (rel.relationType === "PART_OF" && src && tgt) {
      tgt.children.push(rel.sourceNodeId);
    }
  }

  return { siteId, nodes: nodeMap, relations, truncated };
}

/**
 * Get nodes directly reachable from a node (one hop, all relation types).
 */
export async function getNodeRelations(
  nodeId:         string,
  organizationId: string,
  opts?: { allowedSiteIds?: string[] },
): Promise<{ outbound: TwinRelationRecord[]; inbound: TwinRelationRecord[]; truncated: boolean }> {
  if (opts?.allowedSiteIds !== undefined && opts.allowedSiteIds.length === 0) {
    return { outbound: [], inbound: [], truncated: false };
  }
  const prisma = await getPrisma();
  if (!prisma) return { outbound: [], inbound: [], truncated: false };

  // With `allowedSiteIds`, an edge is only reported when both its endpoints are at
  // sites the caller may reach, so a legacy edge to a node at another site does
  // not disclose that node's id.
  const siteScope: Record<string, unknown> = opts?.allowedSiteIds !== undefined
    ? {
        sourceNode: { siteId: { in: opts.allowedSiteIds } },
        targetNode: { siteId: { in: opts.allowedSiteIds } },
      }
    : {};

  // Each direction is capped independently at LIST_RELATIONS, in a total order
  // (createdAt, id) so WHICH rows survive the cap is deterministic. `limit + 1`
  // rows are requested so exactly `limit` is not mistaken for a truncated result.
  const limit = TWIN_LIMITS.LIST_RELATIONS;
  const order = [{ createdAt: "asc" }, { id: "asc" }];
  const [outRaw, inRaw] = await Promise.all([
    (prisma.digitalTwinRelation as unknown as RelModel).findMany({
      where:   { organizationId, sourceNodeId: nodeId, ...siteScope },
      orderBy: order,
      take:    limit + 1,
    }),
    (prisma.digitalTwinRelation as unknown as RelModel).findMany({
      where:   { organizationId, targetNodeId: nodeId, ...siteScope },
      orderBy: order,
      take:    limit + 1,
    }),
  ]);

  return {
    outbound:  outRaw.slice(0, limit).map(rowToRelation),
    inbound:   inRaw.slice(0, limit).map(rowToRelation),
    truncated: outRaw.length > limit || inRaw.length > limit,
  };
}

/** Hard ceiling of nodes one scoped traversal may return (Copilot context, Brain context). */
export const MAX_TRAVERSAL_RESULT_NODES = 200;

export interface ScopedTraversalOptions {
  /** Requested depth; clamped to 1..MAX_TRAVERSAL_DEPTH. */
  maxDepth?: number;
  /** Requested result size; clamped to 1..MAX_TRAVERSAL_RESULT_NODES. */
  maxNodes?: number;
}

export interface ScopedTraversalResult {
  nodes:         TwinNodeRecord[];
  cycleDetected: boolean;
  /** true when depth, result size or the relation read hit its ceiling — the answer is NOT the complete graph. */
  truncated:     boolean;
}

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const clamp = (v: number | undefined, lo: number, hi: number, dflt: number): number =>
  Math.min(hi, Math.max(lo, Number.isFinite(v) ? Math.trunc(v as number) : dflt));

/**
 * Corrective slice C (IR-03). A traversal used to read EVERY relation of the organisation and every node it
 * reached, whatever its site, with no bound. Now:
 *   - the start node must itself lie on one of `allowedSiteIds` (otherwise: nothing);
 *   - only relations whose BOTH endpoints are on allowed sites are read (in the query, bounded and ordered),
 *     so a traversal can neither reach nor name a node of another site;
 *   - depth and result size are clamped to server maxima, and `truncated` says when a ceiling was hit;
 *   - the order is deterministic (relations by createdAt, id; results in traversal order).
 * An empty `allowedSiteIds` returns nothing.
 */
async function scopedTraversal(
  direction:      "up" | "down",
  nodeId:         string,
  organizationId: string,
  allowedSiteIds: readonly string[],
  opts:           ScopedTraversalOptions,
): Promise<ScopedTraversalResult> {
  const empty: ScopedTraversalResult = { nodes: [], cycleDetected: false, truncated: false };
  const sites = Array.from(new Set(allowedSiteIds.filter(isId)));
  if (!isId(nodeId) || !isId(organizationId) || sites.length === 0) return empty;
  const prisma = await getPrisma();
  if (!prisma) return empty;
  const nodeModel = prisma.digitalTwinNode as unknown as NodeModel;

  const start = await nodeModel.findMany({ where: { id: nodeId, organizationId, siteId: { in: sites } }, select: { id: true }, take: 1 });
  if (start.length === 0) return empty;

  const relLimit = TWIN_LIMITS.GRAPH_RELATIONS;
  const rawRels = await (prisma.digitalTwinRelation as unknown as RelModel).findMany({
    where: {
      organizationId,
      sourceNode: { organizationId, siteId: { in: sites } },
      targetNode: { organizationId, siteId: { in: sites } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take:    relLimit + 1,
  });
  const relationsTruncated = rawRels.length > relLimit;
  const { forward, backward } = buildAdjacency(rawRels.slice(0, relLimit).map(rowToRelation));

  const maxDepth = clamp(opts.maxDepth, 1, MAX_TRAVERSAL_DEPTH, MAX_TRAVERSAL_DEPTH);
  const maxNodes = clamp(opts.maxNodes, 1, MAX_TRAVERSAL_RESULT_NODES, MAX_TRAVERSAL_RESULT_NODES);
  const walk = direction === "up" ? traverseUpstream(nodeId, backward, maxDepth) : traverseDownstream(nodeId, forward, maxDepth);
  const ids = walk.nodeIds.slice(0, maxNodes);
  const truncated = walk.truncated || relationsTruncated || walk.nodeIds.length > maxNodes;
  if (ids.length === 0) return { nodes: [], cycleDetected: walk.cycleDetected, truncated };

  const rawNodes = await nodeModel.findMany({
    where: { organizationId, siteId: { in: sites }, id: { in: ids } },
    take:  maxNodes,
  });
  const order = new Map(ids.map((id, i) => [id, i]));
  const nodes = rawNodes.map(rowToNode).filter((n) => order.has(n.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  return { nodes, cycleDetected: walk.cycleDetected, truncated };
}

/**
 * Nodes upstream of the given node (following directed + bidirectional edges backward), within
 * `allowedSiteIds` only. Cycle-safe, depth- and size-bounded (see {@link scopedTraversal}).
 */
export async function getUpstreamAssets(
  nodeId:         string,
  organizationId: string,
  allowedSiteIds: readonly string[],
  opts:           ScopedTraversalOptions = {},
): Promise<ScopedTraversalResult> {
  return scopedTraversal("up", nodeId, organizationId, allowedSiteIds, opts);
}

/**
 * Nodes downstream of the given node (following directed + bidirectional edges forward), within
 * `allowedSiteIds` only. Cycle-safe, depth- and size-bounded (see {@link scopedTraversal}).
 */
export async function getDownstreamAssets(
  nodeId:         string,
  organizationId: string,
  allowedSiteIds: readonly string[],
  opts:           ScopedTraversalOptions = {},
): Promise<ScopedTraversalResult> {
  return scopedTraversal("down", nodeId, organizationId, allowedSiteIds, opts);
}

/**
 * Get all nodes connected to the given node via any relation type.
 * One-hop only. Bidirectional — includes both inbound and outbound neighbors.
 */
export async function getConnectedAssets(
  nodeId:         string,
  organizationId: string,
): Promise<TwinNodeRecord[]> {
  const prisma = await getPrisma();
  if (!prisma) return [];

  const [outRaw, inRaw] = await Promise.all([
    (prisma.digitalTwinRelation as unknown as RelModel).findMany({
      where: { organizationId, sourceNodeId: nodeId },
    }),
    (prisma.digitalTwinRelation as unknown as RelModel).findMany({
      where: { organizationId, targetNodeId: nodeId },
    }),
  ]);

  const neighborIds = new Set<string>();
  outRaw.map(rowToRelation).forEach((r) => neighborIds.add(r.targetNodeId));
  inRaw.map(rowToRelation).forEach((r)  => neighborIds.add(r.sourceNodeId));

  if (neighborIds.size === 0) return [];
  const rawNodes = await (prisma.digitalTwinNode as unknown as NodeModel).findMany({
    where: { organizationId, id: { in: [...neighborIds] } },
  });
  return rawNodes.map(rowToNode);
}

/**
 * Find the shortest dependency path from fromId to toId.
 * Cycle-safe via BFS with visited set.
 * Returns null if no path exists.
 */
export async function getDependencyPath(
  fromId:         string,
  toId:           string,
  organizationId: string,
): Promise<{ path: string[]; nodes: TwinNodeRecord[] } | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;

  const rawRels = await (prisma.digitalTwinRelation as unknown as RelModel).findMany({
    where: { organizationId },
  });
  const relations = rawRels.map(rowToRelation);
  const { forward } = buildAdjacency(relations);

  const { findDependencyPath } = await import("./relations");
  const path = findDependencyPath(fromId, toId, forward);
  if (!path) return null;

  const rawNodes = await (prisma.digitalTwinNode as unknown as NodeModel).findMany({
    where: { organizationId, id: { in: path } },
  });
  return { path, nodes: rawNodes.map(rowToNode) };
}
