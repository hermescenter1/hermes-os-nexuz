import { NextRequest, NextResponse }      from "next/server";
import { requirePlatformAuth }            from "@/lib/api/auth";
import { requireOrgActor }                from "@/lib/org/context";
import { hasScope } from "@/lib/api/scopes";
import { requirePermission }              from "@/lib/org/rbac";
import { listGateways, createGateway }    from "@/lib/industrial/gateways";
import { getAllowedSiteIds, requireSiteActor } from "@/lib/site/context";
import { requireSitePermission }           from "@/lib/site/rbac";
import { recordAuditEvent, INDUSTRIAL_AUDIT } from "@/lib/audit/audit-service";
import { enforceEntitlement }              from "@/lib/billing-governance/runtime/require-entitlement";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  let allowedSiteIds: string[] | undefined;
  if (ctx.authMethod === "jwt") {
    const member = await requireOrgActor(req, ctx.orgId);
    if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
    const perm = requirePermission(member.ctx.role, "view_industrial");
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
    if (member.ctx.userId) {
      allowedSiteIds = await getAllowedSiteIds(member.ctx.userId, ctx.orgId);
    }
  }

  const siteId = req.nextUrl.searchParams.get("siteId") ?? undefined;
  const gateways = await listGateways(ctx.orgId, siteId, allowedSiteIds);
  return NextResponse.json({ gateways });
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

  // Phase 96: commercial entitlement (gateways require the OT Gateway feature and
  // a configured limit). Separate from RBAC; fails closed when not in plan.
  const gate = await enforceEntitlement({ organisationId: ctx.orgId, entitlementKey: "gateways", requestedUnits: 1, userId: ctx.userId });
  if (!gate.ok) return gate.response;

  const body = await req.json().catch(() => ({}));
  const { siteId, name, gatewayId, version, apiKeyId, metadata } = body as Record<string, unknown>;
  if (!siteId || typeof siteId !== "string") return NextResponse.json({ error: "siteId is required" }, { status: 400 });
  if (!name   || typeof name   !== "string") return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!gatewayId || typeof gatewayId !== "string") return NextResponse.json({ error: "gatewayId (hardware identifier) is required" }, { status: 400 });

  // PHASE 99 SECURITY — the target site came from the body with no site-level
  // authorization, while PATCH /gateways/[id] enforced requireSiteActor and
  // requireSitePermission. Authorise the target site the same way here.
  if (ctx.authMethod === "jwt") {
    const siteAuth = await requireSiteActor(req, ctx.orgId, siteId as string);
    if ("error" in siteAuth) return NextResponse.json({ error: "Site not found" }, { status: 404 });
    const sitePerm = requireSitePermission(siteAuth.ctx.role, "manage_assets");
    if (!sitePerm.ok) return NextResponse.json({ error: sitePerm.error }, { status: sitePerm.status });
  }

  const gateway = await createGateway({
    organizationId: ctx.orgId,
    siteId:         siteId as string,
    name:           name   as string,
    gatewayId:      gatewayId as string,
    version:        version  as string | undefined,
    apiKeyId:       apiKeyId as string | undefined,
    metadata:       metadata as Record<string, unknown> | undefined,
  });
  if (!gateway) return NextResponse.json({ error: "Failed to create gateway" }, { status: 503 });

  recordAuditEvent({
    action:   INDUSTRIAL_AUDIT.GATEWAY_CREATED,
    entityType: "industrial",
    userId:  ctx.userId ?? undefined,
    entityId: gateway.id,
    metadata:  { name, gatewayId, siteId, organizationId: ctx.orgId },
  });
  return NextResponse.json({ gateway }, { status: 201 });
}
