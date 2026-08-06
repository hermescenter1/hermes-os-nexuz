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
  const now = new Date();
  const data: Record<string, unknown> = {};

  if (existing.status === "ACTIVE") {
    // Only reviewDate and a release transition are permitted. Any other field
    // (material scope/reason/date OR even name) is refused under the approval.
    const disallowed = Object.keys(input).filter((k) => k !== "reviewDate" && k !== "status");
    if (disallowed.length > 0) {
      return NextResponse.json({ error: "Active hold fields are immutable", code: "ACTIVE_HOLD_IMMUTABLE" }, { status: 409 });
    }
    if (statusChange && requestedStatus !== "RELEASED") {
      return NextResponse.json({ error: "Transition not allowed", code: "INVALID_TRANSITION" }, { status: 409 });
    }
    if (input.reviewDate !== undefined) data.reviewDate = input.reviewDate ? new Date(input.reviewDate) : null;
    if (statusChange) {
      data.status = "RELEASED";
      data.releaseApprovedBy = scope.userId;
      data.releasedAt = now;
    }
  } else {
    // existing.status === "PROPOSED"
    const scopeFieldTouched = ["scopeType", "subjectId", "resourceType", "resourceId", "processingActivityId", "incidentId", "rangeStart", "rangeEnd"]
      .some((k) => input[k as keyof typeof input] !== undefined);
    const willActivate = statusChange && requestedStatus === "ACTIVE";

    // Compute the candidate (final) scope = existing overlaid with any edits.
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

    // Validate whenever the scope is edited OR the hold is being activated. On
    // activation this is the mandatory pre-ACTIVE revalidation of the final record.
    let normalized: ReturnType<typeof validateLegalHoldScope> | null = null;
    if (scopeFieldTouched || willActivate) {
      normalized = validateLegalHoldScope(candidate);
      if (!normalized.ok) {
        const code = willActivate ? "INVALID_LEGAL_HOLD_ACTIVATION" : "INVALID_SCOPE";
        return NextResponse.json({ error: "Invalid legal hold scope", code, reason: normalized.reason }, { status: willActivate ? 422 : 400 });
      }
    }

    if (statusChange && !canTransitionLegalHold(existing.status, requestedStatus)) {
      return NextResponse.json({ error: "Transition not allowed", code: "INVALID_TRANSITION" }, { status: 409 });
    }

    // Editable non-status fields.
    if (input.name !== undefined) data.name = input.name;
    if (input.reasonClass !== undefined) data.reasonClass = input.reasonClass;
    if (input.startDate !== undefined) data.startDate = input.startDate ? new Date(input.startDate) : null;
    if (input.reviewDate !== undefined) data.reviewDate = input.reviewDate ? new Date(input.reviewDate) : null;
    // Persist the normalized scope only when scope fields were actually edited.
    if (scopeFieldTouched && normalized && normalized.ok) {
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

    if (requestedStatus === "ACTIVE") {
      data.status = "ACTIVE";
      data.approvedBy = scope.userId;
      data.approvedAt = now;
      if (!existing.startDate && data.startDate === undefined) data.startDate = now;
    } else if (requestedStatus === "CANCELLED") {
      data.status = "CANCELLED";
      data.cancelledBy = scope.userId;
      data.cancelledAt = now;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No effective change", code: "INVALID_INPUT" }, { status: 400 });
  }

  // An INCIDENT-scoped hold activating/releasing runs under the SHARED global lock
  // order ComplianceIncident → LegalHold. The pre-read `existing` is only a candidate;
  // the transition function locks the incident FIRST, then the hold, re-reads the FULL
  // authoritative hold and requires it to EXACTLY match this pre-read snapshot
  // {status, scopeType, incidentId, updatedAt} — otherwise the parent binding changed
  // (HOLD_BINDING_CHANGED) and the caller must retry. It writes only explicit
  // allow-listed fields with a post-lock time, so activation and incident closure
  // linearise and a CLOSED incident with an ACTIVE hold can never persist.
  const newStatus = data.status as string | undefined;
  if (existing.scopeType === "INCIDENT" && existing.incidentId && (newStatus === "ACTIVE" || newStatus === "RELEASED")) {
    const res = await applyIncidentScopedHoldTransition({
      holdId: id, organizationId: scope.organizationId, actorId: scope.userId, toStatus: newStatus,
      expected: { status: existing.status, scopeType: existing.scopeType, incidentId: existing.incidentId, updatedAt: existing.updatedAt },
    });
    if (!res.ok) {
      if (res.reason === "NOT_FOUND") return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
      if (res.reason === "INCIDENT_NOT_ACTIVE") return NextResponse.json({ error: "The parent incident is not in an active state; reopen it before activating a hold", code: "INCIDENT_NOT_ACTIVE" }, { status: 409 });
      if (res.reason === "HOLD_BINDING_CHANGED") return NextResponse.json({ error: "The hold's parent binding changed under the operation; retry", code: "HOLD_BINDING_CHANGED" }, { status: 409 });
      return NextResponse.json({ error: "Hold transition conflict", code: "CONFLICT" }, { status: 409 });
    }
  } else {
    const { affected } = await updateLegalHoldForOrg({ id, organizationId: scope.organizationId, updatedBy: scope.userId, data });
    if (affected !== 1) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const row = await getLegalHoldForOrg(id, scope.organizationId);
  await recordAuditEvent({
    userId: scope.userId,
    action: COMPLIANCE_AUDIT.LEGAL_HOLD_UPDATED,
    entityType: "LegalHold",
    entityId: id,
    organizationId: scope.organizationId,
    outcome: "SUCCESS",
    metadata: {
      previousStatus: existing.status,
      newStatus: row?.status ?? existing.status,
      fieldsUpdated: Object.keys(data).sort(),
    },
  });

  return NextResponse.json({ hold: row ? toLegalHoldDto(row) : null });
}
