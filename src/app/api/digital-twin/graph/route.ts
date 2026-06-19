import { NextRequest, NextResponse }  from "next/server";
import { requirePlatformAuth }        from "@/lib/api/auth";
import { requireOrgActor }            from "@/lib/org/context";
import { requirePermission }          from "@/lib/org/rbac";
import { getAssetGraph }              from "@/lib/digital-twin/graph";
import { meterIndustrialEvent }       from "@/lib/api/meter";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_digital_twin");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "siteId is required" }, { status: 400 });

  const graph = await getAssetGraph(ctx.orgId, siteId);
  if (!graph) return NextResponse.json({ error: "No graph data available" }, { status: 503 });

  meterIndustrialEvent(ctx.orgId, "digital_twin_queries");

  // Serialize Map to plain object for JSON response
  const nodes = Object.fromEntries(graph.nodes);
  return NextResponse.json({ siteId: graph.siteId, nodes, relations: graph.relations });
}
