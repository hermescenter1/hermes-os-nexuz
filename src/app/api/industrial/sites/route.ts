import { NextRequest, NextResponse }  from "next/server";
import { requirePlatformAuth }        from "@/lib/api/auth";
import { requireOrgActor }            from "@/lib/org/context";
import { requirePermission }          from "@/lib/org/rbac";
import { listSites, createSite }      from "@/lib/industrial/sites";
import { recordAuditEvent }           from "@/lib/audit/audit-service";
import { INDUSTRIAL_AUDIT }           from "@/lib/audit/audit-service";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  if (ctx.authMethod === "jwt") {
    const member = await requireOrgActor(req, ctx.orgId);
    if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
    const perm = requirePermission(member.ctx.role, "view_industrial");
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
  }

  const sites = await listSites(ctx.orgId);
  return NextResponse.json({ sites });
}

export async function POST(req: NextRequest) {
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
  const { name, slug, location, description, status } = body as Record<string, string>;
  if (!name || !slug) return NextResponse.json({ error: "name and slug are required" }, { status: 400 });

  const site = await createSite({ organizationId: ctx.orgId, name, slug, location, description, status: status as never });
  if (!site) return NextResponse.json({ error: "Failed to create site" }, { status: 503 });

  recordAuditEvent({
    action:   INDUSTRIAL_AUDIT.SITE_CREATED,
    entityType: "industrial",
    userId:  ctx.userId ?? undefined,
    entityId: site.id,
    metadata:  { name, slug, organizationId: ctx.orgId },
  });
  return NextResponse.json({ site }, { status: 201 });
}
