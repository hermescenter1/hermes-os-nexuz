/**
 * GET /api/industrial-graph/path?from=<nodeId>&to=<nodeId>
 *
 * Returns the strongest-evidence path between two industrial graph nodes
 * using Dijkstra over edge cost (1 − weight). Directed edges are enforced.
 * Returns { found: false } when no path exists, never 404.
 *
 * Query params:
 *   from  — IndustrialKnowledgeGraphNode.id (source)
 *   to    — IndustrialKnowledgeGraphNode.id (target)
 *
 * Phase 41 — Industrial Knowledge Graph.
 */

import { NextRequest, NextResponse }              from "next/server";
import { requirePlatformAuth }                     from "@/lib/api/auth";
import { requireOrgActor }                         from "@/lib/org/context";
import { requirePermission }                       from "@/lib/org/rbac";
import { findShortestEvidencePath }                from "@/lib/knowledge-graph/query";
import { recordAuditEvent, KNOWLEDGE_GRAPH_AUDIT } from "@/lib/audit/audit-service";
import { meterIndustrialEvent }                    from "@/lib/api/meter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_knowledge_graph");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const { searchParams } = new URL(req.url);
  const fromId = searchParams.get("from") ?? "";
  const toId   = searchParams.get("to")   ?? "";

  if (!fromId || !toId) {
    return NextResponse.json({ error: "Both 'from' and 'to' node IDs are required." }, { status: 400 });
  }

  meterIndustrialEvent(ctx.orgId, "knowledge_graph_path_queries");

  const result = await findShortestEvidencePath(ctx.orgId, fromId, toId);

  recordAuditEvent({
    userId:     ctx.userId ?? undefined,
    action:     KNOWLEDGE_GRAPH_AUDIT.PATH_QUERY,
    entityType: "knowledge_graph",
    entityId:   ctx.orgId,
    metadata:   { organizationId: ctx.orgId, fromId, toId, found: result.found, hopCount: result.path.length, stale: result.staleness.stale },
  });

  return NextResponse.json({ fromId, toId, ...result });
}
