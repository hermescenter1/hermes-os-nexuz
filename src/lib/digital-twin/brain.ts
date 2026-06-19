/**
 * Digital Twin Brain Integration — Phase 36.
 *
 * READ/OBSERVE ONLY INVARIANT:
 * These functions provide factory context to the Brain reasoning layer.
 * They MUST NOT create, suggest, or expose direct PLC control commands.
 * Observation and analysis only. No autonomous actions.
 *
 * Designed as a foundation for the Industrial Copilot (Phase 38+).
 */

import { getAssetGraph, getDownstreamAssets, getUpstreamAssets } from "./graph";
import { listTagsForAsset } from "./tags";
import { calculateHealthScore } from "./health";
import type { TwinNodeRecord, AssetHealthScore } from "./types";

export interface FactoryTopology {
  organizationId: string;
  siteId:         string;
  nodeCount:      number;
  relationCount:  number;
  nodesByType:    Record<string, number>;
}

export interface AssetContext {
  node:        TwinNodeRecord;
  tags:        string[];       // registered tagPaths
  health:      AssetHealthScore | null;
  upstream:    TwinNodeRecord[];
  downstream:  TwinNodeRecord[];
}

export interface AssetDependencies {
  nodeId:     string;
  upstream:   TwinNodeRecord[];
  downstream: TwinNodeRecord[];
  cycleDetected: boolean;
  truncated:     boolean;
}

/**
 * Summarize the factory topology for a site.
 * Used by Industrial Copilot to answer questions like "what does this site contain?".
 */
export async function getFactoryTopology(
  organizationId: string,
  siteId:         string,
): Promise<FactoryTopology | null> {
  const graph = await getAssetGraph(organizationId, siteId);
  if (!graph) return null;

  const nodesByType: Record<string, number> = {};
  for (const node of graph.nodes.values()) {
    nodesByType[node.nodeType] = (nodesByType[node.nodeType] ?? 0) + 1;
  }

  return {
    organizationId,
    siteId,
    nodeCount:    graph.nodes.size,
    relationCount: graph.relations.length,
    nodesByType,
  };
}

/**
 * Get full operational context for a single asset node.
 * Includes health score, tag paths, and first-degree neighbors.
 */
export async function getAssetContext(
  nodeId:         string,
  organizationId: string,
  assetStatus     = "ACTIVE",
): Promise<AssetContext | null> {
  const { getNode } = await import("./nodes");
  const node = await getNode(nodeId, organizationId);
  if (!node) return null;

  const [tagsResult, healthResult, upResult, downResult] = await Promise.all([
    node.assetId ? listTagsForAsset(node.assetId, organizationId).then((t) => t.map((x) => x.tagPath)) : Promise.resolve([]),
    node.assetId ? calculateHealthScore({ organizationId, assetId: node.assetId, assetStatus }) : Promise.resolve(null),
    getUpstreamAssets(nodeId, organizationId),
    getDownstreamAssets(nodeId, organizationId),
  ]);

  if (healthResult) healthResult.nodeId = nodeId;

  return {
    node,
    tags:       tagsResult,
    health:     healthResult,
    upstream:   upResult.nodes,
    downstream: downResult.nodes,
  };
}

/**
 * Get dependency graph for an asset node.
 * Returns upstream suppliers and downstream consumers.
 * Cycle detection is surfaced in the result — does not throw.
 */
export async function getAssetDependencies(
  nodeId:         string,
  organizationId: string,
): Promise<AssetDependencies> {
  const [upResult, downResult] = await Promise.all([
    getUpstreamAssets(nodeId, organizationId),
    getDownstreamAssets(nodeId, organizationId),
  ]);
  return {
    nodeId,
    upstream:      upResult.nodes,
    downstream:    downResult.nodes,
    cycleDetected: upResult.cycleDetected || downResult.cycleDetected,
    truncated:     upResult.truncated     || downResult.truncated,
  };
}
