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

import { getPrisma } from "@/lib/db/prisma";
import { getAssetGraph, getDownstreamAssets, getUpstreamAssets } from "./graph";
import { listTagsForAsset } from "./tags";
import { calculateHealthScore } from "./health";
import type { TwinNodeRecord, AssetHealthScore } from "./types";

type SiteModel = { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };

export interface FactoryTopology {
  organizationId: string;
  siteId:         string;
  nodeCount:      number;
  relationCount:  number;
  nodesByType:    Record<string, number>;
  /** true when the site graph hit its node/relation ceiling — the counts are then lower bounds. */
  truncated:      boolean;
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
 *
 * Slice D2: `allowedSiteIds` is REQUIRED — the caller's server-derived readable ACTIVE sites. A site
 * outside it (hidden, inactive, foreign or nonexistent) is `null` without any graph read, and an empty
 * scope is `null`. The counts come from {@link getAssetGraph}, which reads only nodes of that site and
 * relations whose BOTH endpoints are at that site, bounded and ordered; `truncated` is carried through.
 */
export async function getFactoryTopology(
  organizationId: string,
  siteId:         string,
  allowedSiteIds: readonly string[],
): Promise<FactoryTopology | null> {
  if (!organizationId || !siteId || !allowedSiteIds.includes(siteId)) return null;
  // The scope is server-derived and ACTIVE-only; re-checked here so a stale scope cannot read a site
  // that has since been deactivated.
  const prisma = await getPrisma();
  if (!prisma) return null;
  const site = await (prisma.industrialSite as unknown as SiteModel).findFirst({
    where:  { id: siteId, organizationId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!site) return null;
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
    truncated:    graph.truncated ?? false,
  };
}

/**
 * Get full operational context for a single asset node.
 * Includes health score, tag paths, and first-degree neighbors.
 *
 * Slice C (IR-03): `allowedSiteIds` is REQUIRED — the caller's readable ACTIVE sites. A node on any other
 * site is "not found", and the neighbours are limited to the same sites.
 */
export async function getAssetContext(
  nodeId:         string,
  organizationId: string,
  allowedSiteIds: readonly string[],
  assetStatus     = "ACTIVE",
): Promise<AssetContext | null> {
  const { getNode } = await import("./nodes");
  const node = await getNode(nodeId, organizationId);
  if (!node || !allowedSiteIds.includes(node.siteId)) return null;

  const [tagsResult, healthResult, upResult, downResult] = await Promise.all([
    node.assetId ? listTagsForAsset(node.assetId, organizationId, { allowedSiteIds: [...allowedSiteIds] }).then((t) => t.map((x) => x.tagPath)) : Promise.resolve([]),
    node.assetId ? calculateHealthScore({ organizationId, assetId: node.assetId, assetStatus }) : Promise.resolve(null),
    getUpstreamAssets(nodeId, organizationId, allowedSiteIds),
    getDownstreamAssets(nodeId, organizationId, allowedSiteIds),
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
  allowedSiteIds: readonly string[],
): Promise<AssetDependencies> {
  const [upResult, downResult] = await Promise.all([
    getUpstreamAssets(nodeId, organizationId, allowedSiteIds),
    getDownstreamAssets(nodeId, organizationId, allowedSiteIds),
  ]);
  return {
    nodeId,
    upstream:      upResult.nodes,
    downstream:    downResult.nodes,
    cycleDetected: upResult.cycleDetected || downResult.cycleDetected,
    truncated:     upResult.truncated     || downResult.truncated,
  };
}
