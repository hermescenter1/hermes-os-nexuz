import { describe, it, expect } from "vitest";
import { mapStripeEventToDomain, HANDLED_STRIPE_EVENT_TYPES } from "../stripe-event-mapper";

describe("stripe event mapper", () => {
  it("maps subscription status strings to domain events", () => {
    expect(mapStripeEventToDomain({ type: "customer.subscription.updated", subscriptionStatus: "active" })).toBe("ACTIVATE");
    expect(mapStripeEventToDomain({ type: "customer.subscription.created", subscriptionStatus: "trialing" })).toBe("START_TRIAL");
    expect(mapStripeEventToDomain({ type: "customer.subscription.updated", subscriptionStatus: "past_due" })).toBe("PAYMENT_PAST_DUE");
    expect(mapStripeEventToDomain({ type: "customer.subscription.updated", subscriptionStatus: "unpaid" })).toBe("PAYMENT_FAILED");
    expect(mapStripeEventToDomain({ type: "customer.subscription.updated", subscriptionStatus: "incomplete_expired" })).toBe("EXPIRE");
  });

  it("maps cancel_at_period_end to a scheduled cancellation", () => {
    expect(
      mapStripeEventToDomain({ type: "customer.subscription.updated", subscriptionStatus: "active", cancelAtPeriodEnd: true }),
    ).toBe("SCHEDULE_CANCELLATION");
  });

  it("maps invoice payment events", () => {
    expect(mapStripeEventToDomain({ type: "invoice.payment_succeeded" })).toBe("ACTIVATE");
    expect(mapStripeEventToDomain({ type: "invoice.payment_failed" })).toBe("PAYMENT_FAILED");
  });

  it("maps deletion to an immediate cancel event", () => {
    expect(mapStripeEventToDomain({ type: "customer.subscription.deleted", subscriptionStatus: "canceled" })).toBe("CANCEL_IMMEDIATELY");
  });

  it("returns null for informational / unknown events (no mutation)", () => {
    expect(mapStripeEventToDomain({ type: "customer.subscription.trial_will_end" })).toBeNull();
    expect(mapStripeEventToDomain({ type: "invoice.upcoming" })).toBeNull();
    expect(mapStripeEventToDomain({ type: "charge.dispute.created" })).toBeNull();
    expect(mapStripeEventToDomain({ type: "customer.subscription.updated", subscriptionStatus: "incomplete" })).toBeNull();
    expect(mapStripeEventToDomain({ type: "customer.subscription.updated", subscriptionStatus: null })).toBeNull();
  });

  it("declares its handled event types", () => {
    expect(HANDLED_STRIPE_EVENT_TYPES.has("invoice.payment_succeeded")).toBe(true);
    expect(HANDLED_STRIPE_EVENT_TYPES.has("charge.dispute.created")).toBe(false);
  });
});
