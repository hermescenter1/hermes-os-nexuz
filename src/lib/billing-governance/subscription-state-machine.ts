// PHASE 96 — deterministic subscription state machine.
//
// Pure, testable transition logic over the domain lifecycle. Provider (Stripe)
// status strings NEVER become authoritative database states directly — they are
// mapped to internal domain EVENTS (stripe-event-mapper.ts) and reduced here.
// An old or duplicate provider event must never overwrite a newer state; that
// out-of-order protection lives in `applyProviderEvent`.

import type { DomainSubscriptionStatus } from "./types";

/** Internal domain events. Provider payloads are mapped to these; the reducer
 *  never sees a raw Stripe status. */
export type SubscriptionEvent =
  | "START_TRIAL"
  | "ACTIVATE" // payment confirmed / (re)activation after valid payment
  | "PAYMENT_PAST_DUE"
  | "PAYMENT_FAILED"
  | "ENTER_GRACE"
  | "SUSPEND"
  | "SCHEDULE_CANCELLATION" // cancel at current-period end
  | "RESUME" // undo a scheduled cancellation
  | "CANCEL_IMMEDIATELY" // Billing-Admin-only privileged path
  | "PERIOD_ENDED"
  | "EXPIRE";

/** States with no outgoing transitions. */
export const TERMINAL_STATES: ReadonlySet<DomainSubscriptionStatus> = new Set(["EXPIRED"]);

/**
 * The explicit transition table: current state → event → next state.
 * Any (state, event) pair NOT present is an INVALID transition and is rejected
 * (the current state is preserved). "NONE" is the absence of a subscription and
 * is not a machine state here.
 */
const TRANSITIONS: Readonly<
  Partial<Record<DomainSubscriptionStatus, Partial<Record<SubscriptionEvent, DomainSubscriptionStatus>>>>
> = Object.freeze({
  INCOMPLETE: {
    START_TRIAL: "TRIALING",
    ACTIVATE: "ACTIVE",
    CANCEL_IMMEDIATELY: "CANCELED",
    EXPIRE: "EXPIRED",
  },
  TRIALING: {
    ACTIVATE: "ACTIVE",
    SCHEDULE_CANCELLATION: "CANCEL_AT_PERIOD_END",
    CANCEL_IMMEDIATELY: "CANCELED",
    PAYMENT_PAST_DUE: "PAST_DUE",
    PERIOD_ENDED: "EXPIRED", // trial ended without conversion
    EXPIRE: "EXPIRED",
  },
  ACTIVE: {
    PAYMENT_PAST_DUE: "PAST_DUE",
    PAYMENT_FAILED: "PAYMENT_FAILED",
    SCHEDULE_CANCELLATION: "CANCEL_AT_PERIOD_END",
    CANCEL_IMMEDIATELY: "CANCELED",
  },
  PAST_DUE: {
    ACTIVATE: "ACTIVE",
    PAYMENT_FAILED: "PAYMENT_FAILED",
    ENTER_GRACE: "GRACE_PERIOD",
    SUSPEND: "SUSPENDED",
    CANCEL_IMMEDIATELY: "CANCELED",
  },
  PAYMENT_FAILED: {
    ACTIVATE: "ACTIVE",
    ENTER_GRACE: "GRACE_PERIOD",
    SUSPEND: "SUSPENDED",
    CANCEL_IMMEDIATELY: "CANCELED",
  },
  GRACE_PERIOD: {
    ACTIVATE: "ACTIVE",
    SUSPEND: "SUSPENDED",
    CANCEL_IMMEDIATELY: "CANCELED",
  },
  SUSPENDED: {
    ACTIVATE: "ACTIVE", // reactivation after a valid payment event
    CANCEL_IMMEDIATELY: "CANCELED",
    EXPIRE: "EXPIRED",
  },
  CANCEL_AT_PERIOD_END: {
    RESUME: "ACTIVE",
    ACTIVATE: "ACTIVE",
    PERIOD_ENDED: "CANCELED",
    CANCEL_IMMEDIATELY: "CANCELED",
  },
  CANCELED: {
    EXPIRE: "EXPIRED",
  },
  EXPIRED: {},
});

/** The next state for a (state, event), or null when the transition is invalid. */
export function nextState(from: DomainSubscriptionStatus, event: SubscriptionEvent): DomainSubscriptionStatus | null {
  const row = TRANSITIONS[from];
  if (!row) return null;
  return row[event] ?? null;
}

/** Whether a direct state→state move is reachable by SOME event. Used by tests
 *  and defensive checks; the reducer uses events, not raw target states. */
export function isValidTransition(from: DomainSubscriptionStatus, to: DomainSubscriptionStatus): boolean {
  const row = TRANSITIONS[from];
  if (!row) return false;
  return Object.values(row).includes(to);
}

/* ── Out-of-order / idempotency protection ───────────────────────────────── */

export interface SubscriptionStateSnapshot {
  status: DomainSubscriptionStatus;
  /** Monotonic local counter; bumped on every applied transition. */
  stateVersion: number;
  /** Provider ordering info from the last applied event (nullable for legacy). */
  lastProviderEventCreatedAt: Date | null;
  lastProviderEventId: string | null;
}

export interface ProviderEventEnvelope {
  event: SubscriptionEvent;
  providerEventId: string;
  providerCreatedAt: Date;
}

export type ApplyOutcome =
  | { applied: true; next: SubscriptionStateSnapshot }
  | { applied: false; reason: "DUPLICATE" | "OUT_OF_ORDER" | "INVALID_TRANSITION" | "TERMINAL"; current: SubscriptionStateSnapshot };

/**
 * Apply a provider-originated event with idempotency + out-of-order protection.
 *
 * Rejects when:
 *   - the same providerEventId was already applied (DUPLICATE);
 *   - the event is strictly older than the last applied one (OUT_OF_ORDER);
 *   - the transition is not allowed from the current state (INVALID_TRANSITION);
 *   - the current state is terminal (TERMINAL).
 *
 * A duplicate/out-of-order/invalid event NEVER mutates state.
 */
export function applyProviderEvent(
  current: SubscriptionStateSnapshot,
  envelope: ProviderEventEnvelope,
): ApplyOutcome {
  if (TERMINAL_STATES.has(current.status)) {
    return { applied: false, reason: "TERMINAL", current };
  }
  // Idempotency: exact same provider event id.
  if (current.lastProviderEventId !== null && current.lastProviderEventId === envelope.providerEventId) {
    return { applied: false, reason: "DUPLICATE", current };
  }
  // Out-of-order: a strictly older provider timestamp must not overwrite.
  if (
    current.lastProviderEventCreatedAt !== null &&
    envelope.providerCreatedAt.getTime() < current.lastProviderEventCreatedAt.getTime()
  ) {
    return { applied: false, reason: "OUT_OF_ORDER", current };
  }
  const target = nextState(current.status, envelope.event);
  if (target === null) {
    return { applied: false, reason: "INVALID_TRANSITION", current };
  }
  return {
    applied: true,
    next: {
      status: target,
      stateVersion: current.stateVersion + 1,
      lastProviderEventCreatedAt: envelope.providerCreatedAt,
      lastProviderEventId: envelope.providerEventId,
    },
  };
}
