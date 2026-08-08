import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { requirePermission, type OrgPermission } from "@/lib/org/rbac";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import { getIncidentForOrg, updateIncidentForOrg, transitionIncidentForOrg } from "@/lib/compliance/incident-db";
import { updateIncidentSchema, toIncidentDto } from "@/lib/compliance/incident-schema";
import { isIncidentLifecycle, incidentTransitionAction, type IncidentAction } from "@/lib/compliance/incident-governance";

const ACTION_PERMISSION: Record<IncidentAction, OrgPermission> = {
  manage:  "manage_compliance_incidents",
  resolve: "manage_compliance_incidents",
  close:   "close_compliance_incidents",
  reopen:  "close_compliance_incidents",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "view_compliance_incidents", "compliance.incident.get");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const { id } = await params;
  const row = await getIncidentForOrg(id, scope.organizationId);
  if (!row) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ incident: toIncidentDto(row) });
}

/**
 * Update (active lifecycles only — RESOLVED/CLOSED evidence is frozen except via the
 * explicit reopen) or transition an incident.
 *
 * SECURITY — resolution/closure/reopen are gated per action (close + reopen are
 * OWNER-only). RESOLVED and CLOSED are additionally blocked on the ROW-LOCKED record
 * while the assessment is not decided, ownership is missing, unresolved blockers
 * exist, or an active LegalHold requires continued preservation. The lifecycle
 * transition and its append-only timeline event commit atomically.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "view_compliance_incidents", "compliance.incident.update");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const { id } = await params;
  const body = await req.json().catch(() => null) as { transition?: string; update?: unknown } | null;
  if (!body || (typeof body.transition !== "string" && body.update === undefined)) {
    return NextResponse.json({ error: "transition or update is required", code: "INVALID_INPUT" }, { status: 400 });
  }

  const row = await getIncidentForOrg(id, scope.organizationId);
  if (!row) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  // ── Material update ─────────────────────────────────────────────────────────
  if (body.update !== undefined) {
    if (!requirePermission(scope.role, "manage_compliance_incidents").ok) {
      return NextResponse.json({ error: "Insufficient organization permissions", code: "INSUFFICIENT_PERMISSION" }, { status: 403 });
    }
    const parsed = updateIncidentSchema.safeParse(body.update);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input", code: "INVALID_INPUT" }, { status: 400 });
    const result = await updateIncidentForOrg({ id, organizationId: scope.organizationId, actorId: scope.userId, data: parsed.data as Record<string, unknown> });
    if (!result.ok) {
      if (result.reason === "NOT_FOUND") return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
      if (result.reason === "INVALID_RELATION") return NextResponse.json({ error: "Referenced record not found", code: "RELATED_RECORD_NOT_FOUND" }, { status: 404 });
      const code = result.reason === "IMMUTABLE_LIFECYCLE" ? "IMMUTABLE_LIFECYCLE" : "CONFLICT";
      return NextResponse.json({ error: "Update rejected", code }, { status: 409 });
    }
    await recordAuditEvent({
      userId: scope.userId, action: COMPLIANCE_AUDIT.INCIDENT_UPDATED, entityType: "ComplianceIncident", entityId: id,
      organizationId: scope.organizationId, outcome: "SUCCESS", correlationId: result.row.correlationId ?? undefined,
      metadata: { fields: Object.keys(parsed.data) },
    });
    return NextResponse.json({ incident: toIncidentDto(result.row) });
  }

  // ── Lifecycle transition ────────────────────────────────────────────────────
  const to = body.transition as string;
  if (!isIncidentLifecycle(to)) return NextResponse.json({ error: "Unknown lifecycle", code: "INVALID_TRANSITION" }, { status: 409 });
  const action = incidentTransitionAction(row.lifecycle, to);
  if (!action) return NextResponse.json({ error: "Transition not allowed", code: "INVALID_TRANSITION" }, { status: 409 });
  if (!requirePermission(scope.role, ACTION_PERMISSION[action]).ok) {
    return NextResponse.json({ error: "Insufficient organization permissions", code: "INSUFFICIENT_PERMISSION" }, { status: 403 });
  }

  const result = await transitionIncidentForOrg({ id, organizationId: scope.organizationId, actorId: scope.userId, from: row.lifecycle, to, action });
  if (!result.ok) {
    if (result.reason === "NOT_FOUND") return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    if (result.reason === "NOT_CLOSABLE") {
      return NextResponse.json({ error: "Closure gates not satisfied", code: "NOT_CLOSABLE", blockers: result.blockers ?? [] }, { status: 409 });
    }
    return NextResponse.json({ error: "Transition conflict", code: "TRANSITION_CONFLICT" }, { status: 409 });
  }
  await recordAuditEvent({
    userId: scope.userId, action: action === "reopen" ? COMPLIANCE_AUDIT.INCIDENT_REOPENED : COMPLIANCE_AUDIT.INCIDENT_TRANSITIONED,
    entityType: "ComplianceIncident", entityId: id, organizationId: scope.organizationId, outcome: "SUCCESS",
    correlationId: result.row.correlationId ?? undefined,
    metadata: { fromLifecycle: row.lifecycle, toLifecycle: to, action },
  });
  return NextResponse.json({ incident: toIncidentDto(result.row) });
}
