/**
 * Industrial Knowledge Graph — Copilot Bridge — Phase 41.
 *
 * READ-ONLY context adapters consumed by the Industrial Copilot (Phase 38).
 * MUST NOT mutate graph or source tables.
 * All functions degrade gracefully to empty context on error.
 */

import { getKnowledgeGraph, getAssetKnowledgeGraph, findShortestEvidencePath } from "./query";
import { explainAssetRisk } from "./reasoning";

const MAX_CONTEXT_NODES = 30;
const MAX_CONTEXT_EDGES = 50;
const MAX_CONTEXT_PATH  = 10;

export interface KGContextSummary {
  totalNodes:  number;
  totalEdges:  number;
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
  lastBuiltAt: string | null;
  stale:       boolean;
}

export interface EvidencePathContext {
  found:            boolean;
  sourceNodeLabel:  string | null;
  targetNodeLabel:  string | null;
  hopCount:         number;
  path:             { nodeLabel: string; nodeType: string; edgeType: string | null; weight: number | null }[];
  totalCost:        number;
  lastBuiltAt:      string | null;
  stale:            boolean;
}

export interface AssetReasoningContext {
  assetId:         string;
  assetLabel:      string | null;
  overallRisk:     string;
  failureModeCount: number;
  rootCauseCount:  number;
  procedureCount:  number;
  riskNodeCount:   number;
  topFailureModes: { label: string; weight: number }[];
  topRootCauses:   { label: string; weight: number }[];
  lastBuiltAt:     string | null;
  stale:           boolean;
}

/** Summary of the org's knowledge graph for Copilot context. */
export async function getKnowledgeGraphContext(orgId: string): Promise<KGContextSummary> {
  try {
    const result = await getKnowledgeGraph(orgId);
    const nodes  = result.nodes.slice(0, MAX_CONTEXT_NODES);
    const edges  = result.edges.slice(0, MAX_CONTEXT_EDGES);
    const nodesByType: Record<string, number> = {};
    const edgesByType: Record<string, number> = {};
    for (const n of nodes) nodesByType[n.nodeType] = (nodesByType[n.nodeType] ?? 0) + 1;
    for (const e of edges) edgesByType[e.edgeType] = (edgesByType[e.edgeType] ?? 0) + 1;
    return { totalNodes: result.nodeCount, totalEdges: result.edgeCount, nodesByType, edgesByType, lastBuiltAt: result.staleness.lastBuiltAt, stale: result.staleness.stale };
  } catch {
    return { totalNodes: 0, totalEdges: 0, nodesByType: {}, edgesByType: {}, lastBuiltAt: null, stale: true };
  }
}

/** Evidence path context between two graph node IDs for Copilot. */
export async function getEvidencePathContext(
  orgId:        string,
  sourceNodeId: string,
  targetNodeId: string,
): Promise<EvidencePathContext> {
  try {
    const result = await findShortestEvidencePath(orgId, sourceNodeId, targetNodeId);
    const cappedPath = result.path.slice(0, MAX_CONTEXT_PATH);

    return {
      found:           result.found,
      sourceNodeLabel: result.path[0]?.node.label ?? null,
      targetNodeLabel: result.path[result.path.length - 1]?.node.label ?? null,
      hopCount:        result.path.length > 0 ? result.path.length - 1 : 0,
      path:            cappedPath.map((h, i) => ({
        nodeLabel: h.node.label,
        nodeType:  h.node.nodeType,
        edgeType:  h.incomingEdge?.edgeType ?? null,
        weight:    h.incomingEdge?.weight ?? null,
      })),
      totalCost:   result.totalCost,
      lastBuiltAt: result.staleness.lastBuiltAt,
      stale:       result.staleness.stale,
    };
  } catch {
    return { found: false, sourceNodeLabel: null, targetNodeLabel: null, hopCount: 0, path: [], totalCost: 0, lastBuiltAt: null, stale: true };
  }
}

/** Asset reasoning context — risk, failure modes, root causes — for Copilot. */
export async function getAssetReasoningContext(
  orgId:   string,
  assetId: string,
): Promise<AssetReasoningContext> {
  try {
    const explanation = await explainAssetRisk(orgId, assetId);
    return {
      assetId,
      assetLabel:       explanation.assetLabel,
      overallRisk:      explanation.overallRisk,
      failureModeCount: explanation.failureModes.length,
      rootCauseCount:   explanation.rootCauses.length,
      procedureCount:   explanation.procedures.length,
      riskNodeCount:    explanation.riskNodes.length,
      topFailureModes:  explanation.failureModes.slice(0, 5).map(f => ({ label: f.label, weight: f.weight })),
      topRootCauses:    explanation.rootCauses.slice(0, 5).map(r => ({ label: r.label, weight: r.weight })),
      lastBuiltAt:      explanation.staleness.lastBuiltAt,
      stale:            explanation.staleness.stale,
    };
  } catch {
    return { assetId, assetLabel: null, overallRisk: "UNKNOWN", failureModeCount: 0, rootCauseCount: 0, procedureCount: 0, riskNodeCount: 0, topFailureModes: [], topRootCauses: [], lastBuiltAt: null, stale: true };
  }
}
