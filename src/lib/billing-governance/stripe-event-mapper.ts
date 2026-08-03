// PHASE 96 — Stripe → internal domain event mapper.
//
// Stripe status strings are NOT authoritative. This pure mapper translates a
// (verified) Stripe event into an internal SubscriptionEvent that the state
// machine reduces. Unknown / informational events map to null → NO state
// mutation. It reads only the minimal envelope fields; it never returns a raw
// provider payload.

import type { SubscriptionEvent } from "./subscription-state-machine";

/** Minimal, already-extracted view of a verified Stripe event. The caller pulls
 *  these fields from the signed payload; nothing else is trusted. */
export interface StripeEventView {
  type: string;
  /** Stripe subscription.status when present on the object. */
  subscriptionStatus?: string | null;
  /** Stripe subscription.cancel_at_period_end when present. */
  cancelAtPeriodEnd?: boolean | null;
}

/** Map a Stripe subscription status string to the domain event that expresses
 *  its intent. Unknown → null. */
function eventForSubscriptionStatus(status: string, cancelAtPeriodEnd: boolean): SubscriptionEvent | null {
  if (cancelAtPeriodEnd && (status === "active" || status === "trialing")) {
    return "SCHEDULE_CANCELLATION";
  }
  switch (status) {
    case "trialing":
      return "START_TRIAL";
    case "active":
      return "ACTIVATE";
    case "past_due":
      return "PAYMENT_PAST_DUE";
    case "unpaid":
      return "PAYMENT_FAILED";
    case "paused":
      return "SUSPEND";
    case "canceled":
      return "CANCEL_IMMEDIATELY";
    case "incomplete_expired":
      return "EXPIRE";
    case "incomplete":
      return null; // remains INCOMPLETE — no transition
    default:
      return null; // unknown status → ignore
  }
}

/**
 * Translate a verified Stripe event into a domain event, or null when it should
 * not mutate subscription state (unknown / informational / ambiguous).
 */
export function mapStripeEventToDomain(view: StripeEventView): SubscriptionEvent | null {
  const cancelAtPeriodEnd = view.cancelAtPeriodEnd === true;
  switch (view.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.resumed": {
      if (typeof view.subscriptionStatus !== "string") return null;
      return eventForSubscriptionStatus(view.subscriptionStatus, cancelAtPeriodEnd);
    }
    case "customer.subscription.paused":
      return "SUSPEND";
    case "customer.subscription.deleted":
      // Stripe reports the subscription ended. Reducer decides whether this lands
      // as CANCELED (from a scheduled cancellation) or a hard cancel.
      return "CANCEL_IMMEDIATELY";
    case "invoice.payment_succeeded":
    case "invoice.paid":
      return "ACTIVATE";
    case "invoice.payment_failed":
      return "PAYMENT_FAILED";
    // Informational — never mutate state.
    case "customer.subscription.trial_will_end":
    case "invoice.upcoming":
    case "invoice.created":
    case "invoice.finalized":
      return null;
    default:
      return null; // unknown event type → safely ignored
  }
}

/** The set of Stripe event types this mapper acts on (for the webhook to record
 *  "known but no-op" vs "acted"). */
export const HANDLED_STRIPE_EVENT_TYPES: ReadonlySet<string> = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.resumed",
  "customer.subscription.paused",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.paid",
  "invoice.payment_failed",
]);
