import { NextRequest, NextResponse }               from "next/server";
import { requirePlatformAuth }                      from "@/lib/api/auth";
import { requireOrgActor }                          from "@/lib/org/context";
import { requirePermission }                        from "@/lib/org/rbac";
import { listProcedures, createProcedure, getRecommendedProcedures } from "@/lib/knowledge/procedures";
import { recordAuditEvent, KNOWLEDGE_AUDIT }        from "@/lib/audit/audit-service";
import { meterIndustrialEvent }                     from "@/lib/api/meter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_knowledge");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const { searchParams } = new URL(req.url);
  const assetId   = searchParams.get("assetId");
  const assetType = searchParams.get("assetType") ?? undefined;
  const status    = searchParams.get("status") ?? undefined;
  const limit     = Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10));

  meterIndustrialEvent(ctx.orgId, "procedure_recommendations");

  if (assetId) {
    const recommendations = await getRecommendedProcedures(ctx.orgId, assetId, assetType);
    recordAuditEvent({ action: KNOWLEDGE_AUDIT.KNOWLEDGE_QUERY, entityType: "procedure", userId: ctx.userId ?? undefined, metadata: { organizationId: ctx.orgId, assetId } });
    return NextResponse.json({ recommendations });
  }

  const procedures = await listProcedures(ctx.orgId, status, limit);
  return NextResponse.json({ procedures });
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "manage_knowledge");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const body = await req.json().catch(() => null);
  if (!body?.title || !body?.description) {
    return NextResponse.json({ error: "title and description are required" }, { status: 400 });
  }

  const procedure = await createProcedure(ctx.orgId, { ...body, authorId: ctx.userId ?? undefined });
  if (!procedure) return NextResponse.json({ error: "Failed to create procedure" }, { status: 500 });

  recordAuditEvent({
    action: KNOWLEDGE_AUDIT.PROCEDURE_CREATED, entityType: "procedure", entityId: procedure.id,
    userId: ctx.userId ?? undefined,
    metadata: { organizationId: ctx.orgId, title: procedure.title, version: procedure.version },
  });
  return NextResponse.json({ procedure }, { status: 201 });
}
