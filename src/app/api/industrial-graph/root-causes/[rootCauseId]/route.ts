/**
 * GET /api/industrial-graph/root-causes/[rootCauseId]
 *
 * Returns the knowledge subgraph rooted at a ROOT_CAUSE node,
 * plus the deterministic root cause explanation.
 *
 * Phase 41 — Industrial Knowledge Graph.
 */

import { NextRequest, NextResponse }              from "next/server";
import { requirePlatformAuth }                     from "@/lib/api/auth";
import { requireOrgActor }                         from "@/lib/org/context";
import { requirePermission }                       from "@/lib/org/rbac";
import { getRootCauseGraph, loadScopedGraphContext } from "@/lib/knowledge-graph/query";
import { resolveGraphViewerScope }                 from "@/lib/knowledge-graph/visibility";
import { explainRootCauseCandidate }               from "@/lib/knowledge-graph/reasoning";
import { recordAuditEvent, KNOWLEDGE_GRAPH_AUDIT } from "@/lib/audit/audit-service";
import { meterIndustrialEvent }                    from "@/lib/api/meter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req:     NextRequest,
  context: { params: Promise<{ rootCauseId: string }> },
) {
  const { rootCauseId } = await context.params;

  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_knowledge_graph");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  meterIndustrialEvent(ctx.orgId, "knowledge_graph_queries");

  // RV-01: subgraph and explanation are both bounded by the viewer's site scope.
  // S2-03: the scoped graph (and with it the visible entity sets) is resolved ONCE for this request and
  // shared by the subgraph, the explanation and its evidence path — it used to be resolved three times.
  const scope = await resolveGraphViewerScope(member.ctx.userId, ctx.orgId, member.ctx.role);
  const graphCtx = await loadScopedGraphContext(scope);
  const [subgraph, explanation] = await Promise.all([
    getRootCauseGraph(scope, rootCauseId, undefined, graphCtx),
    explainRootCauseCandidate(scope, rootCauseId, graphCtx),
  ]);

  recordAuditEvent({
    userId:     ctx.userId ?? undefined,
    action:     KNOWLEDGE_GRAPH_AUDIT.REASONING_QUERY,
    entityType: "knowledge_graph",
    entityId:   rootCauseId,
    metadata:   { organizationId: ctx.orgId, rootCauseId, queryType: "root_cause_graph", stale: subgraph.staleness.stale },
  });

  meterIndustrialEvent(ctx.orgId, "knowledge_graph_reasoning_queries");

  return NextResponse.json({ rootCauseId, subgraph, explanation });
}
