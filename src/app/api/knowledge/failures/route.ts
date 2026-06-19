import { NextRequest, NextResponse }               from "next/server";
import { requirePlatformAuth }                      from "@/lib/api/auth";
import { requireOrgActor }                          from "@/lib/org/context";
import { requirePermission }                        from "@/lib/org/rbac";
import { listFailureModes, createFailureMode, getFailureKnowledge } from "@/lib/knowledge/failures";
import { recordAuditEvent, KNOWLEDGE_AUDIT }        from "@/lib/audit/audit-service";
import { meterIndustrialEvent }                     from "@/lib/api/meter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_knowledge");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const { searchParams } = new URL(req.url);
  const assetId   = searchParams.get("assetId");
  const assetType = searchParams.get("assetType") ?? undefined;
  const symptoms  = searchParams.getAll("symptom");
  const limit     = Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10));

  meterIndustrialEvent(ctx.orgId, "failure_knowledge_requests");

  if (assetId) {
    const knowledge = await getFailureKnowledge(ctx.orgId, assetId, assetType, symptoms.length > 0 ? symptoms : undefined);
    recordAuditEvent({ action: KNOWLEDGE_AUDIT.KNOWLEDGE_QUERY, entityType: "failure", userId: ctx.userId ?? undefined, metadata: { organizationId: ctx.orgId, assetId } });
    return NextResponse.json({ knowledge });
  }

  const failureModes = await listFailureModes(ctx.orgId, limit);
  return NextResponse.json({ failureModes });
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "manage_knowledge");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.description) {
    return NextResponse.json({ error: "name and description are required" }, { status: 400 });
  }

  const failureMode = await createFailureMode(ctx.orgId, body);
  if (!failureMode) return NextResponse.json({ error: "Failed to create failure mode" }, { status: 500 });

  recordAuditEvent({
    action: KNOWLEDGE_AUDIT.FAILURE_MODE_CREATED, entityType: "failureMode", entityId: failureMode.id,
    userId: ctx.userId ?? undefined,
    metadata: { organizationId: ctx.orgId, name: failureMode.name, severity: failureMode.severity },
  });
  return NextResponse.json({ failureMode }, { status: 201 });
}
