/**
 * Industrial Knowledge Graph — Deterministic Reasoning Helpers — Phase 41.
 *
 * Every explanation includes: path, edge types, evidence, confidence/weight,
 * and linked source record IDs. No black-box reasoning — all outputs are
 * fully traceable to source records.
 *
 * READ-ONLY: no mutations to graph or source tables.
 */

import { getAssetKnowledgeGraph, getFailureModeGraph, getProcedureImpactGraph, getRootCauseGraph, findShortestEvidencePath, type IGNodeRecord, type IGEdgeRecord, type IGStaleness } from "./query";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReasoningStep {
  nodeLabel:   string;
  nodeType:    string;
  entityId:    string;
  incomingEdge: {
    edgeType:  string;
    weight:    number;
    evidence:  Record<string, unknown>;
  } | null;
}

export interface AssetRiskExplanation {
  assetId:         string;
  assetLabel:      string | null;
  riskNodes:       { nodeId: string; entityId: string; weight: number; evidence: Record<string, unknown> }[];
  failureModes:    { entityId: string; label: string; weight: number }[];
  rootCauses:      { entityId: string; label: string; weight: number }[];
  procedures:      { entityId: string; label: string }[];
  overallRisk:     "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN";
  staleness:       IGStaleness;
}

export interface FailureModeExplanation {
  failureModeId:   string;
  failureModeLabel: string | null;
  rootCauses:      { entityId: string; label: string; weight: number; confidence: string }[];
  procedures:      { entityId: string; label: string; weight: number }[];
  affectedAssets:  { entityId: string; label: string }[];
  engineeringCases: { entityId: string; label: string }[];
  staleness:       IGStaleness;
}

export interface ProcedureRecommendationExplanation {
  procedureId:     string;
  procedureLabel:  string | null;
  mitigates:       { entityId: string; label: string; weight: number; severity: string }[];
  applicableAssets: { entityId: string; label: string }[];
  evidencePath:    ReasoningStep[];
  staleness:       IGStaleness;
}

export interface RootCauseExplanation {
  rootCauseId:     string;
  rootCauseLabel:  string | null;
  confidenceWeight: number;
  parentFailureMode: { entityId: string; label: string } | null;
  affectedAssets:  { entityId: string; label: string }[];
  engineeringCases: { entityId: string; label: string }[];
  evidencePath:    ReasoningStep[];
  staleness:       IGStaleness;
}

// ── Confidence bucket ─────────────────────────────────────────────────────────

function weightToConfidence(w: number): string {
  if (w <= 0.39) return "LOW";
  if (w <= 0.74) return "MEDIUM";
  return "HIGH";
}

function weightToRiskLabel(maxWeight: number): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN" {
  if (maxWeight <= 0) return "UNKNOWN";
  if (maxWeight <= 0.39) return "LOW";
  if (maxWeight <= 0.59) return "MEDIUM";
  if (maxWeight <= 0.79) return "HIGH";
  return "CRITICAL";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function edgesFrom(nodeId: string, edges: IGEdgeRecord[], edgeType?: string): IGEdgeRecord[] {
  return edges.filter(e => e.sourceNodeId === nodeId && (!edgeType || e.edgeType === edgeType));
}

function edgesTo(nodeId: string, edges: IGEdgeRecord[], edgeType?: string): IGEdgeRecord[] {
  return edges.filter(e => e.targetNodeId === nodeId && (!edgeType || e.edgeType === edgeType));
}

function nodeById(nodes: IGNodeRecord[], id: string): IGNodeRecord | undefined {
  return nodes.find(n => n.id === id);
}

// ── Public reasoning functions ────────────────────────────────────────────────

/**
 * Explain why an asset has elevated risk.
 * Traces: asset → (INDICATES_RISK from PREDICTIVE_RISK) + (HAS_FAILURE_MODE) → failure modes
 * → (CAUSED_BY) → root causes.
 */
export async function explainAssetRisk(
  orgId:   string,
  assetId: string,
): Promise<AssetRiskExplanation> {
  const { rootNode, nodes, edges, staleness } = await getAssetKnowledgeGraph(orgId, assetId, 4);

  if (!rootNode) {
    return { assetId, assetLabel: null, riskNodes: [], failureModes: [], rootCauses: [], procedures: [], overallRisk: "UNKNOWN", staleness };
  }

  // Risk nodes pointing TO this asset
  const riskEdges = edgesTo(rootNode.id, edges, "INDICATES_RISK");
  const riskNodes = riskEdges.map(e => {
    const rn = nodeById(nodes, e.sourceNodeId);
    return rn ? { nodeId: rn.id, entityId: rn.entityId, weight: e.weight, evidence: e.evidence } : null;
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  // Failure modes from this asset
  const fmEdges = edgesFrom(rootNode.id, edges, "HAS_FAILURE_MODE");
  const failureModes = fmEdges.map(e => {
    const fn = nodeById(nodes, e.targetNodeId);
    return fn ? { entityId: fn.entityId, label: fn.label, weight: e.weight } : null;
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  // Root causes (via failure modes)
  const rootCauses: { entityId: string; label: string; weight: number }[] = [];
  const procedures: { entityId: string; label: string }[] = [];
  for (const fm of fmEdges) {
    const fmNode = nodeById(nodes, fm.targetNodeId);
    if (!fmNode) continue;
    for (const rcEdge of edgesFrom(fmNode.id, edges, "CAUSED_BY")) {
      const rcNode = nodeById(nodes, rcEdge.targetNodeId);
      if (rcNode) rootCauses.push({ entityId: rcNode.entityId, label: rcNode.label, weight: rcEdge.weight });
    }
    for (const procEdge of edgesFrom(fmNode.id, edges, "MITIGATED_BY")) {
      const procNode = nodeById(nodes, procEdge.targetNodeId);
      if (procNode && !procedures.find(p => p.entityId === procNode.entityId)) {
        procedures.push({ entityId: procNode.entityId, label: procNode.label });
      }
    }
  }

  const maxWeight = Math.max(
    ...riskNodes.map(r => r.weight),
    ...fmEdges.map(e => e.weight),
    0,
  );

  return { assetId, assetLabel: rootNode.label, riskNodes, failureModes, rootCauses, procedures, overallRisk: weightToRiskLabel(maxWeight), staleness };
}

/**
 * Explain a failure mode: what causes it, what mitigates it, which assets it
 * was observed on, which engineering cases document it.
 */
export async function explainFailureMode(
  orgId:         string,
  failureModeId: string,
): Promise<FailureModeExplanation> {
  const { rootNode, nodes, edges, staleness } = await getFailureModeGraph(orgId, failureModeId, 4);

  if (!rootNode) {
    return { failureModeId, failureModeLabel: null, rootCauses: [], procedures: [], affectedAssets: [], engineeringCases: [], staleness };
  }

  // Root causes (outbound CAUSED_BY)
  const rootCauses = edgesFrom(rootNode.id, edges, "CAUSED_BY").map(e => {
    const n = nodeById(nodes, e.targetNodeId);
    return n ? { entityId: n.entityId, label: n.label, weight: e.weight, confidence: weightToConfidence(e.weight) } : null;
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  // Procedures that mitigate this failure mode (outbound MITIGATED_BY)
  const procedures = edgesFrom(rootNode.id, edges, "MITIGATED_BY").map(e => {
    const n = nodeById(nodes, e.targetNodeId);
    return n ? { entityId: n.entityId, label: n.label, weight: e.weight } : null;
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  // Assets that have this failure mode (inbound HAS_FAILURE_MODE)
  const affectedAssets = edgesTo(rootNode.id, edges, "HAS_FAILURE_MODE").map(e => {
    const n = nodeById(nodes, e.sourceNodeId);
    return n ? { entityId: n.entityId, label: n.label } : null;
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  // Engineering cases (outbound DOCUMENTED_IN)
  const engineeringCases = edgesFrom(rootNode.id, edges, "DOCUMENTED_IN").map(e => {
    const n = nodeById(nodes, e.targetNodeId);
    return n ? { entityId: n.entityId, label: n.label } : null;
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  return { failureModeId, failureModeLabel: rootNode.label, rootCauses, procedures, affectedAssets, engineeringCases, staleness };
}

/**
 * Explain why a procedure is recommended: which failure modes it mitigates
 * and which assets are affected by those failure modes.
 */
export async function explainProcedureRecommendation(
  orgId:       string,
  procedureId: string,
): Promise<ProcedureRecommendationExplanation> {
  const { rootNode, nodes, edges, staleness } = await getProcedureImpactGraph(orgId, procedureId, 4);

  if (!rootNode) {
    return { procedureId, procedureLabel: null, mitigates: [], applicableAssets: [], evidencePath: [], staleness };
  }

  // Failure modes mitigated by this procedure (inbound MITIGATED_BY)
  const mitigates = edgesTo(rootNode.id, edges, "MITIGATED_BY").map(e => {
    const n = nodeById(nodes, e.sourceNodeId);
    const severity = String(n?.metadata?.severity ?? "MEDIUM");
    return n ? { entityId: n.entityId, label: n.label, weight: e.weight, severity } : null;
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  // Assets that have those failure modes (inbound HAS_FAILURE_MODE to failure mode nodes)
  const applicableAssets: { entityId: string; label: string }[] = [];
  for (const fm of mitigates) {
    const fmNode = nodes.find(n => n.nodeType === "FAILURE_MODE" && n.entityId === fm.entityId);
    if (!fmNode) continue;
    for (const assetEdge of edgesTo(fmNode.id, edges, "HAS_FAILURE_MODE")) {
      const assetNode = nodeById(nodes, assetEdge.sourceNodeId);
      if (assetNode && !applicableAssets.find(a => a.entityId === assetNode.entityId)) {
        applicableAssets.push({ entityId: assetNode.entityId, label: assetNode.label });
      }
    }
  }

  // Build evidence path (procedure ← mitigated_by ← failure_mode ← has_failure_mode ← asset)
  const evidencePath: ReasoningStep[] = [
    { nodeLabel: rootNode.label, nodeType: rootNode.nodeType, entityId: rootNode.entityId, incomingEdge: null },
    ...mitigates.map(m => ({ nodeLabel: m.label, nodeType: "FAILURE_MODE", entityId: m.entityId, incomingEdge: { edgeType: "MITIGATED_BY", weight: m.weight, evidence: {} } })),
  ];

  return { procedureId, procedureLabel: rootNode.label, mitigates, applicableAssets, evidencePath, staleness };
}

/**
 * Explain a root cause candidate: confidence weight, parent failure mode,
 * affected assets, supporting engineering cases.
 */
export async function explainRootCauseCandidate(
  orgId:       string,
  rootCauseId: string,
): Promise<RootCauseExplanation> {
  const { rootNode, nodes, edges, staleness } = await getRootCauseGraph(orgId, rootCauseId, 4);

  if (!rootNode) {
    return { rootCauseId, rootCauseLabel: null, confidenceWeight: 0, parentFailureMode: null, affectedAssets: [], engineeringCases: [], evidencePath: [], staleness };
  }

  const confidenceWeight = Number((rootNode.metadata as Record<string, unknown>).confidenceWeight ?? 0.5);

  // Parent failure mode (inbound CAUSED_BY)
  const causedByEdges = edgesTo(rootNode.id, edges, "CAUSED_BY");
  const parentFmEdge  = causedByEdges[0];
  const parentFm      = parentFmEdge ? nodeById(nodes, parentFmEdge.sourceNodeId) : undefined;
  const parentFailureMode = parentFm ? { entityId: parentFm.entityId, label: parentFm.label } : null;

  // Assets affected by the parent failure mode
  const affectedAssets: { entityId: string; label: string }[] = [];
  if (parentFm) {
    for (const assetEdge of edgesTo(parentFm.id, edges, "HAS_FAILURE_MODE")) {
      const assetNode = nodeById(nodes, assetEdge.sourceNodeId);
      if (assetNode) affectedAssets.push({ entityId: assetNode.entityId, label: assetNode.label });
    }
    // OBSERVED_ON edges from parent FM
    for (const obsEdge of edgesFrom(parentFm.id, edges, "OBSERVED_ON")) {
      const assetNode = nodeById(nodes, obsEdge.targetNodeId);
      if (assetNode && !affectedAssets.find(a => a.entityId === assetNode.entityId)) {
        affectedAssets.push({ entityId: assetNode.entityId, label: assetNode.label });
      }
    }
  }

  // Engineering cases documenting the parent failure mode
  const engineeringCases: { entityId: string; label: string }[] = [];
  if (parentFm) {
    for (const docEdge of edgesFrom(parentFm.id, edges, "DOCUMENTED_IN")) {
      const caseNode = nodeById(nodes, docEdge.targetNodeId);
      if (caseNode) engineeringCases.push({ entityId: caseNode.entityId, label: caseNode.label });
    }
  }

  // Evidence path: asset → HAS_FAILURE_MODE → FM → CAUSED_BY → root cause
  const evidencePath: ReasoningStep[] = [];
  if (affectedAssets[0]) {
    const sampleAssetEntityId = affectedAssets[0].entityId;
    const pathResult = await findShortestEvidencePath(
      orgId,
      nodes.find(n => n.nodeType === "ASSET" && n.entityId === sampleAssetEntityId)?.id ?? "",
      rootNode.id,
      6,
    );
    if (pathResult.found) {
      for (const hop of pathResult.path) {
        evidencePath.push({ nodeLabel: hop.node.label, nodeType: hop.node.nodeType, entityId: hop.node.entityId, incomingEdge: hop.incomingEdge ? { edgeType: hop.incomingEdge.edgeType, weight: hop.incomingEdge.weight, evidence: hop.incomingEdge.evidence } : null });
      }
    }
  }

  return { rootCauseId, rootCauseLabel: rootNode.label, confidenceWeight, parentFailureMode, affectedAssets, engineeringCases, evidencePath, staleness };
}
