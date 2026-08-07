/**
 * Phase 97 — PrivacyRequest lifecycle (Part B).
 *
 * Pure, deterministic state machine and deadline-policy logic. No I/O. The
 * transition map is CLOSED — a transition not explicitly listed is rejected, so
 * an arbitrary status string can never be written. Deadline clocks are
 * configuration-driven and fail closed: with no owner-configured policy the
 * status is CONFIGURATION_REQUIRED and NO statutory duration is invented.
 */

import type { PrivacyRequestStatus } from "./types";

/**
 * Allowed status transitions. PENDING is the legacy initial state and is treated
 * as interchangeable with RECEIVED. Terminal states (COMPLETED, REJECTED,
 * CANCELLED) have no outgoing transitions. Self-transitions are not allowed.
 */
export const PRIVACY_REQUEST_TRANSITIONS: Record<PrivacyRequestStatus, PrivacyRequestStatus[]> = {
  PENDING:  ["IDENTITY_VERIFICATION_REQUIRED", "VERIFIED", "TRIAGED", "IN_REVIEW", "REJECTED", "CANCELLED"],
  RECEIVED: ["IDENTITY_VERIFICATION_REQUIRED", "VERIFIED", "TRIAGED", "IN_REVIEW", "REJECTED", "CANCELLED"],
  IDENTITY_VERIFICATION_REQUIRED: ["VERIFIED", "REJECTED", "CANCELLED"],
  VERIFIED: ["TRIAGED", "IN_REVIEW", "CANCELLED"],
  TRIAGED:  ["IN_REVIEW", "DATA_COLLECTION", "LEGAL_REVIEW_REQUIRED", "REJECTED", "CANCELLED"],
  IN_REVIEW: ["DATA_COLLECTION", "LEGAL_REVIEW_REQUIRED", "APPROVED", "PARTIALLY_APPROVED", "REJECTED", "CANCELLED"],
  DATA_COLLECTION: ["IN_REVIEW", "LEGAL_REVIEW_REQUIRED", "APPROVED", "PARTIALLY_APPROVED", "CANCELLED"],
  LEGAL_REVIEW_REQUIRED: ["IN_REVIEW", "APPROVED", "PARTIALLY_APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["FULFILMENT_IN_PROGRESS", "CANCELLED"],
  PARTIALLY_APPROVED: ["FULFILMENT_IN_PROGRESS", "CANCELLED"],
  FULFILMENT_IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  REJECTED:  [],
  CANCELLED: [],
};

export const ALL_PRIVACY_REQUEST_STATUSES = Object.keys(
  PRIVACY_REQUEST_TRANSITIONS,
) as PrivacyRequestStatus[];

export const TERMINAL_PRIVACY_STATUSES: PrivacyRequestStatus[] = ["COMPLETED", "REJECTED", "CANCELLED"];

export function isTerminalPrivacyStatus(s: PrivacyRequestStatus): boolean {
  return TERMINAL_PRIVACY_STATUSES.includes(s);
}

/** True only if the closed transition map explicitly allows from → to. */
export function canTransitionPrivacyRequest(
  from: PrivacyRequestStatus,
  to: PrivacyRequestStatus,
): boolean {
  if (from === to) return false;
  const allowed = PRIVACY_REQUEST_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

// ── Deadline policy (configuration-driven, fail-closed) ───────────────────────

export type DeadlinePolicyStatus = "CONFIGURED" | "CONFIGURATION_REQUIRED";

export interface DeadlinePolicyConfig {
  acknowledgementDays?:     number;
  identityVerificationDays?: number;
  responseDays?:            number;
  extensionDays?:           number;
}

export interface ResolvedDeadlines {
  status:                    DeadlinePolicyStatus;
  acknowledgementDueAt:      Date | null;
  identityVerificationDueAt: Date | null;
  responseDueAt:             Date | null;
  extensionDueAt:            Date | null;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function positiveInt(v: number | undefined): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}

/**
 * Resolve the policy clocks for a request received at `receivedAt`. The
 * `responseDays` clock is the REQUIRED configuration — without it the whole
 * policy is CONFIGURATION_REQUIRED and every due date is null. No default
 * statutory duration (e.g. "30 days") is ever assumed.
 */
export function resolvePrivacyDeadlines(
  config: DeadlinePolicyConfig | null | undefined,
  receivedAt: Date,
): ResolvedDeadlines {
  const responseDays = positiveInt(config?.responseDays);
  if (!config || responseDays === null) {
    return {
      status: "CONFIGURATION_REQUIRED",
      acknowledgementDueAt: null,
      identityVerificationDueAt: null,
      responseDueAt: null,
      extensionDueAt: null,
    };
  }
  const ackDays = positiveInt(config.acknowledgementDays);
  const idvDays = positiveInt(config.identityVerificationDays);
  const extDays = positiveInt(config.extensionDays);
  return {
    status: "CONFIGURED",
    acknowledgementDueAt:      ackDays !== null ? addDays(receivedAt, ackDays) : null,
    identityVerificationDueAt: idvDays !== null ? addDays(receivedAt, idvDays) : null,
    responseDueAt:             addDays(receivedAt, responseDays),
    extensionDueAt:            extDays !== null ? addDays(receivedAt, responseDays + extDays) : null,
  };
}

/**
 * Read the deadline policy from the environment. Every field is optional and
 * parsed strictly; an unset or non-numeric value is treated as absent. This is
 * the only place environment access happens — the resolver above stays pure.
 */
export function readPrivacyDeadlinePolicyConfig(
  env: Record<string, string | undefined> = process.env,
): DeadlinePolicyConfig {
  const num = (raw: string | undefined): number | undefined => {
    if (raw === undefined) return undefined;
    const n = Number(raw.trim());
    return Number.isInteger(n) && n > 0 ? n : undefined;
  };
  return {
    acknowledgementDays:      num(env.COMPLIANCE_PRIVACY_ACK_DAYS),
    identityVerificationDays: num(env.COMPLIANCE_PRIVACY_IDV_DAYS),
    responseDays:             num(env.COMPLIANCE_PRIVACY_RESPONSE_DAYS),
    extensionDays:            num(env.COMPLIANCE_PRIVACY_EXTENSION_DAYS),
  };
}
