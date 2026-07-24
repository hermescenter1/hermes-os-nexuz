// PHASE 94B2 — finding governance: one centralized transition matrix.
//
// Scattered `if (from === X && to === Y)` conditionals are how a workflow
// quietly acquires an illegal edge. The allowed edges are declared ONCE here as
// data, every caller asks this module, and the tests enumerate the full
// cartesian product so any edge that is not declared is provably rejected.
//
// ADVISORY ONLY. A transition records a human's judgement about a finding. It
// never edits the finding's evidence, never re-runs analysis, and never emits a
// device instruction — Phase 94 writes nothing to industrial equipment.

export const FINDING_STATES = [
  "OPEN",
  "ACKNOWLEDGED",
  "ACCEPTED",
  "REJECTED",
  "RESOLVED",
  "SUPERSEDED",
] as const;
export type FindingState = (typeof FINDING_STATES)[number];

/**
 * The complete set of permitted edges.
 *
 * REJECTED and RESOLVED are terminal for human review: a finding that was
 * dismissed or fixed must be re-raised by a fresh analysis run rather than
 * quietly reopened, so the audit trail always shows why a finding came back.
 * SUPERSEDED is reachable from every non-terminal state because a later
 * deterministic run may legitimately replace an earlier finding.
 */
const ALLOWED: Readonly<Record<FindingState, readonly FindingState[]>> = Object.freeze({
  OPEN: ["ACKNOWLEDGED", "ACCEPTED", "REJECTED", "SUPERSEDED"],
  ACKNOWLEDGED: ["ACCEPTED", "REJECTED", "RESOLVED", "SUPERSEDED"],
  ACCEPTED: ["RESOLVED", "SUPERSEDED"],
  REJECTED: [],
  RESOLVED: [],
  SUPERSEDED: [],
});

/** States from which no human transition is possible. */
export const TERMINAL_STATES: readonly FindingState[] = Object.freeze(
  FINDING_STATES.filter((s) => ALLOWED[s].length === 0),
);

export type TransitionVerdict =
  | { ok: true; kind: "APPLY"; from: FindingState; to: FindingState }
  /** Same state requested again — safe to treat as already done. */
  | { ok: true; kind: "NOOP"; from: FindingState; to: FindingState }
  | { ok: false; reason: "UNKNOWN_STATE" | "TERMINAL" | "NOT_ALLOWED" };

/**
 * Decide a transition. Pure: no database, no clock, no actor lookup — the
 * caller supplies the current state and the request, so the same pair always
 * yields the same verdict and the matrix is exhaustively testable.
 */
export function evaluateTransition(from: string, to: string): TransitionVerdict {
  if (!isFindingState(from) || !isFindingState(to)) return { ok: false, reason: "UNKNOWN_STATE" };

  // Re-issuing the state a finding already holds is idempotent, so a retried
  // request (or a double-click) cannot produce a spurious second audit event.
  if (from === to) return { ok: true, kind: "NOOP", from, to };

  if (ALLOWED[from].length === 0) return { ok: false, reason: "TERMINAL" };
  if (!ALLOWED[from].includes(to)) return { ok: false, reason: "NOT_ALLOWED" };

  return { ok: true, kind: "APPLY", from, to };
}

export function isFindingState(value: string): value is FindingState {
  return (FINDING_STATES as readonly string[]).includes(value);
}

/** HTTP status for a refused transition, using the project's conventions. */
export const TRANSITION_STATUS: Record<
  Exclude<TransitionVerdict, { ok: true }>["reason"],
  number
> = {
  UNKNOWN_STATE: 422, // syntactically valid request, unprocessable value
  TERMINAL: 409, // conflicts with the finding's current state
  NOT_ALLOWED: 409,
};

/** Audit action per applied transition. Names follow the platform convention. */
export const TRANSITION_AUDIT: Record<FindingState, string | null> = {
  OPEN: null, // findings are created OPEN; there is no transition INTO it
  ACKNOWLEDGED: "ENGINEERING_FINDING_ACKNOWLEDGED",
  ACCEPTED: "ENGINEERING_FINDING_ACCEPTED",
  REJECTED: "ENGINEERING_FINDING_REJECTED",
  RESOLVED: "ENGINEERING_FINDING_RESOLVED",
  SUPERSEDED: "ENGINEERING_FINDING_SUPERSEDED",
};

/** Maximum length of the free-text review note a reviewer may attach. */
export const MAX_REVIEW_NOTE = 2000;

/**
 * The ONLY columns a review transition may write.
 *
 * The finding's deterministic content — rule id, rule version, evidence,
 * description, severity, and the human-approval flag on a safety finding — is
 * the output of an analysis run and is not a reviewer's to edit. A caller that
 * builds its update from this list cannot accidentally let a request body
 * overwrite evidence.
 */
export const MUTABLE_REVIEW_FIELDS = Object.freeze([
  "state",
  "reviewedById",
  "reviewedAt",
  "reviewNote",
] as const);

/** Fields that must never change after a finding is created. */
export const IMMUTABLE_FINDING_FIELDS = Object.freeze([
  "ruleId",
  "ruleVersion",
  "category",
  "severity",
  "title",
  "description",
  "evidenceRefs",
  "artifactType",
  "artifactRef",
  "humanApprovalRequired",
] as const);

/**
 * Build the update patch for an accepted transition.
 *
 * Whitelist-shaped on purpose: the returned object is the complete set of
 * changes, so no caller-supplied field can ride along into the write.
 */
export function buildReviewPatch(input: {
  to: FindingState;
  reviewedById: string;
  reviewedAt: Date;
  reviewNote?: string | null;
}): {
  state: FindingState;
  reviewedById: string;
  reviewedAt: Date;
  reviewNote: string | null;
} {
  const note = (input.reviewNote ?? "").trim();
  return {
    state: input.to,
    reviewedById: input.reviewedById,
    reviewedAt: input.reviewedAt,
    reviewNote: note.length === 0 ? null : note.slice(0, MAX_REVIEW_NOTE),
  };
}
