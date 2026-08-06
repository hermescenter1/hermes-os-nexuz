import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { requirePermission, type OrgPermission } from "@/lib/org/rbac";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import {
  getDataTransferForOrg, updateGovernanceRecordForOrg,
  transitionGovernanceRecordForOrg, approveDataTransferForOrg,
  getSubprocessorForOrg, getProcessingActivityIdForOrg,
} from "@/lib/compliance/transfer-db";
import { updateDataTransferSchema, toDataTransferDto } from "@/lib/compliance/transfer-schema";
import { isGovernanceLifecycle, governanceTransitionAction, type GovernanceAction } from "@/lib/compliance/transfer-governance";

const ACTION_PERMISSION: Record<GovernanceAction, OrgPermission> = {
  manage:  "manage_transfer_governance",
  approve: "approve_transfer_governance",
};
const REVIEW_KEYS = ["transferMechanismStatus", "legalReviewStatus", "riskReviewStatus"] as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "view_transfer_governance", "compliance.transfer.get");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const { id } = await params;
  const row = await getDataTransferForOrg(id, scope.organizationId);
  if (!row) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ transfer: toDataTransferDto(row) });
}

/**
 * Update (DRAFT/UNDER_REVIEW only) or transition a data transfer.
 *
 * SECURITY — approval/activation is OWNER-gated and evaluated on the ROW-LOCKED
 * record: the mechanism must be explicitly CONFIGURED by legal review, legal + risk
 * reviews positively complete, and any linked subprocessor must be an
 * APPROVED/ACTIVE record of the SAME organization. internationalTransfer flags on
 * a ProcessingActivity are never read as legal approval.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "view_transfer_governance", "compliance.transfer.update");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const { id } = await params;
  const body = await req.json().catch(() => null) as { transition?: string; update?: unknown } | null;
  if (!body || (typeof body.transition !== "string" && body.update === undefined)) {
    return NextResponse.json({ error: "transition or update is required", code: "INVALID_INPUT" }, { status: 400 });
  }

  const row = await getDataTransferForOrg(id, scope.organizationId);
  if (!row) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  // ── Material / review update ────────────────────────────────────────────────
  if (body.update !== undefined) {
    if (!requirePermission(scope.role, "manage_transfer_governance").ok) {
      return NextResponse.json({ error: "Insufficient organization permissions", code: "INSUFFICIENT_PERMISSION" }, { status: 403 });
    }
    const parsed = updateDataTransferSchema.safeParse(body.update);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input", code: "INVALID_INPUT" }, { status: 400 });
    // Same-org relation validation for a changed link.
    if (parsed.data.subprocessorId) {
      const sp = await getSubprocessorForOrg(parsed.data.subprocessorId, scope.organizationId);
      if (!sp) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }
    if (parsed.data.processingActivityId) {
      const pa = await getProcessingActivityIdForOrg(parsed.data.processingActivityId, scope.organizationId);
      if (!pa) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }
    const reviewTouched = REVIEW_KEYS.some((k) => parsed.data[k] !== undefined);
    const result = await updateGovernanceRecordForOrg({
      register: "dataTransfer", id, organizationId: scope.organizationId, actorId: scope.userId,
      data: parsed.data as Record<string, unknown>, reviewTouched, now: new Date(),
    });
    if (!result.ok) {
      if (result.reason === "NOT_FOUND") return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
      const code = result.reason === "IMMUTABLE_LIFECYCLE" ? "IMMUTABLE_LIFECYCLE" : "CONFLICT";
      return NextResponse.json({ error: "Update rejected", code }, { status: 409 });
    }
    await recordAuditEvent({
      userId: scope.userId, action: COMPLIANCE_AUDIT.DATA_TRANSFER_UPDATED, entityType: "DataTransfer", entityId: id,
      organizationId: scope.organizationId, outcome: "SUCCESS",
      metadata: { reviewTouched, fields: Object.keys(parsed.data) },
    });
    return NextResponse.json({ transfer: toDataTransferDto(result.row as never) });
  }

  // ── Lifecycle transition ────────────────────────────────────────────────────
  const to = body.transition as string;
  if (!isGovernanceLifecycle(to)) return NextResponse.json({ error: "Unknown lifecycle", code: "INVALID_TRANSITION" }, { status: 409 });
  const action = governanceTransitionAction(row.lifecycle, to);
  if (!action) return NextResponse.json({ error: "Transition not allowed", code: "INVALID_TRANSITION" }, { status: 409 });
  if (!requirePermission(scope.role, ACTION_PERMISSION[action]).ok) {
    return NextResponse.json({ error: "Insufficient organization permissions", code: "INSUFFICIENT_PERMISSION" }, { status: 403 });
  }

  if (to === "APPROVED" || to === "ACTIVE") {
    const result = await approveDataTransferForOrg({
      id, organizationId: scope.organizationId, actorId: scope.userId,
      from: to === "APPROVED" ? "UNDER_REVIEW" : "APPROVED", to, now: new Date(),
    });
    if (!result.ok) {
      if (result.reason === "NOT_FOUND") return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
      if (result.reason === "NOT_APPROVABLE") {
        return NextResponse.json({ error: "Approval gates not satisfied", code: "NOT_APPROVABLE", blockers: result.blockers ?? [] }, { status: 409 });
      }
      return NextResponse.json({ error: "Transition conflict", code: "TRANSITION_CONFLICT" }, { status: 409 });
    }
    await recordAuditEvent({
      userId: scope.userId, action: COMPLIANCE_AUDIT.DATA_TRANSFER_APPROVED, entityType: "DataTransfer", entityId: id,
      organizationId: scope.organizationId, outcome: "SUCCESS",
      metadata: { fromLifecycle: row.lifecycle, toLifecycle: to },
    });
    return NextResponse.json({ transfer: toDataTransferDto(result.row) });
  }

  const { affected } = await transitionGovernanceRecordForOrg({
    register: "dataTransfer", id, organizationId: scope.organizationId, actorId: scope.userId,
    from: row.lifecycle, to, now: new Date(),
  });
  if (affected !== 1) return NextResponse.json({ error: "Transition conflict", code: "TRANSITION_CONFLICT" }, { status: 409 });

  await recordAuditEvent({
    userId: scope.userId, action: COMPLIANCE_AUDIT.DATA_TRANSFER_TRANSITIONED, entityType: "DataTransfer", entityId: id,
    organizationId: scope.organizationId, outcome: "SUCCESS",
    metadata: { fromLifecycle: row.lifecycle, toLifecycle: to, action },
  });
  const updated = await getDataTransferForOrg(id, scope.organizationId);
  return NextResponse.json({ transfer: updated ? toDataTransferDto(updated) : null });
}
