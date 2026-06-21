import { NextRequest, NextResponse }          from "next/server";
import { requirePlatformAuth }                from "@/lib/api/auth";
import { requireOrgActor }                    from "@/lib/org/context";
import { requirePermission }                  from "@/lib/org/rbac";
import { requireSiteActor }                   from "@/lib/site/context";
import { requireSitePermission }              from "@/lib/site/rbac";
import { getConnector, updateConnector }      from "@/lib/industrial/connectors";
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

  const connector = await getConnector(id, ctx.orgId);
  if (!connector) return NextResponse.json({ error: "Connector not found" }, { status: 404 });

  if (ctx.authMethod === "jwt") {
    const siteAuth = await requireSiteActor(req, ctx.orgId, connector.siteId);
    if ("error" in siteAuth) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const sitePerm = requireSitePermission(siteAuth.ctx.role, "view_assets");
    if (!sitePerm.ok) return NextResponse.json({ error: sitePerm.error }, { status: sitePerm.status });
  }

  return NextResponse.json({ connector });
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

  // Load connector to verify site ownership before write
  const existing = await getConnector(id, ctx.orgId);
  if (!existing) return NextResponse.json({ error: "Connector not found" }, { status: 404 });

  if (ctx.authMethod === "jwt") {
    const siteAuth = await requireSiteActor(req, ctx.orgId, existing.siteId);
    if ("error" in siteAuth) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const sitePerm = requireSitePermission(siteAuth.ctx.role, "manage_assets");
    if (!sitePerm.ok) return NextResponse.json({ error: sitePerm.error }, { status: sitePerm.status });
  }

  const body = await req.json().catch(() => ({}));
  const { name, enabled, config } = body as Record<string, unknown>;
  const connector = await updateConnector(id, ctx.orgId, {
    name:    name    as string | undefined,
    enabled: enabled as boolean | undefined,
    config:  config  as Record<string, unknown> | undefined,
  });
  if (!connector) return NextResponse.json({ error: "Connector not found" }, { status: 404 });

  recordAuditEvent({
    action:   INDUSTRIAL_AUDIT.CONNECTOR_UPDATED,
    entityType: "industrial",
    userId:  ctx.userId ?? undefined,
    entityId: id,
    metadata:  { organizationId: ctx.orgId },
  });
  return NextResponse.json({ connector });
}
