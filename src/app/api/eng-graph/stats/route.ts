/**
 * GET /api/eng-graph/stats — Phase 56C.
 *
 * Returns graph statistics:
 *   totalNodes, totalEdges, vendors, protocols, assets,
 *   cases, knowledgeLinks, graphDensity, nodesByType, edgesByType
 */
import { NextResponse } from "next/server";
import { buildEngGraph } from "@/lib/eng-graph/builder";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { stats, builtAt, version } = await buildEngGraph();
    return NextResponse.json({ ...stats, builtAt, version });
  } catch {
    return NextResponse.json({ error: "stats unavailable" }, { status: 500 });
  }
}
