import { NextRequest, NextResponse }          from "next/server";
import { requirePlatformAuth }               from "@/lib/api/auth";
import { requireOrgActor }                   from "@/lib/org/context";
import { requirePermission }                 from "@/lib/org/rbac";
import { listRelations, createRelation } from "@/lib/digital-twin/relations";
import { getNode }                           from "@/lib/digital-twin/nodes";
import { recordAuditEvent, DT_AUDIT }        from "@/lib/audit/audit-service";
import { meterIndustrialEvent }              from "@/lib/api/meter";
import { ALL_RELATION_TYPES }               from "@/lib/digital-twin/types";
import type { DigitalTwinRelationType }      from "@/lib/digital-twin/types";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_digital_twin");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const sourceNodeId = req.nextUrl.searchParams.get("sourceNodeId") ?? undefined;
  const targetNodeId = req.nextUrl.searchParams.get("targetNodeId") ?? undefined;
  const relations    = await listRelations(ctx.orgId, { sourceNodeId, targetNodeId });

  meterIndustrialEvent(ctx.orgId, "digital_twin_queries");
  return NextResponse.json({ relations });
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
  const { sourceNodeId, targetNodeId, relationType, metadata } = body as Record<string, unknown>;

  if (!sourceNodeId || typeof sourceNodeId !== "string") return NextResponse.json({ error: "sourceNodeId is required" }, { status: 400 });
  if (!targetNodeId || typeof targetNodeId !== "string") return NextResponse.json({ error: "targetNodeId is required" }, { status: 400 });
  if (!relationType || !ALL_RELATION_TYPES.includes(relationType as DigitalTwinRelationType)) {
    return NextResponse.json({ error: `relationType must be one of: ${ALL_RELATION_TYPES.join(", ")}` }, { status: 400 });
  }

  // Cross-tenant edge prevention: both nodes must belong to this org
  const [src, tgt] = await Promise.all([
    getNode(sourceNodeId as string, ctx.orgId),
    getNode(targetNodeId as string, ctx.orgId),
  ]);
  if (!src) return NextResponse.json({ error: "sourceNode not found in this organization" }, { status: 404 });
  if (!tgt) return NextResponse.json({ error: "targetNode not found in this organization" }, { status: 404 });

  const relation = await createRelation({
    organizationId: ctx.orgId,
    sourceNodeId:   sourceNodeId as string,
    targetNodeId:   targetNodeId as string,
    relationType:   relationType as DigitalTwinRelationType,
    metadata:       metadata as Record<string, unknown> | undefined,
  });
  if (!relation) return NextResponse.json({ error: "Failed to create relation (may be duplicate)" }, { status: 422 });

  meterIndustrialEvent(ctx.orgId, "digital_twin_relations");
  recordAuditEvent({
    action:     DT_AUDIT.RELATION_CREATED,
    entityType: "digital_twin",
    userId:     ctx.userId ?? undefined,
    entityId:   relation.id,
    metadata:   { relationType, sourceNodeId, targetNodeId, organizationId: ctx.orgId },
  });
  return NextResponse.json({ relation }, { status: 201 });
}
