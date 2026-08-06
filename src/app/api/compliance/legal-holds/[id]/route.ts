import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { getLegalHoldForOrg }         from "@/lib/compliance/db";
import {
  applyIncidentScopedHoldTransition,
  editLegalHoldForOrg,
  transitionLegalHoldForOrg,
  type HoldExpectedSnapshot,
} from "@/lib/compliance/incident-db";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import {
  updateLegalHoldSchema,
  toLegalHoldDto,
} from "@/lib/compliance/retention-schema";
import {
  canTransitionLegalHold,
  isTerminalLegalHoldStatus,
} from "@/lib/compliance/legal-hold";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "view_compliance", "compliance.legal_hold.get");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const { id } = await params;
  const row = await getLegalHoldForOrg(id, scope.organizationId);
  if (!row) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ hold: toLegalHoldDto(row) });
}

// Closed result-code → HTTP mapping for every governed LegalHold persistence op.
// The code IS the closed reason (foreign / unknown ids are uniform NOT_FOUND upstream).
const HOLD_ERROR_MAP: Record<string, { status: number; error: string }> = {
  NOT_FOUND:                     { status: 404, error: "Not found" },
  HOLD_CHANGED_RETRY:            { status: 409, error: "The hold changed under the operation; retry" },
  HOLD_IMMUTABLE:                { status: 409, error: "Hold is terminal and immutable" },
  ACTIVE_HOLD_IMMUTABLE:         { status: 409, error: "Active hold fields are immutable" },
  INVALID_SCOPE:                 { status: 400, error: "Invalid legal hold scope" },
  INVALID_HOLD_TRANSITION:       { status: 409, error: "Transition not allowed" },
  INVALID_LEGAL_HOLD_ACTIVATION: { status: 422, error: "Invalid legal hold scope" },
  INCIDENT_NOT_ACTIVE:           { status: 409, error: "The parent incident is not in an active state; reopen it before activating a hold" },
  HOLD_BINDING_CHANGED:          { status: 409, error: "The hold's parent binding changed under the operation; retry" },
  CONFLICT:                      { status: 409, error: "Hold transition conflict" },
};
function holdError(reason: string, scopeReason?: string): NextResponse {
  const m = HOLD_ERROR_MAP[reason] ?? HOLD_ERROR_MAP.CONFLICT;
  const body: Record<string, unknown> = { error: m.error, code: reason in HOLD_ERROR_MAP ? reason : "CONFLICT" };
  if (scopeReason) body.reason = scopeReason;
  return NextResponse.json(body, { status: m.status });
}

/**
 * Update / transition a legal hold. EVERY mutation is linearized by a governed,
 * row-locked persistence op — the route is NOT the authoritative lifecycle or
 * mutability boundary. It authenticates, authorizes, parses strict input, performs a
 * candidate pre-read (to route + reject a combined edit-plus-transition), selects the
 * governed op, maps closed result codes and writes AuditLog ONLY after the op commits,
 * from the op's exact `fieldsWritten` (never request keys / the pre-read / intended
 * fields). No route-created timestamps reach an evidence write — the ops capture
 * clock_timestamp() after acquiring their locks.
 *
 *  - RELEASED / CANCELLED (terminal): fully immutable.
 *  - ACTIVE: only `reviewDate` is editable, plus the release transition.
 *  - PROPOSED: material edits (revalidated scope); activate / cancel.
 *  - INCIDENT-scoped ACTIVE / RELEASE use ONLY applyIncidentScopedHoldTransition
 *    (Incident → LegalHold lock order); every other mutation uses the LegalHold-only
 *    governed edit / transition op.
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

  // Candidate pre-read — routing + fast rejects only; the governed op is authoritative.
  const existing = await getLegalHoldForOrg(id, scope.organizationId);
  if (!existing) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  // Terminal fast-reject (the governed op re-enforces this under lock).
  if (isTerminalLegalHoldStatus(existing.status)) {
    return NextResponse.json({ error: "Hold is terminal and immutable", code: "HOLD_IMMUTABLE" }, { status: 409 });
  }

  const requestedStatus = input.status;
  const isTransition = requestedStatus !== undefined && requestedStatus !== existing.status;
  const TRANSITION_STATUSES = ["ACTIVE", "RELEASED", "CANCELLED"];
  if (isTransition && !TRANSITION_STATUSES.includes(requestedStatus as string)) {
    return NextResponse.json({ error: "Transition not allowed", code: "INVALID_TRANSITION" }, { status: 409 });
  }

  // ── Stable transition policy ────────────────────────────────────────────────
  // A lifecycle transition may NOT be combined with any material / review-field edit.
  // The caller persists the edit first, then transitions in a SEPARATE request against
  // the resulting stable snapshot — so the pre-read snapshot IS the transition candidate.
  const MATERIAL_KEYS = ["name", "reasonClass", "scopeType", "subjectId", "resourceType", "resourceId", "processingActivityId", "incidentId", "rangeStart", "rangeEnd", "startDate", "reviewDate"];
  if (isTransition) {
    const combined = MATERIAL_KEYS.filter((k) => (input as Record<string, unknown>)[k] !== undefined);
    if (combined.length > 0) {
      return NextResponse.json({ error: "A lifecycle transition may not carry a material edit; persist the edit first, then transition against the stable snapshot", code: "HOLD_TRANSITION_REQUIRES_STABLE_SNAPSHOT" }, { status: 409 });
    }
  }

  const expected: HoldExpectedSnapshot = {
    status:     existing.status,
    scopeType:  existing.scopeType,
    incidentId: existing.incidentId ?? null,
    updatedAt:  existing.updatedAt,
  };

  let fieldsUpdated: string[];
  let committedStatus: string;

  if (!isTransition) {
    // ── Pure material / review edit → governed LegalHold-locked edit ───────────
    const toDate = (s?: string | null) => (s ? new Date(s) : null);
    const edit: Record<string, unknown> = {};
    if (input.name !== undefined)                 edit.name = input.name;
    if (input.reasonClass !== undefined)          edit.reasonClass = input.reasonClass;
    if (input.scopeType !== undefined)            edit.scopeType = input.scopeType;
    if (input.subjectId !== undefined)            edit.subjectId = input.subjectId;
    if (input.resourceType !== undefined)         edit.resourceType = input.resourceType;
    if (input.resourceId !== undefined)           edit.resourceId = input.resourceId;
    if (input.processingActivityId !== undefined) edit.processingActivityId = input.processingActivityId;
    if (input.incidentId !== undefined)           edit.incidentId = input.incidentId;
    if (input.rangeStart !== undefined)           edit.rangeStart = toDate(input.rangeStart);
    if (input.rangeEnd !== undefined)             edit.rangeEnd = toDate(input.rangeEnd);
    if (input.startDate !== undefined)            edit.startDate = toDate(input.startDate);
    if (input.reviewDate !== undefined)           edit.reviewDate = toDate(input.reviewDate);
    if (Object.keys(edit).length === 0) return NextResponse.json({ error: "No effective change", code: "INVALID_INPUT" }, { status: 400 });

    const res = await editLegalHoldForOrg({ holdId: id, organizationId: scope.organizationId, actorId: scope.userId, expected, edit });
    if (!res.ok) return holdError(res.reason, res.scopeReason);
    fieldsUpdated = res.fieldsWritten; committedStatus = res.status;
  } else {
    // ── Lifecycle transition against the STABLE persisted snapshot ─────────────
    if (!canTransitionLegalHold(existing.status, requestedStatus as string)) {
      return NextResponse.json({ error: "Transition not allowed", code: "INVALID_TRANSITION" }, { status: 409 });
    }
    if (existing.scopeType === "INCIDENT" && (requestedStatus === "ACTIVE" || requestedStatus === "RELEASED")) {
      // INCIDENT-scoped ACTIVE/RELEASE → ONLY the incident-ordered locked service.
      if (!existing.incidentId) return NextResponse.json({ error: "Invalid legal hold scope", code: "INVALID_LEGAL_HOLD_ACTIVATION", reason: "INCIDENT_ID_REQUIRED" }, { status: 422 });
      const res = await applyIncidentScopedHoldTransition({
        holdId: id, organizationId: scope.organizationId, actorId: scope.userId, toStatus: requestedStatus,
        expected: { status: existing.status, scopeType: existing.scopeType, incidentId: existing.incidentId, updatedAt: existing.updatedAt },
      });
      if (!res.ok) return holdError(res.reason);
      fieldsUpdated = res.fieldsWritten; committedStatus = res.status;
    } else {
      // Non-incident transition (or CANCELLED of any scope) → LegalHold-locked service.
      const res = await transitionLegalHoldForOrg({
        holdId: id, organizationId: scope.organizationId, actorId: scope.userId,
        toStatus: requestedStatus as "ACTIVE" | "RELEASED" | "CANCELLED", expected,
      });
      if (!res.ok) return holdError(res.reason, res.scopeReason);
      fieldsUpdated = res.fieldsWritten; committedStatus = res.status;
    }
  }

  // Both audit facts are authoritative: previousStatus is the pre-read the op revalidated
  // under lock (else HOLD_CHANGED_RETRY, no audit); newStatus + fieldsUpdated come from the
  // op's COMMITTED result — never a fallible/unlocked post-commit re-read. The fresh row is
  // read ONLY to shape the response DTO (its absence never corrupts the evidence record).
  const row = await getLegalHoldForOrg(id, scope.organizationId);
  await recordAuditEvent({
    userId: scope.userId,
    action: COMPLIANCE_AUDIT.LEGAL_HOLD_UPDATED,
    entityType: "LegalHold",
    entityId: id,
    organizationId: scope.organizationId,
    outcome: "SUCCESS",
    metadata: { previousStatus: existing.status, newStatus: committedStatus, fieldsUpdated },
  });

  return NextResponse.json({ hold: row ? toLegalHoldDto(row) : null });
}
