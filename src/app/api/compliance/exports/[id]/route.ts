import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import {
  getExportJobForOrg,
  transitionExportJobForOrg,
  revokeExportJobAndTokensForOrg,
} from "@/lib/compliance/export-db";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { requirePermission, type OrgPermission } from "@/lib/org/rbac";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import { toExportJobDto }              from "@/lib/compliance/export-view";
import {
  exportTransitionAction,
  isKnownExportLifecycle,
  isExportExecutionEnabled,
  type ExportAction,
} from "@/lib/compliance/export-lifecycle";

const ACTION_PERMISSION: Record<ExportAction, OrgPermission> = {
  manage:  "manage_exports",
  approve: "approve_exports",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "view_exports", "compliance.export.get");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const { id } = await params;
  const job = await getExportJobForOrg(id, scope.organizationId);
  if (!job) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ export: toExportJobDto(job) });
}

/**
 * Governed export transitions (authorise / cancel / revoke) and the disabled
 * execution gate. Execution is disabled by default and NEVER silently marks a job
 * READY — it returns EXPORT_EXECUTION_DISABLED. Approval and management are
 * separate permissions; every predicate is org-scoped with an expected-state guard.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "view_exports", "compliance.export.update");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const { id } = await params;
  const body = await req.json().catch(() => null) as { transition?: string; execute?: boolean } | null;
  if (!body) return NextResponse.json({ error: "Invalid body", code: "INVALID_INPUT" }, { status: 400 });

  const job = await getExportJobForOrg(id, scope.organizationId);
  if (!job) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  // Execution gate — disabled by default, fail-closed, never marks READY.
  if (body.execute === true) {
    if (!requirePermission(scope.role, "manage_exports").ok) {
      return NextResponse.json({ error: "Insufficient organization permissions", code: "INSUFFICIENT_PERMISSION" }, { status: 403 });
    }
    if (!isExportExecutionEnabled()) {
      return NextResponse.json({ error: "Export execution is disabled", code: "EXPORT_EXECUTION_DISABLED" }, { status: 409 });
    }
    // When enabled (never in this slice), the executor runs behind the flag; the
    // governed collect→package→store path is exercised by the offline tests.
    return NextResponse.json({ error: "Export execution is disabled", code: "EXPORT_EXECUTION_DISABLED" }, { status: 409 });
  }

  if (typeof body.transition !== "string") {
    return NextResponse.json({ error: "transition or execute is required", code: "INVALID_INPUT" }, { status: 400 });
  }
  const to = body.transition;
  if (!isKnownExportLifecycle(to)) return NextResponse.json({ error: "Unknown lifecycle", code: "INVALID_TRANSITION" }, { status: 409 });
  const action = exportTransitionAction(job.lifecycle, to);
  if (!action) return NextResponse.json({ error: "Transition not allowed", code: "INVALID_TRANSITION" }, { status: 409 });
  if (!requirePermission(scope.role, ACTION_PERMISSION[action]).ok) {
    return NextResponse.json({ error: "Insufficient organization permissions", code: "INSUFFICIENT_PERMISSION" }, { status: 403 });
  }

  // Revocation is ATOMIC (Finding 2): the READY→REVOKED transition and the
  // invalidation of every outstanding token happen in one transaction. If token
  // invalidation fails the whole revocation rolls back, so success is never
  // returned while a live token could remain. The audit event is written only
  // after the transaction commits.
  if (to === "REVOKED") {
    const result = await revokeExportJobAndTokensForOrg({ id, organizationId: scope.organizationId, actorId: scope.userId, now: new Date() });
    if (!result.ok) {
      if (result.reason === "NOT_FOUND") return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
      if (result.reason === "UNAVAILABLE") return NextResponse.json({ error: "Revocation failed", code: "REVOCATION_FAILED" }, { status: 503 });
      return NextResponse.json({ error: "Transition conflict", code: "TRANSITION_CONFLICT" }, { status: 409 });
    }
    await recordAuditEvent({
      userId: scope.userId,
      action: COMPLIANCE_AUDIT.EXPORT_REVOKED,
      entityType: "DataExportRequest",
      entityId: id,
      organizationId: scope.organizationId,
      outcome: "SUCCESS",
      metadata: { fromLifecycle: job.lifecycle, toLifecycle: to, action, tokensRevoked: result.tokensRevoked },
    });
    const revoked = await getExportJobForOrg(id, scope.organizationId);
    return NextResponse.json({ export: revoked ? toExportJobDto(revoked) : null });
  }

  const { affected } = await transitionExportJobForOrg({
    id, organizationId: scope.organizationId, from: job.lifecycle, to, actorId: scope.userId,
  });
  if (affected !== 1) return NextResponse.json({ error: "Transition conflict", code: "TRANSITION_CONFLICT" }, { status: 409 });

  await recordAuditEvent({
    userId: scope.userId,
    action: COMPLIANCE_AUDIT.EXPORT_JOB_TRANSITIONED,
    entityType: "DataExportRequest",
    entityId: id,
    organizationId: scope.organizationId,
    outcome: "SUCCESS",
    metadata: { fromLifecycle: job.lifecycle, toLifecycle: to, action },
  });

  const updated = await getExportJobForOrg(id, scope.organizationId);
  return NextResponse.json({ export: updated ? toExportJobDto(updated) : null });
}
