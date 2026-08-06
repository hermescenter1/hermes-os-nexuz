/**
 * Phase 97 — Legal-hold scope validation & lifecycle rules (pure, I/O-free).
 *
 * Enforces (proven by tests):
 *   - a legal hold is semantically COMPLETE for its scope type or it is rejected
 *     (fail-closed); unknown scope types fail closed (INVALID_LEGAL_HOLD_ACTIVATION=0
 *     is upheld by re-running this before PROPOSED→ACTIVE);
 *   - contradictory target fields are rejected, never silently retained;
 *   - a closed status machine with a distinct CANCELLED terminal for a
 *     never-activated proposal (separate from RELEASE of an active hold);
 *   - the material fields that are frozen once a hold is ACTIVE.
 */

import { LEGAL_HOLD_SCOPE_TYPES, type LegalHoldStatus } from "./retention-engine";

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export const LEGAL_HOLD_TRANSITIONS: Record<LegalHoldStatus, LegalHoldStatus[]> = {
  PROPOSED: ["ACTIVE", "CANCELLED"], // ACTIVE = activate; CANCELLED = withdraw a proposal
  ACTIVE:   ["RELEASED"],            // an active hold is RELEASED, never CANCELLED
  RELEASED: [],
  CANCELLED: [],
};

export const TERMINAL_LEGAL_HOLD_STATUSES: LegalHoldStatus[] = ["RELEASED", "CANCELLED"];

export function isTerminalLegalHoldStatus(s: string): boolean {
  return (TERMINAL_LEGAL_HOLD_STATUSES as string[]).includes(s);
}

export function canTransitionLegalHold(from: string, to: string): boolean {
  if (from === to) return false;
  const allowed = LEGAL_HOLD_TRANSITIONS[from as LegalHoldStatus];
  return Array.isArray(allowed) && (allowed as string[]).includes(to);
}

/**
 * Pure mutability decision for a MATERIAL / REVIEW edit, evaluated from the
 * authoritative LOCKED status (never a pre-transaction read). Terminal holds are
 * fully immutable; an ACTIVE hold accepts ONLY `reviewDate`; a PROPOSED hold accepts
 * material edits. `editKeys` is the set of fields the caller intends to write.
 */
export type LegalHoldEditPolicy =
  | { ok: true;  scope: "MATERIAL" | "REVIEW_ONLY" }
  | { ok: false; reason: "HOLD_IMMUTABLE" | "ACTIVE_HOLD_IMMUTABLE" };

export function classifyLegalHoldEdit(lockedStatus: string, editKeys: readonly string[]): LegalHoldEditPolicy {
  if (isTerminalLegalHoldStatus(lockedStatus)) return { ok: false, reason: "HOLD_IMMUTABLE" };
  if (lockedStatus === "ACTIVE") {
    const allowed = ACTIVE_EDITABLE_LEGAL_HOLD_FIELDS as readonly string[];
    if (editKeys.some((k) => !allowed.includes(k))) return { ok: false, reason: "ACTIVE_HOLD_IMMUTABLE" };
    return { ok: true, scope: "REVIEW_ONLY" };
  }
  // PROPOSED (the only remaining non-terminal, non-active lifecycle) — material edits allowed.
  return { ok: true, scope: "MATERIAL" };
}

/**
 * Pure lifecycle-transition decision, evaluated from the authoritative LOCKED status.
 * Only the closed machine's edges are valid: PROPOSED→ACTIVE (activate),
 * ACTIVE→RELEASED (release), PROPOSED→CANCELLED (withdraw a proposal). Every other
 * pair (including any transition out of a terminal status) is rejected.
 */
export type LegalHoldTransitionKind = "ACTIVATE" | "RELEASE" | "CANCEL";

export function classifyLegalHoldTransition(lockedStatus: string, toStatus: string):
  | { ok: true; kind: LegalHoldTransitionKind }
  | { ok: false } {
  if (!canTransitionLegalHold(lockedStatus, toStatus)) return { ok: false };
  if (toStatus === "ACTIVE")    return { ok: true, kind: "ACTIVATE" };
  if (toStatus === "RELEASED")  return { ok: true, kind: "RELEASE" };
  if (toStatus === "CANCELLED") return { ok: true, kind: "CANCEL" };
  return { ok: false };
}

/**
 * Material fields — frozen once a hold is ACTIVE. Changing any of these under an
 * existing approval is forbidden; a material change requires release + a new
 * PROPOSED hold + separate activation.
 */
export const MATERIAL_LEGAL_HOLD_FIELDS = [
  "scopeType", "subjectId", "resourceType", "resourceId",
  "processingActivityId", "incidentId", "rangeStart", "rangeEnd",
  "reasonClass", "startDate",
] as const;

/** The ONLY fields editable while ACTIVE (besides the release status transition). */
export const ACTIVE_EDITABLE_LEGAL_HOLD_FIELDS = ["reviewDate"] as const;

// ── Scope validation ──────────────────────────────────────────────────────────

export interface LegalHoldScopeInput {
  scopeType:             string;
  subjectId?:            string | null;
  resourceType?:         string | null;
  resourceId?:           string | null;
  processingActivityId?: string | null;
  incidentId?:           string | null;
  rangeStart?:           Date | string | null;
  rangeEnd?:             Date | string | null;
}

export interface NormalizedLegalHoldScope {
  scopeType:             string;
  subjectId:             string | null;
  resourceType:          string | null;
  resourceId:            string | null;
  processingActivityId:  string | null;
  incidentId:            string | null;
  rangeStart:            Date | null;
  rangeEnd:              Date | null;
}

export type LegalHoldScopeValidation =
  | { ok: true;  normalized: NormalizedLegalHoldScope }
  | { ok: false; code: "INVALID_SCOPE"; reason: string };

function toDate(v: Date | string | null | undefined): Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function present(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return true;
}

// Target fields that must be absent unless the scope explicitly allows them.
const TARGET_FIELDS = ["subjectId", "resourceType", "resourceId", "processingActivityId", "incidentId", "rangeStart", "rangeEnd"] as const;

const ALLOWED_BY_SCOPE: Record<string, ReadonlyArray<typeof TARGET_FIELDS[number]>> = {
  SUBJECT:              ["subjectId"],
  RESOURCE:             ["resourceType", "resourceId"],
  RESOURCE_TYPE:        ["resourceType"],
  PROCESSING_ACTIVITY:  ["processingActivityId"],
  INCIDENT:             ["incidentId"],
  DATE_RANGE:           ["rangeStart", "rangeEnd"],
  ORGANIZATION:         [],
};

/**
 * Validate a hold's scope. Returns a normalized scope (only the fields the scope
 * type allows; everything else forced null) or a fail-closed rejection.
 */
export function validateLegalHoldScope(input: LegalHoldScopeInput): LegalHoldScopeValidation {
  const scopeType = input.scopeType;
  if (!(LEGAL_HOLD_SCOPE_TYPES as string[]).includes(scopeType)) {
    return { ok: false, code: "INVALID_SCOPE", reason: "UNKNOWN_SCOPE_TYPE" };
  }
  const allowed = ALLOWED_BY_SCOPE[scopeType] ?? [];

  const values: Record<typeof TARGET_FIELDS[number], unknown> = {
    subjectId: input.subjectId, resourceType: input.resourceType, resourceId: input.resourceId,
    processingActivityId: input.processingActivityId, incidentId: input.incidentId,
    rangeStart: input.rangeStart, rangeEnd: input.rangeEnd,
  };

  // Reject any present field the scope does not allow (never silently retained).
  for (const f of TARGET_FIELDS) {
    if (present(values[f]) && !allowed.includes(f)) {
      return { ok: false, code: "INVALID_SCOPE", reason: `CONTRADICTORY_FIELD:${f}` };
    }
  }

  // Scope-specific completeness.
  if (scopeType === "DATE_RANGE") {
    const start = toDate(input.rangeStart);
    const end = toDate(input.rangeEnd);
    if (!start && !end) return { ok: false, code: "INVALID_SCOPE", reason: "RANGE_REQUIRED" };
    if (start && end && start.getTime() > end.getTime()) {
      return { ok: false, code: "INVALID_SCOPE", reason: "RANGE_START_AFTER_END" };
    }
  } else {
    for (const f of allowed) {
      if (!present(values[f])) return { ok: false, code: "INVALID_SCOPE", reason: `MISSING_FIELD:${f}` };
    }
  }

  return {
    ok: true,
    normalized: {
      scopeType,
      subjectId:            allowed.includes("subjectId") ? String(input.subjectId).trim() : null,
      resourceType:         allowed.includes("resourceType") ? String(input.resourceType).trim() : null,
      resourceId:           allowed.includes("resourceId") ? String(input.resourceId).trim() : null,
      processingActivityId: allowed.includes("processingActivityId") ? String(input.processingActivityId).trim() : null,
      incidentId:           allowed.includes("incidentId") ? String(input.incidentId).trim() : null,
      rangeStart:           allowed.includes("rangeStart") ? toDate(input.rangeStart) : null,
      rangeEnd:             allowed.includes("rangeEnd") ? toDate(input.rangeEnd) : null,
    },
  };
}
