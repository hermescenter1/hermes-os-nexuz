/**
 * PHASE 103 — single-use consumption of a speech grant.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 * This is DEFENCE IN DEPTH, not the security boundary. The boundary is the grant
 * itself (`grant.ts`): a replay can only ever re-request the SAME text, for the
 * SAME user, in the SAME organisation, within a 60-second window, through a
 * route that already required a session, an origin, membership, a permission, an
 * entitlement and a rate-limit budget. The only thing a replay can achieve is
 * spending that user's own quota twice, which the rate-limit bucket already
 * bounds.
 *
 * Given that, this store consumes each nonce ONCE, so an intercepted grant
 * cannot be re-submitted at all. It follows the repository's established
 * limiter pattern: Redis when available (correct across instances), an
 * in-process map otherwise.
 *
 * THE DEGRADATION IS STATED, NOT HIDDEN
 * Without Redis, single use is guaranteed PER INSTANCE. A multi-instance
 * deployment with Redis down could accept the same grant once per instance
 * inside its 60-second lifetime. That is written here, and in
 * docs/phase103/live-voice-intelligence.md, rather than being claimed as
 * stronger than it is. It is not escalated to a hard denial because Redis being
 * unavailable already degrades the rate limiter the same way, and refusing all
 * playback on a cache outage would be a worse trade for an operator-facing
 * read-only surface.
 */

import { getRedis } from "@/lib/redis/client";

import { VOICE_GRANT_TTL_SECONDS } from "./contract";

/** Namespaced so a nonce can never collide with another subsystem's key. */
function redisKey(nonce: string): string {
  return `voice:grant:${nonce}`;
}

/** In-process fallback: nonce → expiry in epoch milliseconds. */
const memoryStore = new Map<string, number>();

function memoryConsume(nonce: string, nowMs: number): boolean {
  // Opportunistic sweep. The map only ever holds nonces from the last 60
  // seconds, so this stays small without a timer holding the process open.
  for (const [key, expiry] of memoryStore) {
    if (expiry <= nowMs) memoryStore.delete(key);
  }
  if (memoryStore.has(nonce)) return false;
  memoryStore.set(nonce, nowMs + VOICE_GRANT_TTL_SECONDS * 1000);
  return true;
}

/**
 * Claim a grant nonce. `true` = first use, `false` = already consumed.
 *
 * Redis `SET key value NX PX ttl` is atomic, so two concurrent requests carrying
 * the same nonce cannot both win. Any Redis error falls through to the
 * in-process store rather than failing the request.
 */
export async function consumeGrantNonce(nonce: string, now: Date = new Date()): Promise<boolean> {
  const nowMs = now.getTime();
  try {
    const redis = await getRedis();
    if (redis) {
      const result = await redis.set(redisKey(nonce), "1", "PX", VOICE_GRANT_TTL_SECONDS * 1000, "NX");
      return result === "OK";
    }
  } catch {
    /* Redis unavailable — fall through to the in-process store. */
  }
  return memoryConsume(nonce, nowMs);
}

/** Test-only reset of the in-process store, so suites cannot leak into each other. */
export function resetGrantConsumptionForTests(): void {
  memoryStore.clear();
}
