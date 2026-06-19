import { NextRequest, NextResponse }      from "next/server";
import { requirePlatformAuth }            from "@/lib/api/auth";
import { requireOrgActor }                from "@/lib/org/context";
import { requirePermission }              from "@/lib/org/rbac";
import { listGateways, createGateway }    from "@/lib/industrial/gateways";
import { recordAuditEvent, INDUSTRIAL_AUDIT } from "@/lib/audit/audit-service";

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

  const siteId = req.nextUrl.searchParams.get("siteId") ?? undefined;
  const gateways = await listGateways(ctx.orgId, siteId);
  return NextResponse.json({ gateways });
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
  const { siteId, name, gatewayId, version, apiKeyId, metadata } = body as Record<string, unknown>;
  if (!siteId || typeof siteId !== "string") return NextResponse.json({ error: "siteId is required" }, { status: 400 });
  if (!name   || typeof name   !== "string") return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!gatewayId || typeof gatewayId !== "string") return NextResponse.json({ error: "gatewayId (hardware identifier) is required" }, { status: 400 });

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
