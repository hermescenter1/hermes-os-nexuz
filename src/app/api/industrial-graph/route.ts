/**
 * GET /api/industrial-graph
 *
 * Returns the full industrial knowledge graph for the org (all nodes + edges)
 * with staleness information. Always returns results even when graph is stale.
 *
 * Phase 41 — Industrial Knowledge Graph.
 * Distinct from Phase 21A /api/knowledge-graph (brain analytics graph).
 */

import { NextRequest, NextResponse }           from "next/server";
import { requirePlatformAuth }                  from "@/lib/api/auth";
import { requireOrgActor }                      from "@/lib/org/context";
import { requirePermission }                    from "@/lib/org/rbac";
import { getKnowledgeGraph }                    from "@/lib/knowledge-graph/query";
import { recordAuditEvent, KNOWLEDGE_GRAPH_AUDIT } from "@/lib/audit/audit-service";
import { meterIndustrialEvent }                 from "@/lib/api/meter";

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

  meterIndustrialEvent(ctx.orgId, "knowledge_graph_queries");

  const result = await getKnowledgeGraph(ctx.orgId);

  recordAuditEvent({
    userId:     ctx.userId ?? undefined,
    action:     KNOWLEDGE_GRAPH_AUDIT.GRAPH_QUERY,
    entityType: "knowledge_graph",
    entityId:   ctx.orgId,
    metadata:   { organizationId: ctx.orgId, nodeCount: result.nodeCount, edgeCount: result.edgeCount, stale: result.staleness.stale },
  });

  return NextResponse.json(result);
}
