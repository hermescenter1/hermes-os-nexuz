/**
 * API Platform rate limiter (Phase 33).
 *
 * Algorithm: Fixed window — two independent windows (per-minute, per-day).
 * Chosen for simplicity and predictable Retry-After values. The burst
 * behaviour of fixed window (up to 2× limit at window boundary) is acceptable
 * for the enterprise API platform; switch to sliding window in Phase 35+
 * if tighter burst control is needed.
 *
 * Store: Redis (production) — keys are atomic INCR + EXPIREAT.
 * Fallback: in-memory Map (dev / Redis unavailable) — NOT suitable for
 * multi-instance deployments. Clearly labelled DEV_ONLY below.
 *
 * Rate limits per plan slug (per-minute / per-day):
 *   community:    10  / 100
 *   professional: 100 / 5,000
 *   team:         500 / 50,000
 *   enterprise:   2,000 / 500,000
 *
 * Limits are applied ONLY to API-key-authenticated calls.
 * JWT session calls are never rate-limited here.
 */

import { getRedis }          from "@/lib/redis/client";
import { getPrisma }         from "@/lib/db/prisma";
import { recordAuditEvent, API_AUDIT, INFRA_AUDIT } from "@/lib/audit/audit-service";
import type { RateLimitState }         from "./types";

// ── Plan-tier limits ──────────────────────────────────────────────────────────

const PLAN_LIMITS: Record<string, { perMinute: number; perDay: number }> = {
  community:    { perMinute: 10,    perDay: 100 },
  professional: { perMinute: 100,   perDay: 5_000 },
  team:         { perMinute: 500,   perDay: 50_000 },
  enterprise:   { perMinute: 2_000, perDay: 500_000 },
};
const DEFAULT_LIMITS = PLAN_LIMITS.community;

type SubModel = {
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
};
type PlanModel = {
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
};

async function getPlanLimits(orgId: string): Promise<{ perMinute: number; perDay: number }> {
  try {
    const db = await getPrisma();
    if (!db) return DEFAULT_LIMITS;
    const sm = (db as Record<string, unknown>).subscription as SubModel;
    const pm = (db as Record<string, unknown>).plan         as PlanModel;
    const sub = await sm.findFirst({
      where:   { organizationId: orgId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });
    if (!sub?.planId) return DEFAULT_LIMITS;
    const plan = await pm.findUnique({ where: { id: String(sub.planId) } });
    if (!plan?.slug) return DEFAULT_LIMITS;
    const slug = String(plan.slug).toLowerCase();
    return PLAN_LIMITS[slug] ?? DEFAULT_LIMITS;
  } catch { return DEFAULT_LIMITS; }
}

// ── Window helpers ────────────────────────────────────────────────────────────

function minuteWindow(): number { return Math.floor(Date.now() / 60_000); }
function todayKey():    string  { return new Date().toISOString().slice(0, 10); }   // YYYY-MM-DD

// Millis until the current minute window resets
function msUntilMinuteReset(): number {
  return 60_000 - (Date.now() % 60_000);
}
// Millis until midnight UTC
function msUntilDayReset(): number {
  const now  = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.getTime() - now.getTime();
}

// ── DEV-ONLY in-memory fallback ───────────────────────────────────────────────
// WARNING: NOT multi-instance safe. For local dev when REDIS_URL is absent.
// In a multi-instance production deployment this fallback provides per-instance
// limits only — a single caller can exceed the nominal limit by Nx across N
// instances. This is logged and surfaced via the health endpoint.

type WinEntry = { count: number; resetAt: number };
const DEV_STORE = new Map<string, WinEntry>();

// Throttle the degraded-state warning to at most once per minute per instance.
// Per-instance throttling is intentional and expected in multi-instance deployments.
let _redisDegradedLastWarnMs = 0;
const REDIS_DEGRADED_WARN_INTERVAL_MS = 60_000;

let _redisDegradedActive = false;

/** Returns true when the rate-limiter is running on the in-process fallback. */
export function isRateLimiterDegraded(): boolean {
  return _redisDegradedActive;
}

function signalRedisDegraded(): void {
  _redisDegradedActive = true;
  const now = Date.now();
  if (now - _redisDegradedLastWarnMs < REDIS_DEGRADED_WARN_INTERVAL_MS) return;
  _redisDegradedLastWarnMs = now;
  // Log at warn level — do not throw, do not recurse into audit if audit itself uses Redis
  try {
    console.warn(
      "[hermes] rate-limiter DEGRADED: Redis unavailable, falling back to in-process Map. " +
      "Cross-instance rate limits are NOT enforced. " +
      "Per-instance throttling is intentional in multi-instance deployments."
    );
  } catch { /* defensive: never throw from degraded signal */ }
  // Best-effort audit event — wrapped so it cannot throw or recurse
  try {
    recordAuditEvent({
      action:     INFRA_AUDIT.RATE_LIMITER_DEGRADED,
      entityType: "infrastructure",
      metadata:   { component: "rate_limiter", fallback: "in_process_map", note: "cross-instance limits not enforced" },
    }).catch(() => undefined);
  } catch { /* defensive */ }
}

function devIncr(key: string, ttlMs: number): number {
  const now    = Date.now();
  const entry  = DEV_STORE.get(key);
  if (!entry || now >= entry.resetAt) {
    DEV_STORE.set(key, { count: 1, resetAt: now + ttlMs });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

function devGet(key: string): number {
  const now   = Date.now();
  const entry = DEV_STORE.get(key);
  if (!entry || now >= entry.resetAt) return 0;
  return entry.count;
}

// ── Main rate-check function ──────────────────────────────────────────────────

/**
 * Increment counters and check limits.
 * Returns RateLimitState — caller should return 429 when state.exceeded === true.
 * Fire-and-forget audit event on first-exceeded call in the window.
 */
export async function checkAndIncrRateLimit(
  orgId: string,
  keyId?: string,
): Promise<RateLimitState> {
  const limits = await getPlanLimits(orgId);
  const mKey   = `rl:${orgId}:m:${minuteWindow()}`;
  const dKey   = `rl:${orgId}:d:${todayKey()}`;

  const redis  = await getRedis();

  let usedMinute: number;
  let usedDay:    number;

  if (redis) {
    // Redis fixed-window: INCR + EXPIREAT (atomic per key)
    const pipe = redis.pipeline();
    pipe.incr(mKey);
    pipe.expireat(mKey, Math.ceil((Date.now() + msUntilMinuteReset()) / 1000));
    pipe.incr(dKey);
    pipe.expireat(dKey, Math.ceil((Date.now() + msUntilDayReset()) / 1000));
    const results = await pipe.exec();
    usedMinute = (results?.[0]?.[1] as number) ?? 1;
    usedDay    = (results?.[2]?.[1] as number) ?? 1;
  } else {
    // In-process fallback — emit degraded signal (throttled)
    signalRedisDegraded();
    usedMinute = devIncr(mKey, 60_000);
    usedDay    = devIncr(dKey, msUntilDayReset());
  }

  const exceededMinute = usedMinute > limits.perMinute;
  const exceededDay    = usedDay    > limits.perDay;
  const exceeded       = exceededMinute || exceededDay;
  const exceededWindow = exceededDay ? "day" : exceededMinute ? "minute" : null;

  const now = Date.now();
  const state: RateLimitState = {
    limitPerMinute:  limits.perMinute,
    limitPerDay:     limits.perDay,
    usedThisMinute:  usedMinute,
    usedToday:       usedDay,
    remainingMinute: Math.max(0, limits.perMinute - usedMinute),
    remainingDay:    Math.max(0, limits.perDay    - usedDay),
    resetMinuteAt:   now + msUntilMinuteReset(),
    resetDayAt:      now + msUntilDayReset(),
    exceeded,
    exceededWindow,
  };

  // Audit on first breach in this window (usedMinute/Day == limit+1)
  if (
    (exceededMinute && usedMinute === limits.perMinute + 1) ||
    (exceededDay    && usedDay    === limits.perDay    + 1)
  ) {
    recordAuditEvent({
      action:     API_AUDIT.RATE_LIMIT_EXCEEDED,
      entityType: "ApiKey",
      entityId:   keyId,
      metadata:   { orgId, exceededWindow, usedMinute, usedDay, limits },
    }).catch(() => undefined);
  }

  return state;
}

/** Read current counters without incrementing — used by the status endpoint. */
export async function getRateLimitStatus(orgId: string): Promise<RateLimitState> {
  const limits = await getPlanLimits(orgId);
  const mKey   = `rl:${orgId}:m:${minuteWindow()}`;
  const dKey   = `rl:${orgId}:d:${todayKey()}`;

  const redis  = await getRedis();
  let usedMinute: number;
  let usedDay:    number;

  if (redis) {
    const [m, d] = await redis.mget(mKey, dKey);
    usedMinute = m ? parseInt(m, 10) : 0;
    usedDay    = d ? parseInt(d, 10) : 0;
  } else {
    _redisDegradedActive = true;
    usedMinute = devGet(mKey);
    usedDay    = devGet(dKey);
  }

  const now = Date.now();
  return {
    limitPerMinute:  limits.perMinute,
    limitPerDay:     limits.perDay,
    usedThisMinute:  usedMinute,
    usedToday:       usedDay,
    remainingMinute: Math.max(0, limits.perMinute - usedMinute),
    remainingDay:    Math.max(0, limits.perDay    - usedDay),
    resetMinuteAt:   now + msUntilMinuteReset(),
    resetDayAt:      now + msUntilDayReset(),
    exceeded:        usedMinute > limits.perMinute || usedDay > limits.perDay,
    exceededWindow:  usedDay > limits.perDay ? "day" : usedMinute > limits.perMinute ? "minute" : null,
  };
}
