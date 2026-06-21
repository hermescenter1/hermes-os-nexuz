import { NextRequest, NextResponse }            from "next/server";
import { requirePlatformAuth }                 from "@/lib/api/auth";
import { requireOrgActor }                     from "@/lib/org/context";
import { requirePermission }                   from "@/lib/org/rbac";
import { requireSiteActor }                    from "@/lib/site/context";
import { requireSitePermission }               from "@/lib/site/rbac";
import { getGateway, updateGateway, revokeGateway } from "@/lib/industrial/gateways";
import { recordAuditEvent, INDUSTRIAL_AUDIT }  from "@/lib/audit/audit-service";

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

  const gateway = await getGateway(id, ctx.orgId);
  if (!gateway) return NextResponse.json({ error: "Gateway not found" }, { status: 404 });

  if (ctx.authMethod === "jwt") {
    const siteAuth = await requireSiteActor(req, ctx.orgId, gateway.siteId);
    if ("error" in siteAuth) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const sitePerm = requireSitePermission(siteAuth.ctx.role, "view_assets");
    if (!sitePerm.ok) return NextResponse.json({ error: sitePerm.error }, { status: sitePerm.status });
  }

  return NextResponse.json({ gateway });
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

  // Load gateway to verify site ownership before write
  const existing = await getGateway(id, ctx.orgId);
  if (!existing) return NextResponse.json({ error: "Gateway not found" }, { status: 404 });

  if (ctx.authMethod === "jwt") {
    const siteAuth = await requireSiteActor(req, ctx.orgId, existing.siteId);
    if ("error" in siteAuth) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const sitePerm = requireSitePermission(siteAuth.ctx.role, "manage_assets");
    if (!sitePerm.ok) return NextResponse.json({ error: sitePerm.error }, { status: sitePerm.status });
  }

  const body = await req.json().catch(() => ({}));
  const gateway = await updateGateway(id, ctx.orgId, body);
  if (!gateway) return NextResponse.json({ error: "Gateway not found" }, { status: 404 });

  recordAuditEvent({
    action:   INDUSTRIAL_AUDIT.GATEWAY_UPDATED,
    entityType: "industrial",
    userId:  ctx.userId ?? undefined,
    entityId: id,
    metadata:  { organizationId: ctx.orgId },
  });
  return NextResponse.json({ gateway });
}

export async function DELETE(req: NextRequest, { params }: Params) {
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

  // Load gateway to verify site ownership before revoke
  const existing = await getGateway(id, ctx.orgId);
  if (!existing) return NextResponse.json({ error: "Gateway not found or already revoked" }, { status: 404 });

  if (ctx.authMethod === "jwt") {
    const siteAuth = await requireSiteActor(req, ctx.orgId, existing.siteId);
    if ("error" in siteAuth) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const sitePerm = requireSitePermission(siteAuth.ctx.role, "manage_assets");
    if (!sitePerm.ok) return NextResponse.json({ error: sitePerm.error }, { status: sitePerm.status });
  }

  const gateway = await revokeGateway(id, ctx.orgId);
  if (!gateway) return NextResponse.json({ error: "Gateway not found or already revoked" }, { status: 404 });

  recordAuditEvent({
    action:   INDUSTRIAL_AUDIT.GATEWAY_REVOKED,
    entityType: "industrial",
    userId:  ctx.userId ?? undefined,
    entityId: id,
    metadata:  { organizationId: ctx.orgId },
  });
  return NextResponse.json({ gateway });
}
