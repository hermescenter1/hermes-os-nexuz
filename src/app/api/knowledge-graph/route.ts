import { NextResponse } from "next/server";
import { hasAuthoring } from "@/lib/auth/api-guards";
import { getKnowledgeGraph } from "@/lib/services/knowledge-graph-service";
import { getStorageMode } from "@/lib/storage/storage-mode";

const EMPTY_SUMMARY = {
  totalNodes: 0, totalEdges: 0,
  nodesByType:  { project: 0, memory: 0, domain: 0, case: 0, risk: 0, outcome: 0, solution: 0 },
  edgesByType:  { belongs_to_project: 0, related_to_domain: 0, has_outcome: 0, has_risk: 0, similar_to: 0, resolved_by: 0 },
  connectedComponents: 0, avgDegree: 0, isolatedNodes: 0,
};


/**
 * PHASE 90 — these routes project the PRIVATE engineering memory store
 * (raw query text, project names, outcomes) into graph form. Their canonical
 * sources (/api/memory, /api/projects) were gated by Phase 82C, so leaving the
 * graph projections anonymous was a side door around that hardening. The gate
 * mirrors 82C exactly: authoring callers get the real graph, everyone else gets
 * the same empty shape the error path already returns (200, no shape change,
 * no existence disclosure). The public /api/eng-graph route is unaffected —
 * it only ever exposes PUBLISHED cases.
 */
/** GET /api/knowledge-graph — deterministic engineering knowledge graph. */
export async function GET() {
  const storageMode = getStorageMode();
  if (!(await hasAuthoring())) {
    return NextResponse.json({ storageMode, nodes: [], edges: [], summary: EMPTY_SUMMARY });
  }
  try {
    const graph = await getKnowledgeGraph();
    return NextResponse.json({ storageMode, ...graph });
  } catch {
    return NextResponse.json({ storageMode, nodes: [], edges: [], summary: EMPTY_SUMMARY });
  }
}
