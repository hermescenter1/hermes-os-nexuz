/**
 * GET /api/eng-graph
 *
 * Phase 56C — Hermes Engineering Knowledge Graph.
 * Returns full snapshot: nodes, edges, stats.
 *
 * Distinct from:
 *   /api/knowledge-graph  (Phase 21A — brain analytics meta-graph)
 *   /api/industrial-graph (Phase 41 — org-scoped Prisma graph)
 *
 * This endpoint builds the industrial engineering relationship graph
 * deterministically from static vendor catalog + engineering case corpus.
 * No auth required (static data only). No database calls unless the
 * knowledge/case repositories have published records.
 */

import { NextResponse } from "next/server";
import { buildEngGraph } from "@/lib/eng-graph/builder";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await buildEngGraph();
    return NextResponse.json(snapshot);
  } catch (err) {
    console.error("[eng-graph] build error:", err);
    return NextResponse.json(
      { error: "Graph build failed", nodes: [], edges: [], stats: null },
      { status: 500 },
    );
  }
}
