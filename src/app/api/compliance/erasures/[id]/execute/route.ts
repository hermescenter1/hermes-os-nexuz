import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import { getErasureJobForOrg }        from "@/lib/compliance/erasure-db";
import { erasureExecutionGate }       from "@/lib/compliance/erasure-executor";

/**
 * Execute an approved erasure plan.
 *
 * SECURITY — execute_erasures, org-scoped. Production erasure execution is DISABLED
 * by default (COMPLIANCE_ERASURE_EXECUTION_ENABLED=false). While disabled — which is
 * the shipped posture — this returns ERASURE_EXECUTION_DISABLED and the job is left
 * UNCHANGED (no delete, no anonymise, no transition). No production executor is
 * deployed in this slice: even were the flag enabled, no destructive real-database
 * action is performed here (the executor is exercised only by synthetic tests).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "execute_erasures", "compliance.erasure.execute");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const { id } = await params;
  const job = await getErasureJobForOrg(id, scope.organizationId);
  if (!job) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  if (!(job.lifecycle === "APPROVED" || job.lifecycle === "EXECUTION_PENDING")) {
    return NextResponse.json({ error: "Job is not armed for execution", code: "NOT_EXECUTABLE" }, { status: 409 });
  }

  if (!erasureExecutionGate().enabled) {
    await recordAuditEvent({
      userId: scope.userId, action: COMPLIANCE_AUDIT.ERASURE_EXECUTION_DENIED, entityType: "DataDeletionRequest", entityId: id,
      organizationId: scope.organizationId, outcome: "DENIED", metadata: { lifecycle: job.lifecycle, reason: "EXECUTION_DISABLED" },
    });
    return NextResponse.json({ error: "Erasure execution is disabled", code: "ERASURE_EXECUTION_DISABLED" }, { status: 409 });
  }

  // No production executor is deployed in this slice. Fail safe — never perform a
  // destructive real-database action from the API.
  return NextResponse.json({ error: "Erasure executor is not deployed", code: "ERASURE_EXECUTOR_NOT_DEPLOYED" }, { status: 501 });
}
