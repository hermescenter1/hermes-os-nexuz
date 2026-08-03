// PHASE 96 — signed webhook idempotency / replay / out-of-order orchestration.
//
// Pure control flow over an injected claim store. Signature verification happens
// in the route (Stripe raw-body HMAC) BEFORE this runs — this layer guarantees
// that a verified event is processed at most once, that duplicates and simultaneous
// deliveries are ignored, and that failures can be retried without double-applying.
//
// It stores/records ONLY the event envelope (type, id, created, an object-id hash)
// — never the raw payload, card data, or a provider secret.

import { createHash } from "node:crypto";

export interface WebhookEnvelope {
  provider: string;
  providerEventId: string;
  providerCreatedAt: Date;
  eventType: string;
  /** SHA-256 of the referenced object id (e.g. subscription/invoice id), or null. */
  objectReferenceHash: string | null;
}

/** Result of attempting to claim an event for processing. */
export type ClaimResult = "CLAIMED" | "DUPLICATE";

export interface WebhookClaimStore {
  /**
   * Atomically claim an event. Returns "CLAIMED" when this caller now owns
   * processing (fresh event, or a retry of a previously FAILED event). Returns
   * "DUPLICATE" when the event was already processed/ignored or is being
   * processed concurrently. Concurrency is resolved by the (provider,
   * providerEventId) unique constraint.
   */
  claim(env: WebhookEnvelope): Promise<ClaimResult>;
  markProcessed(provider: string, providerEventId: string): Promise<void>;
  markIgnored(provider: string, providerEventId: string, code: string): Promise<void>;
  markFailed(provider: string, providerEventId: string, code: string): Promise<void>;
}

export type WebhookOutcome = "PROCESSED" | "DUPLICATE" | "IGNORED" | "FAILED";

/** The handler returns whether it actually applied a state change. */
export type HandlerResult = "APPLIED" | "IGNORED";

/** SHA-256 hex of an object id (or null when absent). Never hashes payload data. */
export function hashObjectReference(objectId: string | null | undefined): string | null {
  if (!objectId) return null;
  return createHash("sha256").update(objectId).digest("hex");
}

/**
 * Run a verified webhook event through the idempotent pipeline. The `handle`
 * callback performs the actual (transactional) state mutation and returns
 * APPLIED / IGNORED. Any throw marks the event FAILED (retryable) and never
 * marks it processed.
 */
export async function runIdempotentWebhook(
  store: WebhookClaimStore,
  env: WebhookEnvelope,
  handle: () => Promise<HandlerResult>,
): Promise<WebhookOutcome> {
  const claim = await store.claim(env);
  if (claim === "DUPLICATE") return "DUPLICATE";

  try {
    const result = await handle();
    if (result === "IGNORED") {
      await store.markIgnored(env.provider, env.providerEventId, "NO_OP");
      return "IGNORED";
    }
    await store.markProcessed(env.provider, env.providerEventId);
    return "PROCESSED";
  } catch {
    // Non-sensitive machine code only; the raw error is logged elsewhere.
    await store.markFailed(env.provider, env.providerEventId, "HANDLER_ERROR");
    return "FAILED";
  }
}
