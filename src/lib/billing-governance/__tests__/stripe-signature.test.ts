import { describe, it, expect } from "vitest";
import Stripe from "stripe";

// Offline Stripe signature verification proof. Uses the SDK's own test-header
// generator with a TEST-ONLY signing secret. No network, no real key, no real
// event — exactly the synthetic-fixture contract required by Phase 96.

const TEST_WEBHOOK_SECRET = "whsec_phase96_test_only_secret_do_not_use_in_prod";
const stripe = new Stripe("sk_test_offline_dummy_key", { apiVersion: "2025-01-27.acacia" as never });

const PAYLOAD = JSON.stringify({
  id: "evt_test_1",
  object: "event",
  type: "customer.subscription.updated",
  created: 1_700_000_000,
  data: { object: { id: "sub_test_1", status: "active" } },
});

describe("stripe webhook signature (offline)", () => {
  it("accepts a correctly signed payload", () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload: PAYLOAD, secret: TEST_WEBHOOK_SECRET });
    const event = stripe.webhooks.constructEvent(PAYLOAD, header, TEST_WEBHOOK_SECRET);
    expect(event.id).toBe("evt_test_1");
    expect(event.type).toBe("customer.subscription.updated");
  });

  it("rejects a wrong signing secret", () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload: PAYLOAD, secret: TEST_WEBHOOK_SECRET });
    expect(() => stripe.webhooks.constructEvent(PAYLOAD, header, "whsec_wrong_secret")).toThrow();
  });

  it("rejects a tampered payload (same signature)", () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload: PAYLOAD, secret: TEST_WEBHOOK_SECRET });
    const tampered = PAYLOAD.replace("sub_test_1", "sub_attacker");
    expect(() => stripe.webhooks.constructEvent(tampered, header, TEST_WEBHOOK_SECRET)).toThrow();
  });

  it("rejects a timestamp outside tolerance", () => {
    const oldTs = Math.floor(new Date("2020-01-01T00:00:00.000Z").getTime() / 1000);
    const header = stripe.webhooks.generateTestHeaderString({ payload: PAYLOAD, secret: TEST_WEBHOOK_SECRET, timestamp: oldTs });
    // 300s tolerance — a 2020 timestamp is far outside it.
    expect(() => stripe.webhooks.constructEvent(PAYLOAD, header, TEST_WEBHOOK_SECRET, 300)).toThrow();
  });

  it("rejects a missing signature header", () => {
    expect(() => stripe.webhooks.constructEvent(PAYLOAD, "", TEST_WEBHOOK_SECRET)).toThrow();
  });
});
