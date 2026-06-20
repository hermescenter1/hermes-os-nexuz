/**
 * POST /api/industrial-graph/rebuild
 *
 * Triggers a full rebuild of the industrial knowledge graph for the org.
 * Requires manage_knowledge_graph permission (OWNER/ADMIN/MANAGER).
 * Returns 409 if a rebuild is already in progress for this org.
 * Rebuild runs inside a transaction; failure leaves the previous graph intact.
 *
 * Phase 41 — Industrial Knowledge Graph.
 */

import { NextRequest, NextResponse }                from "next/server";
import { requirePlatformAuth }                       from "@/lib/api/auth";
import { requireOrgActor }                           from "@/lib/org/context";
import { requirePermission }                         from "@/lib/org/rbac";
import { rebuildKnowledgeGraph, isRebuildInFlight }  from "@/lib/knowledge-graph/builder";
import { recordAuditEvent, KNOWLEDGE_GRAPH_AUDIT }   from "@/lib/audit/audit-service";
import { meterIndustrialEvent }                      from "@/lib/api/meter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "manage_knowledge_graph");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  if (isRebuildInFlight(ctx.orgId)) {
    return NextResponse.json(
      { error: "A rebuild is already in progress for this organization. Try again shortly." },
      { status: 409 },
    );
  }

  meterIndustrialEvent(ctx.orgId, "knowledge_graph_rebuilds");

  try {
    const summary = await rebuildKnowledgeGraph(ctx.orgId);

    recordAuditEvent({
      userId:     ctx.userId ?? undefined,
      action:     KNOWLEDGE_GRAPH_AUDIT.GRAPH_REBUILT,
      entityType: "knowledge_graph",
      entityId:   ctx.orgId,
      metadata:   { organizationId: ctx.orgId, ...summary },
    });

    return NextResponse.json({ success: true, summary });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "REBUILD_IN_FLIGHT") {
      return NextResponse.json({ error: "Rebuild already in progress." }, { status: 409 });
    }
    return NextResponse.json({ error: "Rebuild failed. Check server logs." }, { status: 500 });
  }
}
