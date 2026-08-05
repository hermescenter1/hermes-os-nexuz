import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import { storeManualReviewResolution } from "@/lib/compliance/erasure-db";
import { planErasureForJob }          from "@/lib/compliance/erasure-planning";
import { isManualResolutionCode }     from "@/lib/compliance/erasure-planner";
import { getErasureJobForOrg }        from "@/lib/compliance/erasure-db";
import { toErasureJobDetailDto }      from "@/lib/compliance/erasure-view";

/**
 * Governed resolution of a MANUAL_REVIEW_REQUIRED plan item.
 *
 * SECURITY — approve_erasures (OWNER-only): resolving a manual item is a governance
 * decision, not routine management. The resolution code is drawn from a CLOSED
 * conservative set (NO_ACTION_REQUIRED / RETENTION_REQUIRED / ANONYMISE_REQUIRED /
 * GLOBAL_PLATFORM_REVIEW_REQUIRED) — DELETE_ALLOWED is not obtainable, so a single
 * tenant can never authorise deletion of the global User identity row. The decision
 * binds to the EXACT reviewed plan (sourcePlanHash + sourcePlanVersion), is validated
 * against the persisted snapshot under a row lock, and then the plan is REGENERATED:
 * a new canonical version + hash is produced and any prior approval is invalidated,
 * so approval must be granted again against the new snapshot
 * (ERASURE_RESOLUTION_WITHOUT_REAPPROVAL=0). A client can never replace a
 * classification directly (MANUAL_REVIEW_CLIENT_OVERRIDE=0).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "approve_erasures", "compliance.erasure.resolve");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const { id } = await params;
  const body = await req.json().catch(() => null) as {
    target?: string; recordId?: string; resolution?: string;
    sourcePlanHash?: string; sourcePlanVersion?: number;
  } | null;
  const target = typeof body?.target === "string" ? body.target : "";
  const recordId = typeof body?.recordId === "string" ? body.recordId : "";
  const sourcePlanHash = typeof body?.sourcePlanHash === "string" ? body.sourcePlanHash : "";
  const sourcePlanVersion = typeof body?.sourcePlanVersion === "number" && Number.isInteger(body.sourcePlanVersion) ? body.sourcePlanVersion : 0;
  if (!target || !recordId || !sourcePlanHash || sourcePlanVersion <= 0 || !isManualResolutionCode(body?.resolution)) {
    return NextResponse.json({ error: "target, recordId, closed resolution, sourcePlanHash and sourcePlanVersion are required", code: "INVALID_INPUT" }, { status: 400 });
  }

  const stored = await storeManualReviewResolution({
    id, organizationId: scope.organizationId, actorId: scope.userId,
    target, recordId, resolution: body!.resolution,
    sourcePlanHash, sourcePlanVersion, authority: "TENANT_OWNER", now: new Date(),
  });
  if (!stored.ok) {
    if (stored.reason === "NOT_FOUND") return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    if (stored.reason === "UNAVAILABLE") return NextResponse.json({ error: "Temporarily unavailable", code: "UNAVAILABLE" }, { status: 503 });
    const status = 409;
    return NextResponse.json({ error: "Resolution rejected", code: stored.reason }, { status });
  }

  // A resolution ALWAYS produces a new canonical plan version + hash (and the store
  // above never mutated the reviewed snapshot). Approval must re-bind to it.
  const replanned = await planErasureForJob({ id, organizationId: scope.organizationId, actorId: scope.userId, now: new Date() });
  if (!replanned.ok) {
    return NextResponse.json({ error: "Resolution stored but plan regeneration failed", code: "PLAN_FAILED" }, { status: 503 });
  }

  await recordAuditEvent({
    userId: scope.userId,
    action: COMPLIANCE_AUDIT.ERASURE_MANUAL_RESOLVED,
    entityType: "DataDeletionRequest",
    entityId: id,
    organizationId: scope.organizationId,
    outcome: "SUCCESS",
    // Identifiers + closed codes only.
    metadata: { target, recordId, resolution: body!.resolution, sourcePlanVersion, newPlanVersion: replanned.planVersion, newPlanHash: replanned.planHash },
  });

  const updated = await getErasureJobForOrg(id, scope.organizationId);
  return NextResponse.json({ erasure: updated ? toErasureJobDetailDto(updated) : null }, { status: 201 });
}
