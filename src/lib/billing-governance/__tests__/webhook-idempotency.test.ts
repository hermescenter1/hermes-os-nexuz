import { describe, it, expect } from "vitest";
import {
  hashObjectReference,
  runIdempotentWebhook,
  type WebhookClaimStore,
  type WebhookEnvelope,
} from "../webhook-idempotency";

/** In-memory claim store that emulates the (provider,eventId) unique constraint,
 *  including retry-after-failure semantics. */
function memoryStore() {
  const rows = new Map<string, { status: string; attempts: number }>();
  const key = (p: string, id: string) => `${p}:${id}`;
  const store: WebhookClaimStore = {
    async claim(env: WebhookEnvelope) {
      const k = key(env.provider, env.providerEventId);
      const existing = rows.get(k);
      if (!existing) {
        rows.set(k, { status: "PROCESSING", attempts: 1 });
        return "CLAIMED";
      }
      if (existing.status === "PROCESSED" || existing.status === "IGNORED") return "DUPLICATE";
      if (existing.status === "FAILED") {
        existing.status = "PROCESSING";
        existing.attempts += 1;
        return "CLAIMED";
      }
      return "DUPLICATE"; // PROCESSING / RECEIVED — in-flight
    },
    async markProcessed(p, id) {
      rows.get(key(p, id))!.status = "PROCESSED";
    },
    async markIgnored(p, id) {
      rows.get(key(p, id))!.status = "IGNORED";
    },
    async markFailed(p, id) {
      rows.get(key(p, id))!.status = "FAILED";
    },
  };
  return { store, rows, key };
}

const ENV: WebhookEnvelope = {
  provider: "stripe",
  providerEventId: "evt_1",
  providerCreatedAt: new Date("2026-08-03T00:00:00.000Z"),
  eventType: "customer.subscription.updated",
  objectReferenceHash: null,
};

describe("hashObjectReference", () => {
  it("hashes object ids and passes through null", () => {
    expect(hashObjectReference(null)).toBeNull();
    expect(hashObjectReference("sub_123")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashObjectReference("sub_123")).toBe(hashObjectReference("sub_123")); // deterministic
  });
});

describe("runIdempotentWebhook", () => {
  it("processes a fresh event", async () => {
    const { store, rows, key } = memoryStore();
    const out = await runIdempotentWebhook(store, ENV, async () => "APPLIED");
    expect(out).toBe("PROCESSED");
    expect(rows.get(key("stripe", "evt_1"))!.status).toBe("PROCESSED");
  });

  it("marks IGNORED when the handler is a no-op", async () => {
    const { store, rows, key } = memoryStore();
    const out = await runIdempotentWebhook(store, ENV, async () => "IGNORED");
    expect(out).toBe("IGNORED");
    expect(rows.get(key("stripe", "evt_1"))!.status).toBe("IGNORED");
  });

  it("ignores a duplicate delivery of a processed event", async () => {
    const { store } = memoryStore();
    await runIdempotentWebhook(store, ENV, async () => "APPLIED");
    let ran = false;
    const out = await runIdempotentWebhook(store, ENV, async () => {
      ran = true;
      return "APPLIED";
    });
    expect(out).toBe("DUPLICATE");
    expect(ran).toBe(false); // handler must NOT run again
  });

  it("only one of two simultaneous deliveries processes", async () => {
    const { store } = memoryStore();
    let handlerRuns = 0;
    const handler = async (): Promise<"APPLIED"> => {
      handlerRuns += 1;
      await new Promise((r) => setTimeout(r, 5));
      return "APPLIED";
    };
    const [a, b] = await Promise.all([
      runIdempotentWebhook(store, ENV, handler),
      runIdempotentWebhook(store, ENV, handler),
    ]);
    expect([a, b].filter((x) => x === "PROCESSED")).toHaveLength(1);
    expect([a, b].filter((x) => x === "DUPLICATE")).toHaveLength(1);
    expect(handlerRuns).toBe(1);
  });

  it("marks FAILED on a throw and permits a later retry", async () => {
    const { store, rows, key } = memoryStore();
    const out1 = await runIdempotentWebhook(store, ENV, async () => {
      throw new Error("boom");
    });
    expect(out1).toBe("FAILED");
    expect(rows.get(key("stripe", "evt_1"))!.status).toBe("FAILED");
    // Retry succeeds (re-claim of a FAILED event).
    const out2 = await runIdempotentWebhook(store, ENV, async () => "APPLIED");
    expect(out2).toBe("PROCESSED");
    expect(rows.get(key("stripe", "evt_1"))!.attempts).toBe(2);
  });

  it("does not mark processed when the handler throws (no false success)", async () => {
    const { store, rows, key } = memoryStore();
    await runIdempotentWebhook(store, ENV, async () => {
      throw new Error("x");
    });
    expect(rows.get(key("stripe", "evt_1"))!.status).not.toBe("PROCESSED");
  });
});
