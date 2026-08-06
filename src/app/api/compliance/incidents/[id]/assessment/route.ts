import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { requirePermission }          from "@/lib/org/rbac";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import { getIncidentForOrg, recordAssessmentForOrg } from "@/lib/compliance/incident-db";
import { recordAssessmentSchema, toIncidentDto } from "@/lib/compliance/incident-schema";
import { assessmentTransitionAction } from "@/lib/compliance/incident-governance";

/**
 * Record an assessment progression or a legal / external-notification DECISION.
 *
 * SECURITY — the assessment vocabulary is closed; entering a DECISION state
 * (NO_EXTERNAL_NOTIFICATION_DECISION / EXTERNAL_NOTIFICATION_REVIEW_REQUIRED /
 * DECISION_RECORDED) is a HIGH-AUTHORITY act reserved to the OWNER
 * (decide_compliance_incidents); ordinary assessment progression is manage-level. The
 * decision is recorded as EVIDENCE ONLY — nothing is ever sent, and no legal deadline,
 * jurisdiction or notification duty is invented (EXTERNAL_NOTIFICATION_AUTOMATICALLY_SENT=0).
 * The assessment change + its append-only timeline event commit atomically.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "view_compliance_incidents", "compliance.incident.assessment");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const { id } = await params;
  const row = await getIncidentForOrg(id, scope.organizationId);
  if (!row) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  const parsed = recordAssessmentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", code: "INVALID_INPUT" }, { status: 400 });

  const action = assessmentTransitionAction(row.assessmentStatus, parsed.data.assessmentStatus);
  if (!action) return NextResponse.json({ error: "Assessment transition not allowed", code: "INVALID_ASSESSMENT" }, { status: 409 });
  const perm = action === "decide" ? "decide_compliance_incidents" : "manage_compliance_incidents";
  if (!requirePermission(scope.role, perm).ok) {
    return NextResponse.json({ error: "Insufficient organization permissions", code: "INSUFFICIENT_PERMISSION" }, { status: 403 });
  }

  const result = await recordAssessmentForOrg({
    id, organizationId: scope.organizationId, actorId: scope.userId, to: parsed.data.assessmentStatus,
    action, evidenceHash: parsed.data.evidenceHash ?? null, now: new Date(),
  });
  if (!result.ok) {
    if (result.reason === "NOT_FOUND") return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    if (result.reason === "INVALID_ASSESSMENT") return NextResponse.json({ error: "Assessment transition not allowed", code: "INVALID_ASSESSMENT" }, { status: 409 });
    if (result.reason === "IMMUTABLE_LIFECYCLE") return NextResponse.json({ error: "Incident assessment is frozen", code: "IMMUTABLE_LIFECYCLE" }, { status: 409 });
    return NextResponse.json({ error: "Assessment conflict", code: "CONFLICT" }, { status: 409 });
  }
  await recordAuditEvent({
    userId: scope.userId,
    action: action === "decide" ? COMPLIANCE_AUDIT.INCIDENT_DECISION_RECORDED : COMPLIANCE_AUDIT.INCIDENT_ASSESSMENT_RECORDED,
    entityType: "ComplianceIncident", entityId: id, organizationId: scope.organizationId, outcome: "SUCCESS",
    correlationId: result.row.correlationId ?? undefined,
    metadata: { fromAssessment: row.assessmentStatus, toAssessment: parsed.data.assessmentStatus, hasEvidence: parsed.data.evidenceHash !== undefined },
  });
  return NextResponse.json({ incident: toIncidentDto(result.row) });
}
