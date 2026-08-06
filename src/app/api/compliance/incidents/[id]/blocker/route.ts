import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import { adjustBlockerForOrg }         from "@/lib/compliance/incident-db";
import { blockerActionSchema, toIncidentDto } from "@/lib/compliance/incident-schema";

/**
 * Raise or clear an unresolved blocking action item (active lifecycles only). The
 * count is NEVER client-set directly — only incremented/decremented here under the
 * incident row lock — so it cannot be zeroed to bypass the closure gate
 * (UNRESOLVED_BLOCKER_INCIDENT_CLOSURE=0). The count change + its append-only timeline
 * event commit atomically.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "manage_compliance_incidents", "compliance.incident.blocker");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const { id } = await params;
  const parsed = blockerActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", code: "INVALID_INPUT" }, { status: 400 });

  const result = await adjustBlockerForOrg({ id, organizationId: scope.organizationId, actorId: scope.userId, action: parsed.data.action, now: new Date() });
  if (!result.ok) {
    if (result.reason === "NOT_FOUND") return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    const code = result.reason === "IMMUTABLE_LIFECYCLE" ? "IMMUTABLE_LIFECYCLE" : "CONFLICT";
    return NextResponse.json({ error: "Blocker change rejected", code }, { status: 409 });
  }
  await recordAuditEvent({
    userId: scope.userId, action: COMPLIANCE_AUDIT.INCIDENT_BLOCKER_CHANGED, entityType: "ComplianceIncident", entityId: id,
    organizationId: scope.organizationId, outcome: "SUCCESS", correlationId: result.row.correlationId ?? undefined,
    metadata: { action: parsed.data.action, openBlockerCount: result.row.openBlockerCount },
  });
  return NextResponse.json({ incident: toIncidentDto(result.row) });
}
