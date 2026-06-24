/** GET /api/eng-graph/edges — Phase 56C. Returns edges only. */
import { NextResponse } from "next/server";
import { buildEngGraph } from "@/lib/eng-graph/builder";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url  = new URL(req.url);
  const type = url.searchParams.get("type");

  try {
    const { edges, builtAt } = await buildEngGraph();
    const filtered = type ? edges.filter(e => e.type === type) : edges;
    return NextResponse.json({ edges: filtered, total: filtered.length, builtAt });
  } catch {
    return NextResponse.json({ edges: [], total: 0 }, { status: 500 });
  }
}
