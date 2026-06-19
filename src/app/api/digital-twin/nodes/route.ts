import { NextRequest, NextResponse }   from "next/server";
import { requirePlatformAuth }         from "@/lib/api/auth";
import { requireOrgActor }             from "@/lib/org/context";
import { requirePermission }           from "@/lib/org/rbac";
import { listNodes, createNode } from "@/lib/digital-twin/nodes";
import { recordAuditEvent, DT_AUDIT } from "@/lib/audit/audit-service";
import { meterIndustrialEvent }        from "@/lib/api/meter";
import { ALL_NODE_TYPES }              from "@/lib/digital-twin/types";
import type { DigitalTwinNodeType }    from "@/lib/digital-twin/types";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_digital_twin");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const siteId = req.nextUrl.searchParams.get("siteId") ?? undefined;
  const nodes  = await listNodes(ctx.orgId, siteId);

  meterIndustrialEvent(ctx.orgId, "digital_twin_queries");
  return NextResponse.json({ nodes });
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "manage_digital_twin");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const body = await req.json().catch(() => ({}));
  const { siteId, displayName, nodeType, assetId, parentNodeId, metadata } = body as Record<string, unknown>;
  if (!siteId || typeof siteId !== "string") return NextResponse.json({ error: "siteId is required" }, { status: 400 });
  if (!displayName || typeof displayName !== "string") return NextResponse.json({ error: "displayName is required" }, { status: 400 });
  if (!nodeType || !ALL_NODE_TYPES.includes(nodeType as DigitalTwinNodeType)) {
    return NextResponse.json({ error: `nodeType must be one of: ${ALL_NODE_TYPES.join(", ")}` }, { status: 400 });
  }

  const node = await createNode({
    organizationId: ctx.orgId,
    siteId:         siteId as string,
    displayName:    displayName as string,
    nodeType:       nodeType as DigitalTwinNodeType,
    assetId:        assetId      as string | undefined,
    parentNodeId:   parentNodeId as string | undefined,
    metadata:       metadata     as Record<string, unknown> | undefined,
  });
  if (!node) return NextResponse.json({ error: "Failed to create node" }, { status: 503 });

  meterIndustrialEvent(ctx.orgId, "digital_twin_nodes");
  recordAuditEvent({
    action:     DT_AUDIT.NODE_CREATED,
    entityType: "digital_twin",
    userId:     ctx.userId ?? undefined,
    entityId:   node.id,
    metadata:   { displayName, nodeType, siteId, organizationId: ctx.orgId },
  });
  return NextResponse.json({ node }, { status: 201 });
}
