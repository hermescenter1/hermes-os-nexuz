import { NextRequest, NextResponse }        from "next/server";
import { requirePlatformAuth }              from "@/lib/api/auth";
import { requireOrgActor }                  from "@/lib/org/context";
import { hasScope } from "@/lib/api/scopes";
import { requirePermission }                from "@/lib/org/rbac";
import { listConnectors, createConnector }  from "@/lib/industrial/connectors";
import { getAllowedSiteIds, requireSiteActor } from "@/lib/site/context";
import { requireSitePermission }             from "@/lib/site/rbac";
import { recordAuditEvent, INDUSTRIAL_AUDIT } from "@/lib/audit/audit-service";
import { ALL_CONNECTOR_TYPES }              from "@/lib/industrial/types";
import type { ConnectorType }               from "@/lib/industrial/types";

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

  const gatewayId  = req.nextUrl.searchParams.get("gatewayId") ?? undefined;
  const connectors = await listConnectors(ctx.orgId, { gatewayId, allowedSiteIds });
  return NextResponse.json({ connectors });
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

  const body = await req.json().catch(() => ({}));
  const { siteId, gatewayId, connectorType, name, enabled, config } = body as Record<string, unknown>;
  if (!siteId || typeof siteId !== "string")  return NextResponse.json({ error: "siteId is required" }, { status: 400 });
  if (!gatewayId || typeof gatewayId !== "string") return NextResponse.json({ error: "gatewayId is required" }, { status: 400 });
  if (!connectorType || !ALL_CONNECTOR_TYPES.includes(connectorType as ConnectorType)) {
    return NextResponse.json({ error: `connectorType must be one of: ${ALL_CONNECTOR_TYPES.join(", ")}` }, { status: 400 });
  }
  if (!name || typeof name !== "string") return NextResponse.json({ error: "name is required" }, { status: 400 });

  // PHASE 99 SECURITY — the target site came from the body with no site-level
  // authorization, while PATCH /connectors/[id] enforced requireSiteActor and
  // requireSitePermission. Connector config carries OPC UA / MQTT connection
  // material, so the write boundary matters as much as the read one.
  if (ctx.authMethod === "jwt") {
    const siteAuth = await requireSiteActor(req, ctx.orgId, siteId as string);
    if ("error" in siteAuth) return NextResponse.json({ error: "Site not found" }, { status: 404 });
    const sitePerm = requireSitePermission(siteAuth.ctx.role, "manage_assets");
    if (!sitePerm.ok) return NextResponse.json({ error: sitePerm.error }, { status: sitePerm.status });
  }

  const connector = await createConnector({
    organizationId: ctx.orgId,
    siteId:         siteId as string,
    gatewayId:      gatewayId as string,
    connectorType:  connectorType as ConnectorType,
    name:           name as string,
    enabled:        Boolean(enabled),
    config:         (config as Record<string, unknown>) ?? {},
  });
  if (!connector) return NextResponse.json({ error: "Failed to create connector" }, { status: 503 });

  recordAuditEvent({
    action:   INDUSTRIAL_AUDIT.CONNECTOR_CREATED,
    entityType: "industrial",
    userId:  ctx.userId ?? undefined,
    entityId: connector.id,
    metadata:  { name, connectorType, gatewayId, organizationId: ctx.orgId },
  });
  return NextResponse.json({ connector }, { status: 201 });
}
