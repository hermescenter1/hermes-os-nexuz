import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { randomUUID }                 from "node:crypto";
import {
  getErasureJobForOrg,
  transitionErasureJobForOrg,
  approveErasurePlanForOrg,
  armErasureExecutionForOrg,
} from "@/lib/compliance/erasure-db";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { requirePermission, type OrgPermission } from "@/lib/org/rbac";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import { toErasureJobDto, toErasureJobDetailDto } from "@/lib/compliance/erasure-view";
import { erasureTransitionAction, isKnownErasureLifecycle, type ErasureAction } from "@/lib/compliance/erasure-lifecycle";

const ACTION_PERMISSION: Record<ErasureAction, OrgPermission> = {
  manage:  "manage_erasures",
  approve: "approve_erasures",
  execute: "execute_erasures",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "view_erasures", "compliance.erasure.get");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const { id } = await params;
  const job = await getErasureJobForOrg(id, scope.organizationId);
  if (!job) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ erasure: toErasureJobDetailDto(job) });
}

/**
 * Governed erasure transitions. Approval binds atomically to an exact planHash and is
 * refused unless the plan is approvable (no MANUAL_REVIEW_REQUIRED / CONFIGURATION_
 * REQUIRED / unknown classifications). A public or tenant API can never set EXECUTING
 * or COMPLETED — those are internal executor steps. Arming execution generates a
 * server-side execution idempotency key; execution itself stays behind the disabled
 * gate (see the execute route). Every predicate is org-scoped with an expected-state
 * guard and a real row lock.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "view_erasures", "compliance.erasure.update");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const { id } = await params;
  const body = await req.json().catch(() => null) as { transition?: string; expectedPlanHash?: string; expectedPlanVersion?: number } | null;
  if (!body || typeof body.transition !== "string") return NextResponse.json({ error: "transition is required", code: "INVALID_INPUT" }, { status: 400 });

  const job = await getErasureJobForOrg(id, scope.organizationId);
  if (!job) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  const to = body.transition;
  if (!isKnownErasureLifecycle(to)) return NextResponse.json({ error: "Unknown lifecycle", code: "INVALID_TRANSITION" }, { status: 409 });
  const action = erasureTransitionAction(job.lifecycle, to);
  if (!action) return NextResponse.json({ error: "Transition not allowed", code: "INVALID_TRANSITION" }, { status: 409 });
  if (!requirePermission(scope.role, ACTION_PERMISSION[action]).ok) {
    return NextResponse.json({ error: "Insufficient organization permissions", code: "INSUFFICIENT_PERMISSION" }, { status: 403 });
  }

  // Approve — binds to the EXACT planHash AND planVersion. All validation (strict
  // parse of the persisted snapshot, hash recomputation, approvability) runs INSIDE
  // the SELECT ... FOR UPDATE transaction in approveErasurePlanForOrg — never on the
  // pre-lock read above. The audit uses the committed transaction's returned values.
  if (to === "APPROVED") {
    const expectedPlanHash = typeof body.expectedPlanHash === "string" ? body.expectedPlanHash : "";
    const expectedPlanVersion = typeof body.expectedPlanVersion === "number" && Number.isInteger(body.expectedPlanVersion) ? body.expectedPlanVersion : 0;
    if (!expectedPlanHash || expectedPlanVersion <= 0) {
      return NextResponse.json({ error: "expectedPlanHash and expectedPlanVersion are required to approve", code: "INVALID_INPUT" }, { status: 400 });
    }
    const result = await approveErasurePlanForOrg({ id, organizationId: scope.organizationId, actorId: scope.userId, expectedPlanHash, expectedPlanVersion, now: new Date() });
    if (!result.ok) {
      if (result.reason === "NOT_FOUND") return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
      if (result.reason === "PLAN_NOT_APPROVABLE") {
        return NextResponse.json({ error: "Plan is not approvable", code: "PLAN_NOT_APPROVABLE", blockerCount: result.blockerCount ?? 0 }, { status: 409 });
      }
      const code =
        result.reason === "PLAN_HASH_MISMATCH"    ? "APPROVED_PLAN_HASH_MISMATCH" :
        result.reason === "PLAN_VERSION_MISMATCH" ? "APPROVED_PLAN_VERSION_MISMATCH" :
        result.reason === "PLAN_INVALID"          ? "PLAN_INVALID" :
        "TRANSITION_CONFLICT";
      return NextResponse.json({ error: "Approval conflict", code }, { status: 409 });
    }
    await recordAuditEvent({
      userId: scope.userId, action: COMPLIANCE_AUDIT.ERASURE_APPROVED, entityType: "DataDeletionRequest", entityId: id,
      organizationId: scope.organizationId, outcome: "SUCCESS",
      // Committed values from the approval transaction — never the pre-lock read.
      metadata: { approvedPlanVersion: result.planVersion, approvedPlanHash: result.planHash },
    });
    const updated = await getErasureJobForOrg(id, scope.organizationId);
    return NextResponse.json({ erasure: updated ? toErasureJobDetailDto(updated) : null });
  }

  // Arm execution (still behind the disabled gate at the execute route).
  if (to === "EXECUTION_PENDING") {
    const result = await armErasureExecutionForOrg({ id, organizationId: scope.organizationId, actorId: scope.userId, executionIdempotencyKey: randomUUID(), now: new Date() });
    if (!result.ok) {
      if (result.reason === "NOT_FOUND") return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
      return NextResponse.json({ error: "Arm conflict", code: "TRANSITION_CONFLICT" }, { status: 409 });
    }
    await recordAuditEvent({
      userId: scope.userId, action: COMPLIANCE_AUDIT.ERASURE_JOB_TRANSITIONED, entityType: "DataDeletionRequest", entityId: id,
      organizationId: scope.organizationId, outcome: "SUCCESS", metadata: { fromLifecycle: job.lifecycle, toLifecycle: to, action },
    });
    const updated = await getErasureJobForOrg(id, scope.organizationId);
    return NextResponse.json({ erasure: updated ? toErasureJobDto(updated) : null });
  }

  // Generic transitions (submit-to-review, reject, send-back, invalidate, cancel).
  const { affected } = await transitionErasureJobForOrg({ id, organizationId: scope.organizationId, from: job.lifecycle, to, actorId: scope.userId });
  if (affected !== 1) return NextResponse.json({ error: "Transition conflict", code: "TRANSITION_CONFLICT" }, { status: 409 });

  const auditAction =
    to === "REJECTED"  ? COMPLIANCE_AUDIT.ERASURE_REJECTED :
    to === "CANCELLED" ? COMPLIANCE_AUDIT.ERASURE_CANCELLED :
    to === "IN_REVIEW" ? COMPLIANCE_AUDIT.ERASURE_REVIEW_SUBMITTED :
    COMPLIANCE_AUDIT.ERASURE_JOB_TRANSITIONED;
  await recordAuditEvent({
    userId: scope.userId, action: auditAction, entityType: "DataDeletionRequest", entityId: id,
    organizationId: scope.organizationId, outcome: "SUCCESS", metadata: { fromLifecycle: job.lifecycle, toLifecycle: to, action },
  });

  const updated = await getErasureJobForOrg(id, scope.organizationId);
  return NextResponse.json({ erasure: updated ? toErasureJobDto(updated) : null });
}
