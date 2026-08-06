import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import {
  getLegalHoldForOrg,
  updateLegalHoldForOrg,
} from "@/lib/compliance/db";
import { applyIncidentScopedHoldTransition } from "@/lib/compliance/incident-db";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import {
  updateLegalHoldSchema,
  toLegalHoldDto,
} from "@/lib/compliance/retention-schema";
import {
  canTransitionLegalHold,
  isTerminalLegalHoldStatus,
  validateLegalHoldScope,
  type LegalHoldScopeInput,
} from "@/lib/compliance/legal-hold";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "view_compliance", "compliance.legal_hold.get");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const { id } = await params;
  const row = await getLegalHoldForOrg(id, scope.organizationId);
  if (!row) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ hold: toLegalHoldDto(row) });
}

/**
 * Update / transition a legal hold with strict lifecycle immutability.
 *
 *  - RELEASED / CANCELLED (terminal): fully immutable (RELEASED_LEGAL_HOLD_MUTATION=0).
 *  - ACTIVE: material fields (scope, reason, dates, startDate) are frozen; only
 *    `reviewDate` may change, plus the release transition. A scope change under an
 *    existing approval is refused — it requires release + a new PROPOSED hold
 *    (ACTIVE_LEGAL_HOLD_MATERIAL_MUTATION=0, LEGAL_HOLD_SCOPE_CHANGE_WITHOUT_REAPPROVAL=0).
 *  - PROPOSED: material fields may be edited; the resulting scope is revalidated;
 *    activation revalidates the FINAL scope server-side before ACTIVE, so a
 *    semantically incomplete hold can never become ACTIVE (INVALID_LEGAL_HOLD_ACTIVATION=0).
 * Activation sets approvedBy/approvedAt; release sets releaseApprovedBy/releasedAt;
 * cancellation (of a proposal only) sets cancelledBy/cancelledAt — all server-side.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "manage_legal_hold", "compliance.legal_hold.update");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const { id } = await params;
  const parsed = updateLegalHoldSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Invalid update", code: "INVALID_INPUT" }, { status: 400 });
  }
  const input = parsed.data;

  const existing = await getLegalHoldForOrg(id, scope.organizationId);
  if (!existing) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  // Terminal states are fully immutable.
  if (isTerminalLegalHoldStatus(existing.status)) {
    return NextResponse.json({ error: "Hold is terminal and immutable", code: "HOLD_IMMUTABLE" }, { status: 409 });
  }

  const requestedStatus = input.status;
  const statusChange = requestedStatus !== undefined && requestedStatus !== existing.status;
  // A lifecycle transition targets ACTIVE / RELEASED / CANCELLED; PROPOSED is never a
  // valid transition target.
  const TRANSITION_STATUSES = ["ACTIVE", "RELEASED", "CANCELLED"];
  if (statusChange && !TRANSITION_STATUSES.includes(requestedStatus as string)) {
    return NextResponse.json({ error: "Transition not allowed", code: "INVALID_TRANSITION" }, { status: 409 });
  }
  const isTransition = statusChange;

  // ── Stable transition policy ────────────────────────────────────────────────
  // A lifecycle transition may NOT be combined with any material / review-field edit.
  // The caller must persist the PROPOSED edit first, then transition in a SEPARATE
  // request against the resulting stable snapshot. This prevents silent field dropping
  // and guarantees the pre-read snapshot IS the actual transition candidate.
  const MATERIAL_KEYS = ["name", "reasonClass", "scopeType", "subjectId", "resourceType", "resourceId", "processingActivityId", "incidentId", "rangeStart", "rangeEnd", "startDate", "reviewDate"];
  if (isTransition) {
    const combined = MATERIAL_KEYS.filter((k) => (input as Record<string, unknown>)[k] !== undefined);
    if (combined.length > 0) {
      return NextResponse.json({ error: "A lifecycle transition may not carry a material edit; persist the edit first, then transition against the stable snapshot", code: "HOLD_TRANSITION_REQUIRES_STABLE_SNAPSHOT" }, { status: 409 });
    }
  }

  const now = new Date();
  let fieldsUpdated: string[] = [];

  if (!isTransition) {
    // ── Pure material / review edit (no lifecycle transition) ──────────────────
    const data: Record<string, unknown> = {};
    if (existing.status === "ACTIVE") {
      // Only reviewDate is editable on an ACTIVE hold; every material field is frozen.
      const disallowed = Object.keys(input).filter((k) => k !== "reviewDate" && k !== "status");
      if (disallowed.length > 0) return NextResponse.json({ error: "Active hold fields are immutable", code: "ACTIVE_HOLD_IMMUTABLE" }, { status: 409 });
      if (input.reviewDate !== undefined) data.reviewDate = input.reviewDate ? new Date(input.reviewDate) : null;
    } else {
      // PROPOSED material edit; a changed scope is revalidated.
      const scopeFieldTouched = ["scopeType", "subjectId", "resourceType", "resourceId", "processingActivityId", "incidentId", "rangeStart", "rangeEnd"]
        .some((k) => input[k as keyof typeof input] !== undefined);
      if (scopeFieldTouched) {
        const pick = <T,>(v: T | undefined, fallback: T): T => (v === undefined ? fallback : v);
        const candidate: LegalHoldScopeInput = {
          scopeType:            pick(input.scopeType, existing.scopeType),
          subjectId:            pick(input.subjectId, existing.subjectId),
          resourceType:         pick(input.resourceType, existing.resourceType),
          resourceId:           pick(input.resourceId, existing.resourceId),
          processingActivityId: pick(input.processingActivityId, existing.processingActivityId),
          incidentId:           pick(input.incidentId, existing.incidentId),
          rangeStart:           input.rangeStart !== undefined ? input.rangeStart : existing.rangeStart,
          rangeEnd:             input.rangeEnd !== undefined ? input.rangeEnd : existing.rangeEnd,
        };
        const normalized = validateLegalHoldScope(candidate);
        if (!normalized.ok) return NextResponse.json({ error: "Invalid legal hold scope", code: "INVALID_SCOPE", reason: normalized.reason }, { status: 400 });
        Object.assign(data, {
          scopeType:            normalized.normalized.scopeType,
          subjectId:            normalized.normalized.subjectId,
          resourceType:         normalized.normalized.resourceType,
          resourceId:           normalized.normalized.resourceId,
          processingActivityId: normalized.normalized.processingActivityId,
          incidentId:           normalized.normalized.incidentId,
          rangeStart:           normalized.normalized.rangeStart,
          rangeEnd:             normalized.normalized.rangeEnd,
        });
      }
      if (input.name !== undefined) data.name = input.name;
      if (input.reasonClass !== undefined) data.reasonClass = input.reasonClass;
      if (input.startDate !== undefined) data.startDate = input.startDate ? new Date(input.startDate) : null;
      if (input.reviewDate !== undefined) data.reviewDate = input.reviewDate ? new Date(input.reviewDate) : null;
    }
    if (Object.keys(data).length === 0) return NextResponse.json({ error: "No effective change", code: "INVALID_INPUT" }, { status: 400 });
    const { affected } = await updateLegalHoldForOrg({ id, organizationId: scope.organizationId, updatedBy: scope.userId, data });
    if (affected !== 1) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    fieldsUpdated = Object.keys(data).sort();
  } else {
    // ── Lifecycle transition against the STABLE persisted snapshot ─────────────
    if (!canTransitionLegalHold(existing.status, requestedStatus as string)) {
      return NextResponse.json({ error: "Transition not allowed", code: "INVALID_TRANSITION" }, { status: 409 });
    }
    // No material edit reached here, so the FINAL scope IS the stable persisted scope.
    const finalScopeType = existing.scopeType;

    // ACTIVE requires the COMPLETE stable persisted scope to be valid.
    if (requestedStatus === "ACTIVE") {
      const v = validateLegalHoldScope({
        scopeType: existing.scopeType, subjectId: existing.subjectId, resourceType: existing.resourceType,
        resourceId: existing.resourceId, processingActivityId: existing.processingActivityId,
        incidentId: existing.incidentId, rangeStart: existing.rangeStart, rangeEnd: existing.rangeEnd,
      });
      if (!v.ok) return NextResponse.json({ error: "Invalid legal hold scope", code: "INVALID_LEGAL_HOLD_ACTIVATION", reason: v.reason }, { status: 422 });
    }

    if (finalScopeType === "INCIDENT" && (requestedStatus === "ACTIVE" || requestedStatus === "RELEASED")) {
      // INCIDENT-scoped ACTIVE/RELEASED → ONLY the locked service; never generic.
      if (!existing.incidentId) return NextResponse.json({ error: "Invalid legal hold scope", code: "INVALID_LEGAL_HOLD_ACTIVATION", reason: "INCIDENT_ID_REQUIRED" }, { status: 422 });
      const res = await applyIncidentScopedHoldTransition({
        holdId: id, organizationId: scope.organizationId, actorId: scope.userId, toStatus: requestedStatus,
        expected: { status: existing.status, scopeType: existing.scopeType, incidentId: existing.incidentId, updatedAt: existing.updatedAt },
      });
      if (!res.ok) {
        if (res.reason === "NOT_FOUND") return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
        if (res.reason === "INCIDENT_NOT_ACTIVE") return NextResponse.json({ error: "The parent incident is not in an active state; reopen it before activating a hold", code: "INCIDENT_NOT_ACTIVE" }, { status: 409 });
        if (res.reason === "HOLD_BINDING_CHANGED") return NextResponse.json({ error: "The hold's parent binding changed under the operation; retry", code: "HOLD_BINDING_CHANGED" }, { status: 409 });
        if (res.reason === "INVALID_HOLD_TRANSITION") return NextResponse.json({ error: "Transition not allowed", code: "INVALID_HOLD_TRANSITION" }, { status: 409 });
        return NextResponse.json({ error: "Hold transition conflict", code: "CONFLICT" }, { status: 409 });
      }
      fieldsUpdated = res.fieldsWritten;
    } else {
      // Non-incident transition (or CANCELLED) via the generic locked path.
      const data: Record<string, unknown> = {};
      if (requestedStatus === "ACTIVE") {
        data.status = "ACTIVE"; data.approvedBy = scope.userId; data.approvedAt = now;
        if (!existing.startDate) data.startDate = now;
      } else if (requestedStatus === "RELEASED") {
        data.status = "RELEASED"; data.releaseApprovedBy = scope.userId; data.releasedAt = now;
      } else {
        data.status = "CANCELLED"; data.cancelledBy = scope.userId; data.cancelledAt = now;
      }
      // DEFENSIVE ASSERTION: a request resulting in ACTIVE/RELEASED with final scopeType
      // INCIDENT must NEVER reach the generic update (INCIDENT_SCOPED_ACTIVE/RELEASE_GENERIC_UPDATE=0).
      if (finalScopeType === "INCIDENT" && (requestedStatus === "ACTIVE" || requestedStatus === "RELEASED")) {
        return NextResponse.json({ error: "Incident-scoped hold transition misrouted", code: "INCIDENT_SCOPED_TRANSITION_MISROUTED" }, { status: 409 });
      }
      const { affected } = await updateLegalHoldForOrg({ id, organizationId: scope.organizationId, updatedBy: scope.userId, data });
      if (affected !== 1) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
      fieldsUpdated = Object.keys(data).sort();
    }
  }

  const row = await getLegalHoldForOrg(id, scope.organizationId);
  await recordAuditEvent({
    userId: scope.userId,
    action: COMPLIANCE_AUDIT.LEGAL_HOLD_UPDATED,
    entityType: "LegalHold",
    entityId: id,
    organizationId: scope.organizationId,
    outcome: "SUCCESS",
    // fieldsUpdated reflects ONLY the fields the transaction actually persisted — for the
    // incident-scoped path this is the service's fieldsWritten, never the pre-read input.
    metadata: { previousStatus: existing.status, newStatus: row?.status ?? existing.status, fieldsUpdated },
  });

  return NextResponse.json({ hold: row ? toLegalHoldDto(row) : null });
}
