import { NextRequest, NextResponse }  from "next/server";
import { requirePlatformAuth }        from "@/lib/api/auth";
import { requireOrgActor }            from "@/lib/org/context";
import { requirePermission }          from "@/lib/org/rbac";
import { getSite, updateSite }        from "@/lib/industrial/sites";
import { recordAuditEvent, INDUSTRIAL_AUDIT } from "@/lib/audit/audit-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  if (ctx.authMethod === "jwt") {
    const member = await requireOrgActor(req, ctx.orgId);
    if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
    const perm = requirePermission(member.ctx.role, "view_industrial");
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
  }

  const site = await getSite(id, ctx.orgId);
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  return NextResponse.json({ site });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  if (ctx.authMethod === "jwt") {
    const member = await requireOrgActor(req, ctx.orgId);
    if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
    const perm = requirePermission(member.ctx.role, "manage_industrial");
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
  }

  const body = await req.json().catch(() => ({}));
  const site = await updateSite(id, ctx.orgId, body);
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  recordAuditEvent({
    action:   INDUSTRIAL_AUDIT.SITE_UPDATED,
    entityType: "industrial",
    userId:  ctx.userId ?? undefined,
    entityId: id,
    metadata:  { organizationId: ctx.orgId },
  });
  return NextResponse.json({ site });
}
