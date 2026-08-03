import { describe, it, expect } from "vitest";
import {
  applyProviderEvent,
  isValidTransition,
  nextState,
  type ProviderEventEnvelope,
  type SubscriptionStateSnapshot,
} from "../subscription-state-machine";

const T0 = new Date("2026-08-01T00:00:00.000Z");
const T1 = new Date("2026-08-02T00:00:00.000Z");
const T2 = new Date("2026-08-03T00:00:00.000Z");

function snap(partial: Partial<SubscriptionStateSnapshot>): SubscriptionStateSnapshot {
  return {
    status: partial.status ?? "ACTIVE",
    stateVersion: partial.stateVersion ?? 1,
    lastProviderEventCreatedAt: partial.lastProviderEventCreatedAt ?? T0,
    lastProviderEventId: partial.lastProviderEventId ?? "evt_0",
  };
}

function env(partial: Partial<ProviderEventEnvelope>): ProviderEventEnvelope {
  return {
    event: partial.event ?? "ACTIVATE",
    providerEventId: partial.providerEventId ?? "evt_1",
    providerCreatedAt: partial.providerCreatedAt ?? T1,
  };
}

describe("transition table", () => {
  it("allows the documented lifecycle transitions", () => {
    expect(nextState("INCOMPLETE", "START_TRIAL")).toBe("TRIALING");
    expect(nextState("INCOMPLETE", "ACTIVATE")).toBe("ACTIVE");
    expect(nextState("TRIALING", "ACTIVATE")).toBe("ACTIVE");
    expect(nextState("TRIALING", "PERIOD_ENDED")).toBe("EXPIRED");
    expect(nextState("ACTIVE", "PAYMENT_PAST_DUE")).toBe("PAST_DUE");
    expect(nextState("PAST_DUE", "ENTER_GRACE")).toBe("GRACE_PERIOD");
    expect(nextState("GRACE_PERIOD", "ACTIVATE")).toBe("ACTIVE");
    expect(nextState("GRACE_PERIOD", "SUSPEND")).toBe("SUSPENDED");
    expect(nextState("ACTIVE", "SCHEDULE_CANCELLATION")).toBe("CANCEL_AT_PERIOD_END");
    expect(nextState("CANCEL_AT_PERIOD_END", "RESUME")).toBe("ACTIVE");
    expect(nextState("CANCEL_AT_PERIOD_END", "PERIOD_ENDED")).toBe("CANCELED");
    expect(nextState("CANCELED", "EXPIRE")).toBe("EXPIRED");
    expect(nextState("SUSPENDED", "ACTIVATE")).toBe("ACTIVE"); // reactivation
  });

  it("rejects impossible transitions", () => {
    expect(nextState("EXPIRED", "ACTIVATE")).toBeNull();
    expect(nextState("CANCELED", "ACTIVATE")).toBeNull();
    expect(nextState("ACTIVE", "START_TRIAL")).toBeNull();
    expect(nextState("SUSPENDED", "SCHEDULE_CANCELLATION")).toBeNull();
    expect(isValidTransition("EXPIRED", "ACTIVE")).toBe(false);
    expect(isValidTransition("ACTIVE", "PAST_DUE")).toBe(true);
  });
});

describe("applyProviderEvent — idempotency & ordering", () => {
  it("applies a valid, newer, non-duplicate event and bumps stateVersion", () => {
    const out = applyProviderEvent(snap({ status: "ACTIVE" }), env({ event: "PAYMENT_PAST_DUE", providerEventId: "evt_1", providerCreatedAt: T1 }));
    expect(out.applied).toBe(true);
    if (out.applied) {
      expect(out.next.status).toBe("PAST_DUE");
      expect(out.next.stateVersion).toBe(2);
      expect(out.next.lastProviderEventId).toBe("evt_1");
    }
  });

  it("ignores a duplicate provider event id (no mutation)", () => {
    const out = applyProviderEvent(snap({ status: "ACTIVE", lastProviderEventId: "evt_1" }), env({ providerEventId: "evt_1" }));
    expect(out.applied).toBe(false);
    if (!out.applied) expect(out.reason).toBe("DUPLICATE");
  });

  it("ignores an out-of-order (older) provider event", () => {
    const out = applyProviderEvent(
      snap({ status: "PAST_DUE", lastProviderEventCreatedAt: T2, lastProviderEventId: "evt_new" }),
      env({ event: "ACTIVATE", providerEventId: "evt_old", providerCreatedAt: T1 }),
    );
    expect(out.applied).toBe(false);
    if (!out.applied) expect(out.reason).toBe("OUT_OF_ORDER");
  });

  it("rejects an invalid transition without mutating state", () => {
    const out = applyProviderEvent(snap({ status: "ACTIVE" }), env({ event: "START_TRIAL", providerEventId: "evt_x", providerCreatedAt: T2 }));
    expect(out.applied).toBe(false);
    if (!out.applied) {
      expect(out.reason).toBe("INVALID_TRANSITION");
      expect(out.current.status).toBe("ACTIVE");
    }
  });

  it("never leaves a terminal state", () => {
    const out = applyProviderEvent(snap({ status: "EXPIRED" }), env({ event: "ACTIVATE", providerEventId: "evt_z", providerCreatedAt: T2 }));
    expect(out.applied).toBe(false);
    if (!out.applied) expect(out.reason).toBe("TERMINAL");
  });

  it("a newer event after an older one applies (forward progress)", () => {
    const first = applyProviderEvent(snap({ status: "ACTIVE", lastProviderEventCreatedAt: T0, lastProviderEventId: "evt_0" }), env({ event: "PAYMENT_FAILED", providerEventId: "evt_1", providerCreatedAt: T1 }));
    expect(first.applied).toBe(true);
    if (first.applied) {
      const second = applyProviderEvent(first.next, env({ event: "ENTER_GRACE", providerEventId: "evt_2", providerCreatedAt: T2 }));
      expect(second.applied).toBe(true);
      if (second.applied) expect(second.next.status).toBe("GRACE_PERIOD");
    }
  });
});
