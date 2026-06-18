/**
 * Phase 21B — Graph Navigation Service.
 *
 * Loads the full knowledge graph via the existing service, then delegates to
 * pure traversal functions. Every exported function returns null on not-found
 * and re-throws unexpected errors so callers can return 404.
 */

import { getKnowledgeGraph } from "./knowledge-graph-service";
import {
  getNodeDetails,
  getNeighbors,
  findShortestPath,
} from "@/lib/analytics/graph-traversal";
import type { NodeDetails, NeighborResult, PathResult } from "@/lib/analytics/graph-traversal";

export type { NodeDetails, NeighborResult, PathResult, NavigationEdge } from "@/lib/analytics/graph-traversal";

export async function getNodeById(nodeId: string): Promise<NodeDetails | null> {
  const graph = await getKnowledgeGraph();
  return getNodeDetails(graph, nodeId);
}

export async function getNodeNeighbors(nodeId: string): Promise<NeighborResult | null> {
  const graph = await getKnowledgeGraph();
  return getNeighbors(graph, nodeId);
}

export async function getPath(fromId: string, toId: string): Promise<PathResult | null> {
  const graph = await getKnowledgeGraph();
  return findShortestPath(graph, fromId, toId);
}
