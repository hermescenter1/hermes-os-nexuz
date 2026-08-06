import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { z }                          from "zod";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import { resolveIncidentActionForOrg, cancelIncidentActionForOrg } from "@/lib/compliance/incident-db";
import { toIncidentActionDto }         from "@/lib/compliance/incident-schema";

const terminateSchema = z.object({
  operation:    z.enum(["RESOLVE", "CANCEL"]),
  evidenceHash: z.string().trim().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();

/**
 * Resolve or cancel a governed incident action.
 *
 * SECURITY — the incident is locked FIRST, then the specific same-org action
 * (FOR UPDATE). A foreign, missing, already-resolved or already-cancelled action is
 * rejected UNIFORMLY as not-found (NONEXISTENT / DOUBLE / FOREIGN_TENANT blocker
 * clears all fail). Resolving a HIGH/CRITICAL action requires a valid evidence hash.
 * The status change + cache reconciliation + append-only timeline event commit
 * atomically. Cancellation is explicit and governed — never a silent decrement.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; actionId: string }> }) {
  const scope = await requireComplianceOrgScope(req, "manage_compliance_incidents", "compliance.incident.action.terminate");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const { id, actionId } = await params;
  const parsed = terminateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", code: "INVALID_INPUT" }, { status: 400 });

  const common = { incidentId: id, organizationId: scope.organizationId, actorId: scope.userId, actionId };
  const result = parsed.data.operation === "RESOLVE"
    ? await resolveIncidentActionForOrg({ ...common, evidenceHash: parsed.data.evidenceHash ?? null })
    : await cancelIncidentActionForOrg(common);
  if (!result.ok) {
    if (result.reason === "NOT_FOUND") return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    if (result.reason === "ACTION_EVIDENCE_REQUIRED") return NextResponse.json({ error: "Resolution evidence is required", code: "ACTION_EVIDENCE_REQUIRED" }, { status: 400 });
    return NextResponse.json({ error: "Action change rejected", code: "CONFLICT" }, { status: 409 });
  }
  await recordAuditEvent({
    userId: scope.userId,
    action: parsed.data.operation === "RESOLVE" ? COMPLIANCE_AUDIT.INCIDENT_ACTION_RESOLVED : COMPLIANCE_AUDIT.INCIDENT_ACTION_CANCELLED,
    entityType: "ComplianceIncidentAction", entityId: actionId, organizationId: scope.organizationId, outcome: "SUCCESS",
    metadata: { incidentId: id, operation: parsed.data.operation, priority: result.row.priority, status: result.row.status },
  });
  return NextResponse.json({ action: toIncidentActionDto(result.row) });
}
