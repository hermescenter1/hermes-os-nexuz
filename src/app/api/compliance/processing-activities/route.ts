import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import {
  listProcessingActivitiesForOrg,
  createProcessingActivityForOrg,
  getProcessingActivityForOrg,
} from "@/lib/compliance/db";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import {
  createProcessingActivitySchema,
  toCreateData,
  toProcessingActivityDto,
  classifyProcessingActivityEvidence,
} from "@/lib/compliance/processing-inventory";

/**
 * Article 30 Record of Processing Activities registry (Phase 97 Part A).
 *
 * SECURITY — the acting organization is resolved server-side by
 * `requireComplianceOrgScope`; it is never read from the body, query or a header.
 * Every read/write is tenant-scoped in the database predicate, so one tenant can
 * neither list nor create against another. Audit metadata is allow-listed to
 * identifiers and closed-enum classifications — never the activity's free-text
 * name, purpose or description.
 */

export async function GET(req: NextRequest) {
  const scope = await requireComplianceOrgScope(req, "view_compliance", "compliance.processing_activity.list");
  if (!scope.ok) {
    return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  }
  const rows = await listProcessingActivitiesForOrg(scope.organizationId);
  return NextResponse.json({ activities: rows.map(toProcessingActivityDto) });
}

export async function POST(req: NextRequest) {
  const scope = await requireComplianceOrgScope(req, "manage_processing_activities", "compliance.processing_activity.create");
  if (!scope.ok) {
    return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  }

  const body = await req.json().catch(() => null);
  const parsed = createProcessingActivitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid processing activity", code: "INVALID_INPUT" }, { status: 400 });
  }

  const created = await createProcessingActivityForOrg({
    organizationId: scope.organizationId,
    createdBy:      scope.userId,
    data:           toCreateData(parsed.data),
  });
  if (!created) {
    return NextResponse.json({ error: "Could not create processing activity", code: "PERSIST_FAILED" }, { status: 503 });
  }

  const evidence = classifyProcessingActivityEvidence(created);
  await recordAuditEvent({
    userId:         scope.userId,
    action:         COMPLIANCE_AUDIT.PROCESSING_ACTIVITY_CREATED,
    entityType:     "ProcessingActivity",
    entityId:       created.id,
    organizationId: scope.organizationId,
    outcome:        "SUCCESS",
    // Closed-enum classifications + booleans only — never name/purpose/description.
    metadata: {
      status:                created.status,
      approvalState:         created.approvalState,
      legalBasisStatus:      created.legalBasisStatus,
      riskClassification:    created.riskClassification,
      specialCategory:       created.specialCategory,
      automatedDecision:     created.automatedDecision,
      internationalTransfer: created.internationalTransfer,
      evidenceStatus:        evidence.status,
    },
  });

  // Re-read within the tenant scope for the response projection.
  const row = await getProcessingActivityForOrg(created.id, scope.organizationId);
  return NextResponse.json({ activity: row ? toProcessingActivityDto(row) : null }, { status: 201 });
}
