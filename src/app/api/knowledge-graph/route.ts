import { NextResponse } from "next/server";
import { getKnowledgeGraph } from "@/lib/services/knowledge-graph-service";
import { getStorageMode } from "@/lib/storage/storage-mode";

const EMPTY_SUMMARY = {
  totalNodes: 0, totalEdges: 0,
  nodesByType:  { project: 0, memory: 0, domain: 0, case: 0, risk: 0, outcome: 0, solution: 0 },
  edgesByType:  { belongs_to_project: 0, related_to_domain: 0, has_outcome: 0, has_risk: 0, similar_to: 0, resolved_by: 0 },
  connectedComponents: 0, avgDegree: 0, isolatedNodes: 0,
};

/** GET /api/knowledge-graph — deterministic engineering knowledge graph. */
export async function GET() {
  const storageMode = getStorageMode();
  try {
    const graph = await getKnowledgeGraph();
    return NextResponse.json({ storageMode, ...graph });
  } catch {
    return NextResponse.json({ storageMode, nodes: [], edges: [], summary: EMPTY_SUMMARY });
  }
}
