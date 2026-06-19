import { NextRequest, NextResponse }          from "next/server";
import { requirePlatformAuth }               from "@/lib/api/auth";
import { requireOrgActor }                   from "@/lib/org/context";
import { requirePermission }                 from "@/lib/org/rbac";
import { getRelation, updateRelation }       from "@/lib/digital-twin/relations";
import { recordAuditEvent, DT_AUDIT }        from "@/lib/audit/audit-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_digital_twin");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const relation = await getRelation(id, ctx.orgId);
  if (!relation) return NextResponse.json({ error: "Relation not found" }, { status: 404 });
  return NextResponse.json({ relation });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "manage_digital_twin");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const body     = await req.json().catch(() => ({}));
  const relation = await updateRelation(id, ctx.orgId, { metadata: body.metadata });
  if (!relation) return NextResponse.json({ error: "Relation not found" }, { status: 404 });

  recordAuditEvent({
    action:     DT_AUDIT.RELATION_UPDATED,
    entityType: "digital_twin",
    userId:     ctx.userId ?? undefined,
    entityId:   id,
    metadata:   { organizationId: ctx.orgId },
  });
  return NextResponse.json({ relation });
}
