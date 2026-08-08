import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import {
  getRetentionPolicyForOrg,
  updateRetentionPolicyForOrg,
} from "@/lib/compliance/db";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import {
  updateRetentionPolicySchema,
  toRetentionUpdateData,
  toRetentionPolicyDto,
} from "@/lib/compliance/retention-schema";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "view_compliance", "compliance.retention_policy.get");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const { id } = await params;
  const row = await getRetentionPolicyForOrg(id, scope.organizationId);
  if (!row) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ policy: toRetentionPolicyDto(row) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "manage_retention", "compliance.retention_policy.update");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const { id } = await params;
  const parsed = updateRetentionPolicySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Invalid update", code: "INVALID_INPUT" }, { status: 400 });
  }

  const existing = await getRetentionPolicyForOrg(id, scope.organizationId);
  if (!existing) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  const { affected } = await updateRetentionPolicyForOrg({
    id, organizationId: scope.organizationId, updatedBy: scope.userId, data: toRetentionUpdateData(parsed.data),
  });
  if (affected !== 1) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  const row = await getRetentionPolicyForOrg(id, scope.organizationId);
  await recordAuditEvent({
    userId: scope.userId,
    action: COMPLIANCE_AUDIT.RETENTION_POLICY_UPDATED,
    entityType: "RetentionPolicy",
    entityId: id,
    organizationId: scope.organizationId,
    outcome: "SUCCESS",
    metadata: {
      previousApprovalState: existing.approvalState,
      newApprovalState: row?.approvalState ?? existing.approvalState,
      enabled: row?.enabled ?? existing.enabled,
      fieldsUpdated: Object.keys(parsed.data).sort(),
    },
  });

  return NextResponse.json({ policy: row ? toRetentionPolicyDto(row) : null });
}
