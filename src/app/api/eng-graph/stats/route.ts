/**
 * GET /api/eng-graph/stats — Phase 56C.
 *
 * Returns graph statistics:
 *   totalNodes, totalEdges, vendors, protocols, assets,
 *   cases, knowledgeLinks, graphDensity, nodesByType, edgesByType
 */
import type { NextRequest } from "next/server";
import { guardDerivedGraphRequest } from "@/lib/eng-graph/public-guard";
import { NextResponse } from "next/server";
import { buildEngGraph } from "@/lib/eng-graph/builder";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // PHASE 99 (P99-INT-011) — bound this anonymous graph rebuild.
  const limited = await guardDerivedGraphRequest(req);
  if (limited) return limited;

  try {
    const { stats, builtAt, version } = await buildEngGraph();
    return NextResponse.json({ ...stats, builtAt, version });
  } catch {
    return NextResponse.json({ error: "stats unavailable" }, { status: 500 });
  }
}
