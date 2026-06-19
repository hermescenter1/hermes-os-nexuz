import { NextRequest, NextResponse }      from "next/server";
import { requirePlatformAuth }           from "@/lib/api/auth";
import { requireOrgActor }               from "@/lib/org/context";
import { requirePermission }             from "@/lib/org/rbac";
import { getTag, updateTag }             from "@/lib/digital-twin/tags";
import { recordAuditEvent, DT_AUDIT }    from "@/lib/audit/audit-service";

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

  const tag = await getTag(id, ctx.orgId);
  if (!tag) return NextResponse.json({ error: "Tag not found" }, { status: 404 });
  return NextResponse.json({ tag });
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

  const body = await req.json().catch(() => ({}));
  const tag  = await updateTag(id, ctx.orgId, body);
  if (!tag) return NextResponse.json({ error: "Tag not found" }, { status: 404 });

  recordAuditEvent({
    action:     DT_AUDIT.TAG_UPDATED,
    entityType: "digital_twin",
    userId:     ctx.userId ?? undefined,
    entityId:   id,
    metadata:   { organizationId: ctx.orgId },
  });
  return NextResponse.json({ tag });
}
