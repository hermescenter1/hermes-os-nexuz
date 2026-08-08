/**
 * GET /api/eng-graph/node/[id] — Phase 56C / 56E.
 *
 * Returns a single node with its inbound edges, outbound edges,
 * and connected neighbour nodes.
 */
import type { NextRequest } from "next/server";
import { guardDerivedGraphRequest } from "@/lib/eng-graph/public-guard";
import { NextResponse }  from "next/server";
import { buildEngGraph } from "@/lib/eng-graph/builder";

export const dynamic = "force-dynamic";

export async function GET(
  req:      NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // PHASE 99 (P99-INT-011) — bound this anonymous graph rebuild.
  const limited = await guardDerivedGraphRequest(req);
  if (limited) return limited;

  const { id } = await params;

  try {
    const { nodes, edges } = await buildEngGraph();
    const target = nodes.find(n => n.id === id);
    if (!target) return NextResponse.json({ error: "node_not_found" }, { status: 404 });

    const outbound       = edges.filter(e => e.source === id);
    const inbound        = edges.filter(e => e.target === id);
    const neighbourIds   = new Set([...outbound.map(e => e.target), ...inbound.map(e => e.source)]);
    const connectedNodes = nodes.filter(n => neighbourIds.has(n.id));

    return NextResponse.json({
      node:           target,
      outboundEdges:  outbound,
      inboundEdges:   inbound,
      connectedNodes,
    });
  } catch {
    return NextResponse.json({ error: "node_not_found" }, { status: 404 });
  }
}
