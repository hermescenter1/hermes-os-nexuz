import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import { assignIncidentOwnerForOrg }   from "@/lib/compliance/incident-db";
import { assignIncidentSchema, toIncidentDto } from "@/lib/compliance/incident-schema";

/**
 * Governed incident ownership assignment.
 *
 * SECURITY — the owner is NEVER an arbitrary client string. Inside one transaction the
 * incident is locked (FOR UPDATE), the requested assignee is resolved through the
 * authoritative same-organization OrganizationMember (locked FOR SHARE) and must be
 * ACTIVE, and the ownerId ↔ membership binding is enforced by a database composite FK.
 * A foreign-tenant, inactive, invited-only or unknown membership is rejected. The
 * assignment + its append-only OWNERSHIP_ASSIGNED timeline event commit atomically.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "manage_compliance_incidents", "compliance.incident.assign");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const { id } = await params;
  const parsed = assignIncidentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", code: "INVALID_INPUT" }, { status: 400 });

  const result = await assignIncidentOwnerForOrg({ id, organizationId: scope.organizationId, actorId: scope.userId, ownerId: parsed.data.ownerId, now: new Date() });
  if (!result.ok) {
    if (result.reason === "NOT_FOUND") return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    if (result.reason === "INVALID_MEMBERSHIP") return NextResponse.json({ error: "Assignee is not an active member of this organization", code: "INVALID_MEMBERSHIP" }, { status: 422 });
    const code = result.reason === "IMMUTABLE_LIFECYCLE" ? "IMMUTABLE_LIFECYCLE" : "CONFLICT";
    return NextResponse.json({ error: "Assignment rejected", code }, { status: 409 });
  }
  await recordAuditEvent({
    userId: scope.userId, action: COMPLIANCE_AUDIT.INCIDENT_ASSIGNED, entityType: "ComplianceIncident", entityId: id,
    organizationId: scope.organizationId, outcome: "SUCCESS", correlationId: result.row.correlationId ?? undefined,
    metadata: { assignmentType: "OWNER", memberUserId: parsed.data.ownerId, outcome: "ASSIGNED" },
  });
  return NextResponse.json({ incident: toIncidentDto(result.row) });
}
