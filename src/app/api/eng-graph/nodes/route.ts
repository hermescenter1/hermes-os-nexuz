/** GET /api/eng-graph/nodes — Phase 56C. Returns nodes only (no edges). */
import { NextResponse } from "next/server";
import { buildEngGraph } from "@/lib/eng-graph/builder";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url  = new URL(req.url);
  const type = url.searchParams.get("type");

  try {
    const { nodes, builtAt } = await buildEngGraph();
    const filtered = type ? nodes.filter(n => n.type === type) : nodes;
    return NextResponse.json({ nodes: filtered, total: filtered.length, builtAt });
  } catch {
    return NextResponse.json({ nodes: [], total: 0 }, { status: 500 });
  }
}
