import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import { planErasureForJob }          from "@/lib/compliance/erasure-planning";
import { getErasureJobForOrg }        from "@/lib/compliance/erasure-db";
import { toErasureJobDetailDto }      from "@/lib/compliance/erasure-view";

/**
 * Generate (or regenerate) the deterministic erasure plan snapshot for a job.
 *
 * SECURITY — manage_erasures, org-scoped. Only the closed-registry targets are read,
 * with the authoritative subject + organization predicate; the plan stores identifiers
 * and closed classifications only (never raw subject content). Regeneration is allowed
 * only while the job is REQUESTED/PLANNING/PLAN_READY/BLOCKED and bumps the plan
 * version, invalidating any prior approval. Audit records the version + classification
 * counts only.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "manage_erasures", "compliance.erasure.plan");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const { id } = await params;
  const result = await planErasureForJob({ id, organizationId: scope.organizationId, actorId: scope.userId, now: new Date() });
  if (!result.ok) {
    if (result.reason === "NOT_FOUND") return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    if (result.reason === "INVALID_STATE") return NextResponse.json({ error: "Plan cannot be generated in the current state", code: "INVALID_STATE" }, { status: 409 });
    return NextResponse.json({ error: "Could not generate plan", code: "PLAN_FAILED" }, { status: 503 });
  }

  await recordAuditEvent({
    userId: scope.userId,
    action: COMPLIANCE_AUDIT.ERASURE_PLAN_GENERATED,
    entityType: "DataDeletionRequest",
    entityId: id,
    organizationId: scope.organizationId,
    outcome: "SUCCESS",
    // Version + counts only — never record ids' content, email, IP, UA or planJson body.
    metadata: { planVersion: result.planVersion, planHash: result.planHash, counts: result.plan.counts },
  });

  const updated = await getErasureJobForOrg(id, scope.organizationId);
  return NextResponse.json({ erasure: updated ? toErasureJobDetailDto(updated) : null }, { status: 201 });
}
