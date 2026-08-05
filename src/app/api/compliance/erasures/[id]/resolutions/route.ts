import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import { resolveManualReviewAndRegeneratePlanForOrg, getErasureJobForOrg } from "@/lib/compliance/erasure-db";
import { isManualResolutionCode }     from "@/lib/compliance/erasure-planner";
import { toErasureJobDetailDto }      from "@/lib/compliance/erasure-view";

/**
 * Governed resolution of a MANUAL_REVIEW_REQUIRED plan item.
 *
 * SECURITY — approve_erasures (OWNER-only): resolving a manual item is a governance
 * decision, not routine management. The resolution code is drawn from a CLOSED
 * conservative set (NO_ACTION_REQUIRED / RETENTION_REQUIRED / ANONYMISE_REQUIRED /
 * GLOBAL_PLATFORM_REVIEW_REQUIRED) — DELETE_ALLOWED is not obtainable, so a single
 * tenant can never authorise deletion of the global User identity row.
 *
 * The route calls ONE governed persistence operation
 * (resolveManualReviewAndRegeneratePlanForOrg) which — in a single SELECT ... FOR
 * UPDATE transaction — validates the exact reviewed plan, records the decision with
 * full source→result lineage, regenerates the resulting canonical plan and clears any
 * approval, committing all writes together. The audit event is written only AFTER the
 * transaction commits (RESOLUTION_AUDIT_BEFORE_COMMIT=0). If regeneration fails,
 * nothing is stored (RESOLUTION_WITHOUT_NEW_PLAN=0 / RESOLUTION_PARTIAL_COMMIT=0).
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

  const result = await resolveManualReviewAndRegeneratePlanForOrg({
    id, organizationId: scope.organizationId, actorId: scope.userId,
    target, recordId, resolution: body!.resolution,
    sourcePlanHash, sourcePlanVersion, authority: "TENANT_OWNER", now: new Date(),
  });
  if (!result.ok) {
    if (result.reason === "NOT_FOUND") return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    if (result.reason === "UNAVAILABLE") return NextResponse.json({ error: "Temporarily unavailable", code: "UNAVAILABLE" }, { status: 503 });
    return NextResponse.json({ error: "Resolution rejected", code: result.reason }, { status: 409 });
  }

  // Audit AFTER the transaction commits — identifiers + closed codes + result lineage.
  await recordAuditEvent({
    userId: scope.userId,
    action: COMPLIANCE_AUDIT.ERASURE_MANUAL_RESOLVED,
    entityType: "DataDeletionRequest",
    entityId: id,
    organizationId: scope.organizationId,
    outcome: "SUCCESS",
    metadata: { target, recordId, resolution: body!.resolution, sourcePlanVersion, resultPlanVersion: result.planVersion, resultPlanHash: result.planHash },
  });

  const updated = await getErasureJobForOrg(id, scope.organizationId);
  return NextResponse.json({ erasure: updated ? toErasureJobDetailDto(updated) : null }, { status: 201 });
}
