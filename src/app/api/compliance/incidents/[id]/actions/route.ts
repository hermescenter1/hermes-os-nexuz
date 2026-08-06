import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import { getIncidentForOrg, listIncidentActionsForOrg, createIncidentActionForOrg } from "@/lib/compliance/incident-db";
import { createActionSchema, toIncidentActionDto } from "@/lib/compliance/incident-schema";

/**
 * Authoritative governed incident actions (the closure-blocking source of truth;
 * ComplianceIncident.openBlockerCount is only a reconciled cache of OPEN rows here).
 *
 * GET  — list the incident's actions.
 * POST — create one OPEN action (active lifecycles only). The create + cache
 *        reconciliation + append-only ACTION_CREATED timeline event commit atomically.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "view_compliance_incidents", "compliance.incident.actions.list");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const { id } = await params;
  const incident = await getIncidentForOrg(id, scope.organizationId);
  if (!incident) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  const actions = await listIncidentActionsForOrg(id, scope.organizationId);
  return NextResponse.json({ actions: actions.map(toIncidentActionDto) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "manage_compliance_incidents", "compliance.incident.actions.create");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const { id } = await params;
  const parsed = createActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", code: "INVALID_INPUT" }, { status: 400 });

  const result = await createIncidentActionForOrg({
    id, organizationId: scope.organizationId, actorId: scope.userId,
    priority: parsed.data.priority, actionCode: parsed.data.actionCode, now: new Date(),
  });
  if (!result.ok) {
    if (result.reason === "NOT_FOUND") return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    const code = result.reason === "IMMUTABLE_LIFECYCLE" ? "IMMUTABLE_LIFECYCLE" : "CONFLICT";
    return NextResponse.json({ error: "Action rejected", code }, { status: 409 });
  }
  await recordAuditEvent({
    userId: scope.userId, action: COMPLIANCE_AUDIT.INCIDENT_ACTION_CREATED, entityType: "ComplianceIncidentAction", entityId: result.row.id,
    organizationId: scope.organizationId, outcome: "SUCCESS",
    metadata: { incidentId: id, priority: result.row.priority, actionCode: result.row.actionCode },
  });
  return NextResponse.json({ action: toIncidentActionDto(result.row) }, { status: 201 });
}
