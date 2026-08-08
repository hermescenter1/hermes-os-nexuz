import { NextRequest, NextResponse }  from "next/server";
import { requirePlatformAuth }        from "@/lib/api/auth";
import { requireOrgActor }            from "@/lib/org/context";
import { hasScope } from "@/lib/api/scopes";
import { requirePermission }          from "@/lib/org/rbac";
import { listSites, createSite }      from "@/lib/industrial/sites";
import { recordAuditEvent }           from "@/lib/audit/audit-service";
import { INDUSTRIAL_AUDIT }           from "@/lib/audit/audit-service";
import { getAllowedSiteIds }          from "@/lib/site/context";
import { enforceEntitlement }         from "@/lib/billing-governance/runtime/require-entitlement";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  let userId: string | undefined;
  if (ctx.authMethod === "jwt") {
    const member = await requireOrgActor(req, ctx.orgId);
    if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
    const perm = requirePermission(member.ctx.role, "view_industrial");
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
    userId = member.ctx.userId;
  }

  // Phase 43: scope list to user's accessible sites
  const allowedIds = userId ? await getAllowedSiteIds(userId, ctx.orgId) : undefined;
  const sites = await listSites(ctx.orgId, allowedIds);
  return NextResponse.json({ sites });
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;
  // Phase SECURITY-8 amendment: API-key function-level authorization.
  if (!hasScope(ctx.scopes, "industrial.write")) {
    return NextResponse.json({ error: "Missing required scope: industrial.write" }, { status: 403 });
  }

  if (ctx.authMethod === "jwt") {
    const member = await requireOrgActor(req, ctx.orgId);
    if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
    const perm = requirePermission(member.ctx.role, "manage_industrial");
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
  }

  // Phase 96: commercial entitlement (separate from RBAC). Fails closed while the
  // per-plan site limit is unconfigured (COMMERCIAL_CONFIGURATION_REQUIRED).
  const gate = await enforceEntitlement({ organisationId: ctx.orgId, entitlementKey: "sites", requestedUnits: 1, userId: ctx.userId });
  if (!gate.ok) return gate.response;

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
