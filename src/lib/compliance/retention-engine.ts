/**
 * Phase 97 — Retention governance & Legal holds (Part E+F) domain logic.
 *
 * Pure, deterministic, I/O-free. This module PLANS retention; it never executes a
 * deletion or anonymisation. Two guarantees are enforced here and proven by the
 * tests:
 *   - A record under an ACTIVE legal hold is NEVER eligible for deletion or
 *     anonymisation — the hold short-circuits to LEGAL_HOLD before any due-date
 *     or configuration check (invariant LEGAL_HOLD_PROTECTED_DELETION=0).
 *   - No statutory duration or approval is invented: a policy without an
 *     approved, day-valued, non-REVIEW action resolves to CONFIGURATION_REQUIRED
 *     and produces no action.
 * Destructive execution is out of scope for this slice and is additionally gated
 * behind a default-false environment flag (see isRetentionExecutionEnabled).
 */

export type LegalHoldScopeType =
  | "SUBJECT"
  | "RESOURCE"
  | "RESOURCE_TYPE"
  | "ORGANIZATION"
  | "INCIDENT"
  | "DATE_RANGE"
  | "PROCESSING_ACTIVITY";

export const LEGAL_HOLD_SCOPE_TYPES: LegalHoldScopeType[] = [
  "SUBJECT", "RESOURCE", "RESOURCE_TYPE", "ORGANIZATION", "INCIDENT", "DATE_RANGE", "PROCESSING_ACTIVITY",
];

export type RetentionAction =
  | "DELETE"
  | "ANONYMISE"
  | "ARCHIVE"
  | "REVIEW_REQUIRED"
  | "NO_AUTOMATED_ACTION";

export const RETENTION_ACTIONS: RetentionAction[] = ["DELETE", "ANONYMISE", "ARCHIVE", "REVIEW_REQUIRED", "NO_AUTOMATED_ACTION"];

export type RetentionTrigger = "CREATION" | "LAST_ACTIVITY" | "CASE_CLOSURE" | "REVIEW_REQUIRED";
export const RETENTION_TRIGGERS: RetentionTrigger[] = ["CREATION", "LAST_ACTIVITY", "CASE_CLOSURE", "REVIEW_REQUIRED"];

export type LegalHoldStatus = "PROPOSED" | "ACTIVE" | "RELEASED";
export const LEGAL_HOLD_STATUSES: LegalHoldStatus[] = ["PROPOSED", "ACTIVE", "RELEASED"];

export type RetentionApprovalState = "PENDING_REVIEW" | "APPROVED" | "REJECTED";
export const RETENTION_APPROVAL_STATES: RetentionApprovalState[] = ["PENDING_REVIEW", "APPROVED", "REJECTED"];

export interface HoldLike {
  organizationId:       string;
  scopeType:            string;
  status:               string;
  subjectId?:           string | null;
  resourceType?:        string | null;
  resourceId?:          string | null;
  processingActivityId?: string | null;
  incidentId?:          string | null;
  rangeStart?:          Date | null;
  rangeEnd?:            Date | null;
}

export interface HoldTarget {
  organizationId:        string;
  subjectId?:            string | null;
  resourceType?:         string | null;
  resourceId?:           string | null;
  processingActivityId?: string | null;
  incidentId?:           string | null;
  timestamp?:            Date | null;
}

/**
 * Does a single hold cover a target? A hold only ever applies within its own
 * organization and only while ACTIVE. Cross-tenant holds never match.
 */
export function holdCovers(hold: HoldLike, target: HoldTarget): boolean {
  if (hold.status !== "ACTIVE") return false;
  if (hold.organizationId !== target.organizationId) return false;
  switch (hold.scopeType) {
    case "ORGANIZATION":
      return true;
    case "SUBJECT":
      return !!hold.subjectId && hold.subjectId === target.subjectId;
    case "RESOURCE":
      return !!hold.resourceType && !!hold.resourceId
        && hold.resourceType === target.resourceType
        && hold.resourceId === target.resourceId;
    case "RESOURCE_TYPE":
      return !!hold.resourceType && hold.resourceType === target.resourceType;
    case "PROCESSING_ACTIVITY":
      return !!hold.processingActivityId && hold.processingActivityId === target.processingActivityId;
    case "INCIDENT":
      return !!hold.incidentId && hold.incidentId === target.incidentId;
    case "DATE_RANGE": {
      if (!target.timestamp) return false;
      const t = target.timestamp.getTime();
      const afterStart = !hold.rangeStart || t >= hold.rangeStart.getTime();
      const beforeEnd = !hold.rangeEnd || t <= hold.rangeEnd.getTime();
      return afterStart && beforeEnd;
    }
    default:
      return false;
  }
}

export function isUnderLegalHold(target: HoldTarget, holds: HoldLike[]): boolean {
  return holds.some((h) => holdCovers(h, target));
}

// ── Retention policy classification ───────────────────────────────────────────

export type RetentionPolicyStatus = "CONFIGURED" | "CONFIGURATION_REQUIRED";

export interface RetentionPolicyLike {
  action:        string;
  retentionDays: number | null;
  approvalState: string;
  enabled?:      boolean;
  dryRunOnly?:   boolean;
}

export interface RetentionPolicyClassification {
  status:  RetentionPolicyStatus;
  reasons: string[];
}

/** A policy is CONFIGURED only when approved, day-valued and non-REVIEW action. */
export function classifyRetentionPolicy(policy: RetentionPolicyLike): RetentionPolicyClassification {
  const reasons: string[] = [];
  if (policy.approvalState !== "APPROVED") reasons.push("approval");
  if (policy.retentionDays === null || policy.retentionDays === undefined || policy.retentionDays <= 0) reasons.push("duration");
  if (policy.action === "REVIEW_REQUIRED") reasons.push("action");
  return { status: reasons.length === 0 ? "CONFIGURED" : "CONFIGURATION_REQUIRED", reasons };
}

// ── Eligibility (dry-run, hold-aware) ─────────────────────────────────────────

export type RetentionDecision =
  | "LEGAL_HOLD"
  | "CONFIGURATION_REQUIRED"
  | "NO_AUTOMATED_ACTION"
  | "RETENTION_REQUIRED"
  | "ELIGIBLE";

export interface RetentionEvaluation {
  decision: RetentionDecision;
  action:   string;
  dueAt:    Date | null;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Evaluate a single record against a policy. NEVER executes anything — returns a
 * plan. A DELETE/ANONYMISE policy on a record under an ACTIVE hold ALWAYS returns
 * LEGAL_HOLD (short-circuit), so a held record is never eligible for destruction.
 * ARCHIVE is not blocked by a hold (it preserves the data).
 */
export function evaluateRetentionEligibility(
  policy: RetentionPolicyLike,
  record: { triggerAt: Date; target: HoldTarget },
  holds: HoldLike[],
  now: Date,
): RetentionEvaluation {
  const destructive = policy.action === "DELETE" || policy.action === "ANONYMISE";

  if (destructive && isUnderLegalHold(record.target, holds)) {
    return { decision: "LEGAL_HOLD", action: policy.action, dueAt: null };
  }

  const cfg = classifyRetentionPolicy(policy);
  if (cfg.status === "CONFIGURATION_REQUIRED") {
    return { decision: "CONFIGURATION_REQUIRED", action: policy.action, dueAt: null };
  }
  if (policy.action === "NO_AUTOMATED_ACTION") {
    return { decision: "NO_AUTOMATED_ACTION", action: policy.action, dueAt: null };
  }

  const dueAt = addDays(record.triggerAt, policy.retentionDays as number);
  if (now.getTime() < dueAt.getTime()) {
    return { decision: "RETENTION_REQUIRED", action: policy.action, dueAt };
  }
  return { decision: "ELIGIBLE", action: policy.action, dueAt };
}

export interface RetentionDryRunReport {
  policyConfigured: boolean;
  enabled:          boolean;
  dryRun:           boolean;
  total:            number;
  counts:           Record<RetentionDecision, number>;
}

/**
 * Build an aggregate DRY-RUN report over a set of records. Purely descriptive —
 * this never mutates or deletes. `dryRun` is always true here: this slice ships
 * planning only, no execution adapter.
 */
export function buildRetentionDryRunReport(
  policy: RetentionPolicyLike,
  records: Array<{ triggerAt: Date; target: HoldTarget }>,
  holds: HoldLike[],
  now: Date,
): RetentionDryRunReport {
  const counts: Record<RetentionDecision, number> = {
    LEGAL_HOLD: 0, CONFIGURATION_REQUIRED: 0, NO_AUTOMATED_ACTION: 0, RETENTION_REQUIRED: 0, ELIGIBLE: 0,
  };
  for (const rec of records) {
    counts[evaluateRetentionEligibility(policy, rec, holds, now).decision] += 1;
  }
  return {
    policyConfigured: classifyRetentionPolicy(policy).status === "CONFIGURED",
    enabled:          policy.enabled === true,
    dryRun:           true,
    total:            records.length,
    counts,
  };
}

/**
 * Whether destructive retention EXECUTION is enabled. Defaults to FALSE and must
 * be explicitly turned on. This slice ships no execution path; the flag exists so
 * a later slice's executor is disabled-by-default and fail-closed.
 */
export function isRetentionExecutionEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.COMPLIANCE_RETENTION_EXECUTION_ENABLED === "true";
}
