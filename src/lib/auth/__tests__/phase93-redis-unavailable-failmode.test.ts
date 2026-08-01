import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * PHASE 93 — production-acceptance failure-mode gate.
 *
 * The auth rate limiter is Redis-backed with a documented in-process fallback
 * (src/lib/auth/rate-limiter.ts header): "Redis unavailable → in-process
 * fallback activates automatically … Authentication continues — startup does
 * NOT fail." Phase 92 shipped no test exercising that path. These tests prove
 * the fallback is fail-SAFE (limits still bound), degradation is observable,
 * the limiter never throws when Redis is down, and it recovers when Redis
 * returns — so a Redis outage degrades gracefully instead of either crashing
 * the auth path or silently disabling throttling.
 */

const MOCKED = ["@/lib/redis/client", "@/lib/audit/audit-service", "@/lib/logger"];

let auditCalls = 0;

function mockDeps(getRedis: () => Promise<unknown>) {
  vi.doMock("@/lib/redis/client", () => ({ getRedis }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    recordAuditEvent: async () => { auditCalls += 1; },
    INFRA_AUDIT: { RATE_LIMITER_DEGRADED: "rate_limiter.degraded" },
  }));
  vi.doMock("@/lib/logger", () => ({
    logger: { warn: () => {}, info: () => {}, error: () => {}, debug: () => {} },
  }));
}

beforeEach(() => {
  vi.resetModules();
  auditCalls = 0;
});
afterEach(() => {
  for (const m of MOCKED) vi.doUnmock(m);
  vi.restoreAllMocks();
});

describe("Phase 93 — auth rate limiter degrades gracefully when Redis is unavailable", () => {
  it("getRedis() → null: falls back to in-process limiter and STILL bounds (fail-safe, not fail-open)", async () => {
    mockDeps(async () => null);
    const { checkRateLimit, isAuthLimiterDegraded } = await import("@/lib/auth/rate-limiter");

    // forgot-password bucket = 3 / hour. The 4th attempt from one identifier
    // must be blocked even with no Redis — the throttle is NOT disabled.
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) results.push(await checkRateLimit("forgot-password", "203.0.113.7"));

    expect(results).toEqual([true, true, true, false]);
    expect(isAuthLimiterDegraded()).toBe(true);
  });

  it("in-process fallback still isolates buckets per identifier", async () => {
    mockDeps(async () => null);
    const { checkRateLimit } = await import("@/lib/auth/rate-limiter");

    // Exhaust one identifier…
    for (let i = 0; i < 3; i++) await checkRateLimit("forgot-password", "ip-a");
    expect(await checkRateLimit("forgot-password", "ip-a")).toBe(false);
    // …a different identifier is unaffected.
    expect(await checkRateLimit("forgot-password", "ip-b")).toBe(true);
  });

  it("getRedis() throws: limiter never throws, degrades, and still bounds", async () => {
    mockDeps(async () => { throw new Error("ECONNREFUSED"); });
    const { checkRateLimit, isAuthLimiterDegraded } = await import("@/lib/auth/rate-limiter");

    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      // Must resolve, never reject.
      results.push(await checkRateLimit("forgot-password", "ip-throw"));
    }
    expect(results).toEqual([true, true, true, false]);
    expect(isAuthLimiterDegraded()).toBe(true);
  });

  it("Redis present but pipeline.exec fails mid-operation: degrades to in-process, no throw", async () => {
    const brokenRedis = {
      pipeline: () => ({
        incr: () => {},
        pexpire: () => {},
        exec: async () => { throw new Error("pipeline broke"); },
      }),
      get: async () => { throw new Error("get broke"); },
    };
    mockDeps(async () => brokenRedis);
    const { checkRateLimit, isAuthLimiterDegraded } = await import("@/lib/auth/rate-limiter");

    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) results.push(await checkRateLimit("forgot-password", "ip-broken"));
    expect(results).toEqual([true, true, true, false]);
    expect(isAuthLimiterDegraded()).toBe(true);
  });

  it("recovers: once Redis returns valid counts, degraded flips back to false", async () => {
    let count = 0;
    const workingRedis = {
      pipeline: () => ({
        incr: () => {},
        pexpire: () => {},
        // fixed-window INCR result: [ [incrErr, count], [pexpireErr, ok] ]
        exec: async () => { count += 1; return [[null, count], [null, 1]]; },
      }),
      get: async () => String(count),
    };
    mockDeps(async () => workingRedis);
    const { checkRateLimit, isAuthLimiterDegraded } = await import("@/lib/auth/rate-limiter");

    expect(await checkRateLimit("login", "ip-ok")).toBe(true);
    expect(isAuthLimiterDegraded()).toBe(false);
  });
});
