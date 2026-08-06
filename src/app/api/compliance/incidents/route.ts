import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { randomUUID }                 from "node:crypto";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import { listIncidentsForOrg, createIncidentForOrg } from "@/lib/compliance/incident-db";
import { createIncidentSchema, toIncidentDto } from "@/lib/compliance/incident-schema";

/**
 * Governed compliance-incident register (tenant scoped).
 *
 * GET  — list the caller organization's incidents (identifiers + closed statuses).
 * POST — create a fail-closed DRAFT-equivalent (lifecycle OPEN, everything else
 *        REVIEW_REQUIRED) incident. Attribution + organization scope are server-
 *        derived; a duplicate (organizationId, idempotencyKey) returns the existing
 *        record unchanged (DUPLICATE_INCIDENT_IDEMPOTENCY_BYPASS=0). A governed-record
 *        reference owned by another organization can never be linked (composite FK).
 */
export async function GET(req: NextRequest) {
  const scope = await requireComplianceOrgScope(req, "view_compliance_incidents", "compliance.incident.list");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const rows = await listIncidentsForOrg(scope.organizationId);
  return NextResponse.json({ incidents: rows.map(toIncidentDto) });
}

export async function POST(req: NextRequest) {
  const scope = await requireComplianceOrgScope(req, "manage_compliance_incidents", "compliance.incident.create");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const body = await req.json().catch(() => null);
  const parsed = createIncidentSchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", code: "INVALID_INPUT" }, { status: 400 });

  const { idempotencyKey, ...data } = parsed.data;
  const result = await createIncidentForOrg({
    organizationId: scope.organizationId, actorId: scope.userId,
    idempotencyKey: idempotencyKey ?? randomUUID(), data, now: new Date(),
  });
  if (!result.ok) {
    if (result.reason === "INVALID_RELATION") return NextResponse.json({ error: "Referenced record not found", code: "RELATED_RECORD_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ error: "Create rejected", code: "CONFLICT" }, { status: 409 });
  }
  if (result.created) {
    await recordAuditEvent({
      userId: scope.userId, action: COMPLIANCE_AUDIT.INCIDENT_CREATED, entityType: "ComplianceIncident", entityId: result.row.id,
      organizationId: scope.organizationId, outcome: "SUCCESS", correlationId: result.row.correlationId ?? undefined,
      metadata: { incidentType: result.row.incidentType, severity: result.row.severity, sourceClass: result.row.sourceClass },
    });
  }
  return NextResponse.json({ incident: toIncidentDto(result.row) }, { status: result.created ? 201 : 200 });
}
