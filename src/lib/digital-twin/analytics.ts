/**
 * Digital Twin data-quality analytics — Phase 36.
 *
 * Produces DataQualityWarnings for:
 *   - orphan_node              : ASSET/SYSTEM node with no relations and no parent
 *   - missing_asset_reference  : ASSET node whose assetId no longer resolves to a known asset
 *   - cyclic_relation          : cycle detected during traversal
 *   - disconnected_critical    : ASSET node attached to a gateway but with no upstream relations
 *
 * Warnings do NOT block normal operation — they are advisory.
 * READ/OBSERVE ONLY: No writes to industrial hardware.
 */

import type {
  AssetGraph, DataQualityWarning, TwinNodeRecord, TwinRelationRecord,
} from "./types";
import { buildAdjacency, traverseDownstream } from "./relations";

export function detectDataQualityWarnings(
  graph: AssetGraph,
  knownAssetIds: Set<string>,
): DataQualityWarning[] {
  const warnings: DataQualityWarning[] = [];
  const nodes     = [...graph.nodes.values()];
  const relations = graph.relations;
  const { forward, backward } = buildAdjacency(relations);

  // ── Build set of node IDs that have any relation ──────────────────────────
  const hasRelation = new Set<string>();
  for (const rel of relations) {
    hasRelation.add(rel.sourceNodeId);
    hasRelation.add(rel.targetNodeId);
  }

  for (const node of nodes) {
    // orphan_node: no relations and no parent pointer
    if (!hasRelation.has(node.id) && !node.parentNodeId) {
      if (node.nodeType === "ASSET" || node.nodeType === "SYSTEM") {
        warnings.push({
          type:    "orphan_node",
          nodeId:  node.id,
          message: `Node "${node.displayName}" (${node.nodeType}) has no relations and no parent.`,
        });
      }
    }

    // missing_asset_reference: ASSET node whose assetId is unknown
    if (node.nodeType === "ASSET" && node.assetId && !knownAssetIds.has(node.assetId)) {
      warnings.push({
        type:    "missing_asset_reference",
        nodeId:  node.id,
        message: `ASSET node "${node.displayName}" references unknown asset id "${node.assetId}".`,
      });
    }

    // disconnected_critical: ASSET node with no upstream (CONTROLS/FEEDS/PART_OF) relations
    if (node.nodeType === "ASSET") {
      const upEdges = (backward.get(node.id) ?? []);
      const hasMeaningfulUpstream = upEdges.some(
        (e) => e.relationType !== "CONNECTED_TO" && e.relationType !== "MONITORS",
      );
      if (!hasMeaningfulUpstream && hasRelation.has(node.id)) {
        warnings.push({
          type:    "disconnected_critical",
          nodeId:  node.id,
          message: `ASSET node "${node.displayName}" has no upstream CONTROLS/FEEDS/PART_OF edges — it is operationally disconnected.`,
        });
      }
    }
  }

  // ── Cycle detection via DFS ───────────────────────────────────────────────
  const cycleNodeIds = detectCycles(nodes, forward);
  for (const nodeId of cycleNodeIds) {
    const node = graph.nodes.get(nodeId);
    warnings.push({
      type:    "cyclic_relation",
      nodeId,
      message: `Cycle detected in graph involving node "${node?.displayName ?? nodeId}". Traversal will terminate at this node.`,
    });
  }

  return warnings;
}

function detectCycles(
  nodes:   TwinNodeRecord[],
  forward: Map<string, { targetId: string; relationType: string }[]>,
): Set<string> {
  // DFS-based cycle detection using coloring (white=0, gray=1, black=2)
  const color   = new Map<string, number>();
  const inCycle = new Set<string>();

  function dfs(id: string): boolean {
    const c = color.get(id) ?? 0;
    if (c === 1) { inCycle.add(id); return true; } // back edge — cycle
    if (c === 2) return false;
    color.set(id, 1);
    for (const { targetId } of (forward.get(id) ?? [])) {
      if (dfs(targetId)) inCycle.add(id);
    }
    color.set(id, 2);
    return false;
  }

  for (const node of nodes) {
    if (!color.get(node.id)) dfs(node.id);
  }
  return inCycle;
}
