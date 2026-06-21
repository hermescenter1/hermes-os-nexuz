/**
 * Auth endpoint rate limiter (Phase 45).
 *
 * Redis-backed fixed-window rate limiter that mirrors the Phase 33 API
 * platform limiter pattern. Falls back to in-process sliding-window when
 * Redis is unavailable (node restart resets counts; not multi-instance safe).
 *
 * Failure behaviour:
 *   - Redis unavailable → in-process fallback activates automatically
 *   - Readiness score decreases (isAuthLimiterDegraded() = true)
 *   - Throttled WARNING is logged (once per 60 s)
 *   - Authentication continues — startup does NOT fail
 */

import { getRedis }    from "@/lib/redis/client";
import { logger }      from "@/lib/logger";
import { recordAuditEvent, INFRA_AUDIT } from "@/lib/audit/audit-service";

// ── Limits ────────────────────────────────────────────────────────────────────

const LIMITS: Record<string, { max: number; windowMs: number }> = {
  login:             { max: 10, windowMs: 15 * 60 * 1000 },
  register:          { max: 5,  windowMs: 60 * 60 * 1000 },
  "forgot-password": { max: 3,  windowMs: 60 * 60 * 1000 },
  "reset-password":  { max: 5,  windowMs: 60 * 60 * 1000 },
  "verify-email":    { max: 10, windowMs: 60 * 60 * 1000 },
};

// ── Degradation state ─────────────────────────────────────────────────────────

let _degraded        = false;
let _lastWarnAt      = 0;
const WARN_THROTTLE  = 60_000; // log at most once per minute

export function isAuthLimiterDegraded(): boolean {
  return _degraded;
}

function signalDegraded(reason: string): void {
  _degraded = true;
  const now = Date.now();
  if (now - _lastWarnAt >= WARN_THROTTLE) {
    _lastWarnAt = now;
    logger.warn("[auth-rate-limiter] Redis unavailable — in-process fallback active.", { reason });
    // Fire-and-forget — never blocks the request path
    void recordAuditEvent({
      action:     INFRA_AUDIT.RATE_LIMITER_DEGRADED,
      entityType: "rate_limiter",
      metadata:   { limiter: "auth", reason },
    });
  }
}

// ── Redis fixed-window helpers ────────────────────────────────────────────────

function redisKey(action: string, identifier: string, windowMs: number): string {
  const windowId = Math.floor(Date.now() / windowMs);
  return `rl:auth:${action}:${identifier}:${windowId}`;
}

async function redisIncr(key: string, windowMs: number): Promise<number | null> {
  try {
    const redis = await getRedis();
    if (!redis) return null;

    const pipeline = redis.pipeline();
    pipeline.incr(key);
    pipeline.pexpire(key, windowMs);
    const results = await pipeline.exec();
    if (!results) return null;

    const [incrErr, count] = results[0] as [Error | null, number];
    if (incrErr) return null;
    return count;
  } catch (e) {
    signalDegraded(String(e));
    return null;
  }
}

async function redisGet(key: string): Promise<number | null> {
  try {
    const redis = await getRedis();
    if (!redis) return null;
    const val = await redis.get(key);
    return val ? parseInt(val, 10) : 0;
  } catch (e) {
    signalDegraded(String(e));
    return null;
  }
}

// ── In-process fallback (sliding window) ─────────────────────────────────────

interface SlidingWindow {
  timestamps: number[];
}
const _store = new Map<string, SlidingWindow>();

function memKey(action: string, identifier: string): string {
  return `${action}:${identifier}`;
}

function memCheck(action: string, identifier: string): boolean {
  const limit = LIMITS[action];
  if (!limit) return true;

  const key = memKey(action, identifier);
  const now  = Date.now();
  const win  = _store.get(key) ?? { timestamps: [] };

  win.timestamps = win.timestamps.filter((t) => now - t < limit.windowMs);

  if (win.timestamps.length >= limit.max) {
    _store.set(key, win);
    return false;
  }
  win.timestamps.push(now);
  _store.set(key, win);
  return true;
}

function memRemaining(action: string, identifier: string): number {
  const limit = LIMITS[action];
  if (!limit) return 999;

  const key  = memKey(action, identifier);
  const now  = Date.now();
  const win  = _store.get(key);
  if (!win) return limit.max;

  const active = win.timestamps.filter((t) => now - t < limit.windowMs).length;
  return Math.max(0, limit.max - active);
}

function memRetryAfter(action: string, identifier: string): number {
  const limit = LIMITS[action];
  if (!limit) return 0;

  const key  = memKey(action, identifier);
  const win  = _store.get(key);
  if (!win || win.timestamps.length === 0) return 0;

  const now    = Date.now();
  const oldest = win.timestamps[0];
  return Math.max(0, Math.ceil((oldest + limit.windowMs - now) / 1000));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check and record a rate-limit hit.
 * @returns true = allowed, false = blocked.
 */
export async function checkRateLimit(
  action:     string,
  identifier: string,
): Promise<boolean> {
  const limit = LIMITS[action];
  if (!limit) return true;

  const key   = redisKey(action, identifier, limit.windowMs);
  const count = await redisIncr(key, limit.windowMs);

  if (count === null) {
    // Redis unavailable — in-process fallback
    signalDegraded("INCR returned null");
    return memCheck(action, identifier);
  }

  _degraded = false; // Redis is back
  return count <= limit.max;
}

/** Remaining attempts for an action / identifier pair. */
export async function remainingAttempts(
  action:     string,
  identifier: string,
): Promise<number> {
  const limit = LIMITS[action];
  if (!limit) return 999;

  const key   = redisKey(action, identifier, limit.windowMs);
  const count = await redisGet(key);

  if (count === null) return memRemaining(action, identifier);
  return Math.max(0, limit.max - count);
}

/** Seconds until the current window resets. */
export function retryAfter(action: string, identifier: string): number {
  const limit = LIMITS[action];
  if (!limit) return 0;

  const windowMs = limit.windowMs;
  const windowId = Math.floor(Date.now() / windowMs);
  const resetAt  = (windowId + 1) * windowMs;
  return Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
}
