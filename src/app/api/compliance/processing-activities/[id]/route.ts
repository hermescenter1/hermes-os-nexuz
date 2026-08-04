import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import {
  getProcessingActivityForOrg,
  updateProcessingActivityForOrg,
} from "@/lib/compliance/db";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import {
  updateProcessingActivitySchema,
  toUpdateData,
  toProcessingActivityDto,
  classifyProcessingActivityEvidence,
} from "@/lib/compliance/processing-inventory";

/**
 * Single Article 30 processing activity (Phase 97 Part A).
 *
 * SECURITY — both the read and the write carry the authoritative organization id
 * in the database predicate. A foreign or unknown id yields a uniform 404 with no
 * existence oracle. `organizationId` is never read from the body. Audit metadata
 * is allow-listed to identifiers and closed-enum classifications only.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = await requireComplianceOrgScope(req, "view_compliance", "compliance.processing_activity.get");
  if (!scope.ok) {
    return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  }
  const { id } = await params;
  const row = await getProcessingActivityForOrg(id, scope.organizationId);
  if (!row) {
    return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ activity: toProcessingActivityDto(row) });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = await requireComplianceOrgScope(req, "manage_processing_activities", "compliance.processing_activity.update");
  if (!scope.ok) {
    return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateProcessingActivitySchema.safeParse(body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Invalid processing activity update", code: "INVALID_INPUT" }, { status: 400 });
  }

  // Confirm the row exists WITHIN the tenant scope first (uniform 404 otherwise).
  const existing = await getProcessingActivityForOrg(id, scope.organizationId);
  if (!existing) {
    return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const { affected } = await updateProcessingActivityForOrg({
    id,
    organizationId: scope.organizationId,
    updatedBy:      scope.userId,
    data:           toUpdateData(parsed.data),
  });
  if (affected !== 1) {
    return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const row = await getProcessingActivityForOrg(id, scope.organizationId);
  const evidence = classifyProcessingActivityEvidence(row ?? existing);
  await recordAuditEvent({
    userId:         scope.userId,
    action:         COMPLIANCE_AUDIT.PROCESSING_ACTIVITY_UPDATED,
    entityType:     "ProcessingActivity",
    entityId:       id,
    organizationId: scope.organizationId,
    outcome:        "SUCCESS",
    metadata: {
      previousStatus:        existing.status,
      newStatus:             row?.status ?? existing.status,
      previousApprovalState: existing.approvalState,
      newApprovalState:      row?.approvalState ?? existing.approvalState,
      evidenceStatus:        evidence.status,
      fieldsUpdated:         Object.keys(parsed.data).sort(),
    },
  });

  return NextResponse.json({ activity: row ? toProcessingActivityDto(row) : null });
}
