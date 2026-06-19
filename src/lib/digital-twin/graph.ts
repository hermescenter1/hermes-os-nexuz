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

  const [rawNodes, rawRelations] = await Promise.all([
    (prisma.digitalTwinNode     as unknown as NodeModel).findMany({ where: { organizationId, siteId } }),
    (prisma.digitalTwinRelation as unknown as RelModel).findMany({ where: { organizationId } }),
  ]);

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

  return { siteId, nodes: nodeMap, relations };
}

/**
 * Get nodes directly reachable from a node (one hop, all relation types).
 */
export async function getNodeRelations(
  nodeId:         string,
  organizationId: string,
): Promise<{ outbound: TwinRelationRecord[]; inbound: TwinRelationRecord[] }> {
  const prisma = await getPrisma();
  if (!prisma) return { outbound: [], inbound: [] };

  const [outRaw, inRaw] = await Promise.all([
    (prisma.digitalTwinRelation as unknown as RelModel).findMany({
      where: { organizationId, sourceNodeId: nodeId },
    }),
    (prisma.digitalTwinRelation as unknown as RelModel).findMany({
      where: { organizationId, targetNodeId: nodeId },
    }),
  ]);

  return {
    outbound: outRaw.map(rowToRelation),
    inbound:  inRaw.map(rowToRelation),
  };
}

/**
 * Get all assets upstream of the given node (following directed + bidirectional edges backward).
 * Cycle-safe; will not recurse beyond MAX_TRAVERSAL_DEPTH.
 */
export async function getUpstreamAssets(
  nodeId:         string,
  organizationId: string,
): Promise<{ nodes: TwinNodeRecord[]; cycleDetected: boolean; truncated: boolean }> {
  const prisma = await getPrisma();
  if (!prisma) return { nodes: [], cycleDetected: false, truncated: false };

  const rawRels = await (prisma.digitalTwinRelation as unknown as RelModel).findMany({
    where: { organizationId },
  });
  const relations = rawRels.map(rowToRelation);
  const { backward } = buildAdjacency(relations);
  const { nodeIds, cycleDetected, truncated } = traverseUpstream(nodeId, backward);

  if (nodeIds.length === 0) return { nodes: [], cycleDetected, truncated };

  const rawNodes = await (prisma.digitalTwinNode as unknown as NodeModel).findMany({
    where: { organizationId, id: { in: nodeIds } },
  });
  return { nodes: rawNodes.map(rowToNode), cycleDetected, truncated };
}

/**
 * Get all assets downstream of the given node (following directed + bidirectional edges forward).
 * Cycle-safe; will not recurse beyond MAX_TRAVERSAL_DEPTH.
 */
export async function getDownstreamAssets(
  nodeId:         string,
  organizationId: string,
): Promise<{ nodes: TwinNodeRecord[]; cycleDetected: boolean; truncated: boolean }> {
  const prisma = await getPrisma();
  if (!prisma) return { nodes: [], cycleDetected: false, truncated: false };

  const rawRels = await (prisma.digitalTwinRelation as unknown as RelModel).findMany({
    where: { organizationId },
  });
  const relations = rawRels.map(rowToRelation);
  const { forward } = buildAdjacency(relations);
  const { nodeIds, cycleDetected, truncated } = traverseDownstream(nodeId, forward);

  if (nodeIds.length === 0) return { nodes: [], cycleDetected, truncated };

  const rawNodes = await (prisma.digitalTwinNode as unknown as NodeModel).findMany({
    where: { organizationId, id: { in: nodeIds } },
  });
  return { nodes: rawNodes.map(rowToNode), cycleDetected, truncated };
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
