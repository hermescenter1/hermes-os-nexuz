import { NextRequest, NextResponse }  from "next/server";
import { requirePlatformAuth }        from "@/lib/api/auth";
import { requireOrgActor }            from "@/lib/org/context";
import { requirePermission }          from "@/lib/org/rbac";
import { getNode, updateNode }        from "@/lib/digital-twin/nodes";
import { getNodeRelations }           from "@/lib/digital-twin/graph";
import { recordAuditEvent, DT_AUDIT } from "@/lib/audit/audit-service";
import { meterIndustrialEvent }       from "@/lib/api/meter";

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

  const node = await getNode(id, ctx.orgId);
  if (!node) return NextResponse.json({ error: "Node not found" }, { status: 404 });

  const relations = await getNodeRelations(id, ctx.orgId);
  meterIndustrialEvent(ctx.orgId, "digital_twin_queries");
  return NextResponse.json({ node, relations });
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

  // Phase SECURITY-8 amendment: explicit field allow-list (block injected
  // organizationId/id/tenant fields reaching Prisma `data`).
  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch = {
    displayName:  raw.displayName,
    nodeType:     raw.nodeType,
    assetId:      raw.assetId,
    parentNodeId: raw.parentNodeId,
    metadata:     raw.metadata,
  } as Parameters<typeof updateNode>[2];
  const node  = await updateNode(id, ctx.orgId, patch);
  if (!node) return NextResponse.json({ error: "Node not found" }, { status: 404 });

  recordAuditEvent({
    action:     DT_AUDIT.NODE_UPDATED,
    entityType: "digital_twin",
    userId:     ctx.userId ?? undefined,
    entityId:   id,
    metadata:   { organizationId: ctx.orgId },
  });
  return NextResponse.json({ node });
}
