/**
 * GET /api/industrial-graph/procedures/[procedureId]
 *
 * Returns the knowledge subgraph rooted at a PROCEDURE node,
 * plus the deterministic procedure recommendation explanation.
 *
 * Phase 41 — Industrial Knowledge Graph.
 */

import { NextRequest, NextResponse }              from "next/server";
import { requirePlatformAuth }                     from "@/lib/api/auth";
import { requireOrgActor }                         from "@/lib/org/context";
import { requirePermission }                       from "@/lib/org/rbac";
import { getProcedureImpactGraph }                 from "@/lib/knowledge-graph/query";
import { explainProcedureRecommendation }          from "@/lib/knowledge-graph/reasoning";
import { recordAuditEvent, KNOWLEDGE_GRAPH_AUDIT } from "@/lib/audit/audit-service";
import { meterIndustrialEvent }                    from "@/lib/api/meter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req:     NextRequest,
  context: { params: Promise<{ procedureId: string }> },
) {
  const { procedureId } = await context.params;

  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_knowledge_graph");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  meterIndustrialEvent(ctx.orgId, "knowledge_graph_queries");

  const [subgraph, explanation] = await Promise.all([
    getProcedureImpactGraph(ctx.orgId, procedureId),
    explainProcedureRecommendation(ctx.orgId, procedureId),
  ]);

  recordAuditEvent({
    userId:     ctx.userId ?? undefined,
    action:     KNOWLEDGE_GRAPH_AUDIT.REASONING_QUERY,
    entityType: "knowledge_graph",
    entityId:   procedureId,
    metadata:   { organizationId: ctx.orgId, procedureId, queryType: "procedure_impact_graph", stale: subgraph.staleness.stale },
  });

  meterIndustrialEvent(ctx.orgId, "knowledge_graph_reasoning_queries");

  return NextResponse.json({ procedureId, subgraph, explanation });
}
