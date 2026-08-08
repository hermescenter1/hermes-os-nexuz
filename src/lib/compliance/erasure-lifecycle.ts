/**
 * Phase 97 Part H — Governed subject data erasure lifecycle (pure, I/O-free).
 *
 * DataDeletionRequest is a CHILD planning/execution job whose authoritative parent
 * is the PrivacyRequest. The child never broadens the parent's subject or org, and
 * a legacy row that cannot prove approval or parent binding lands in the fail-closed
 * REVIEW_REQUIRED (or FAILED) quarantine state. Destructive execution is disabled by
 * default; this module ships only planning + closed-lifecycle logic.
 */

export type ErasureLifecycle =
  | "REVIEW_REQUIRED"
  | "REQUESTED"
  | "PLANNING"
  | "PLAN_READY"
  | "IN_REVIEW"
  | "APPROVED"
  | "EXECUTION_PENDING"
  | "EXECUTING"
  | "COMPLETED"
  | "BLOCKED"
  | "FAILED"
  | "REJECTED"
  | "CANCELLED";

export const ERASURE_LIFECYCLES: ErasureLifecycle[] = [
  "REVIEW_REQUIRED", "REQUESTED", "PLANNING", "PLAN_READY", "IN_REVIEW", "APPROVED",
  "EXECUTION_PENDING", "EXECUTING", "COMPLETED", "BLOCKED", "FAILED", "REJECTED", "CANCELLED",
];

/** Lifecycle states that count as an ACTIVE job (block a new job for the parent). */
export const ACTIVE_ERASURE_LIFECYCLES: ErasureLifecycle[] = [
  "REQUESTED", "PLANNING", "PLAN_READY", "IN_REVIEW", "APPROVED", "EXECUTION_PENDING", "EXECUTING",
];
export const TERMINAL_ERASURE_LIFECYCLES: ErasureLifecycle[] = ["COMPLETED", "FAILED", "REJECTED", "CANCELLED"];

/** Parentless (legacy/quarantine) rows may only ever hold these states. */
export const PARENTLESS_ERASURE_LIFECYCLES: ErasureLifecycle[] = ["REVIEW_REQUIRED", "FAILED", "CANCELLED"];

/** States that require a durable, hashed plan snapshot to exist. */
export const PLAN_BEARING_ERASURE_LIFECYCLES: ErasureLifecycle[] = [
  "PLAN_READY", "IN_REVIEW", "APPROVED", "EXECUTION_PENDING", "EXECUTING", "COMPLETED",
];
/** States that require approval attribution. */
export const APPROVED_ERASURE_LIFECYCLES: ErasureLifecycle[] = [
  "APPROVED", "EXECUTION_PENDING", "EXECUTING", "COMPLETED",
];
/** States that require an execution idempotency key. */
export const EXECUTION_ERASURE_LIFECYCLES: ErasureLifecycle[] = ["EXECUTION_PENDING", "EXECUTING", "COMPLETED"];

export const ERASURE_TRANSITIONS: Record<ErasureLifecycle, ErasureLifecycle[]> = {
  REVIEW_REQUIRED:   ["CANCELLED"],                          // legacy fail-closed — never auto-approved
  REQUESTED:         ["PLANNING", "CANCELLED", "FAILED"],
  PLANNING:          ["PLAN_READY", "BLOCKED", "FAILED", "CANCELLED"],
  PLAN_READY:        ["IN_REVIEW", "PLANNING", "CANCELLED"], // regenerate → PLANNING (new version)
  IN_REVIEW:         ["APPROVED", "REJECTED", "PLAN_READY", "CANCELLED"],
  APPROVED:          ["EXECUTION_PENDING", "PLANNING", "CANCELLED"], // PLANNING = invalidate approval
  EXECUTION_PENDING: ["EXECUTING", "FAILED", "CANCELLED"],
  EXECUTING:         ["COMPLETED", "FAILED"],
  COMPLETED:         [],
  BLOCKED:           ["PLANNING", "CANCELLED"],
  FAILED:            [],
  REJECTED:          [],
  CANCELLED:         [],
};

/** Permission class for API-callable transitions (executor/planner steps are internal). */
export type ErasureAction = "manage" | "approve" | "execute";
const TRANSITION_ACTION: Record<string, ErasureAction> = {
  "PLAN_READY->IN_REVIEW":         "manage",
  "PLAN_READY->PLANNING":          "manage",  // regenerate (new plan version)
  "IN_REVIEW->APPROVED":           "approve",
  "IN_REVIEW->REJECTED":           "approve",
  "IN_REVIEW->PLAN_READY":         "manage",  // send back for revision
  "APPROVED->PLANNING":            "manage",  // invalidate prior approval → re-plan
  "APPROVED->EXECUTION_PENDING":   "execute", // arm execution (still behind the disabled gate)
  "BLOCKED->PLANNING":             "manage",
  "REVIEW_REQUIRED->CANCELLED":    "manage",
  "REQUESTED->CANCELLED":          "manage",
  "PLANNING->CANCELLED":           "manage",
  "PLAN_READY->CANCELLED":         "manage",
  "IN_REVIEW->CANCELLED":          "manage",
  "APPROVED->CANCELLED":           "manage",
  "EXECUTION_PENDING->CANCELLED":  "manage",
  "BLOCKED->CANCELLED":            "manage",
};

/** Internal planner/executor steps — NEVER directly API-callable. A public or
 *  tenant API can never set EXECUTING or COMPLETED. */
const INTERNAL_STEPS = new Set([
  "REQUESTED->PLANNING", "PLANNING->PLAN_READY", "PLANNING->BLOCKED", "PLANNING->FAILED",
  "EXECUTION_PENDING->EXECUTING", "EXECUTING->COMPLETED", "EXECUTING->FAILED", "EXECUTION_PENDING->FAILED",
]);

export const ERASURE_COMPATIBLE_REQUEST_TYPES = ["DATA_DELETION"];
/** The ONLY parent state from which a NEW erasure child may be created. */
export const ERASURE_CREATE_PARENT_STATE = "APPROVED";

export type ErasureParentEligibilityCode =
  | "ERASURE_SUBJECT_CLASS_UNSUPPORTED"
  | "PARENT_TYPE_INCOMPATIBLE"
  | "PARENT_SCOPE_CONFIGURATION_REQUIRED"
  | "PARENT_NOT_APPROVED"
  | "IDENTITY_NOT_VERIFIED";

export interface ErasureParentEligibility { ok: boolean; code?: ErasureParentEligibilityCode }

/**
 * Fail-closed eligibility to CREATE a NEW erasure child from a parent.
 *   - Part H supports USER subjects only — a Candidate (or missing userId) parent is
 *     rejected before any child/plan is created (ERASURE_SUBJECT_CLASS_UNSUPPORTED).
 *   - only an exactly-APPROVED, identity-verified, deletion-typed parent qualifies;
 *     PARTIALLY_APPROVED is fail-closed (no scoped-approval model yet).
 */
export function assessParentErasureEligibility(parent: {
  requestType: string; status: string; identityVerifiedAt: Date | null;
  userId: string | null; candidateId: string | null;
}): ErasureParentEligibility {
  if (!parent.userId || parent.candidateId) return { ok: false, code: "ERASURE_SUBJECT_CLASS_UNSUPPORTED" };
  if (!ERASURE_COMPATIBLE_REQUEST_TYPES.includes(parent.requestType)) return { ok: false, code: "PARENT_TYPE_INCOMPATIBLE" };
  if (parent.status === "PARTIALLY_APPROVED") return { ok: false, code: "PARENT_SCOPE_CONFIGURATION_REQUIRED" };
  if (parent.status !== ERASURE_CREATE_PARENT_STATE) return { ok: false, code: "PARENT_NOT_APPROVED" };
  if (!parent.identityVerifiedAt) return { ok: false, code: "IDENTITY_NOT_VERIFIED" };
  return { ok: true };
}

export function isKnownErasureLifecycle(s: string): s is ErasureLifecycle {
  return (ERASURE_LIFECYCLES as string[]).includes(s);
}
export function isActiveErasureLifecycle(s: string): boolean {
  return (ACTIVE_ERASURE_LIFECYCLES as string[]).includes(s);
}
export function isTerminalErasureLifecycle(s: string): boolean {
  return (TERMINAL_ERASURE_LIFECYCLES as string[]).includes(s);
}
export function canTransitionErasure(from: string, to: string): boolean {
  if (from === to) return false;
  const allowed = ERASURE_TRANSITIONS[from as ErasureLifecycle];
  return Array.isArray(allowed) && (allowed as string[]).includes(to);
}
/** The API permission a transition needs, or null if not an API-callable transition
 *  (unknown, disallowed, or an internal planner/executor step). */
export function erasureTransitionAction(from: string, to: string): ErasureAction | null {
  if (!canTransitionErasure(from, to)) return null;
  if (INTERNAL_STEPS.has(`${from}->${to}`)) return null;
  return TRANSITION_ACTION[`${from}->${to}`] ?? null;
}
export function isInternalErasureStep(from: string, to: string): boolean {
  return INTERNAL_STEPS.has(`${from}->${to}`);
}

// ── Execution posture (disabled by default) ───────────────────────────────────

export function isErasureExecutionEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.COMPLIANCE_ERASURE_EXECUTION_ENABLED === "true";
}
