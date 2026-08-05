import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * PHASE 93 — production-acceptance security gate.
 *
 * Regression guard for a confirmed HIGH finding: the brute-force / enumeration
 * rate limiters on the core auth endpoints keyed their bucket on the left-most
 * `X-Forwarded-For` entry. nginx sets XFF with `$proxy_add_x_forwarded_for`,
 * which APPENDS the client-supplied value, so its left-most entry is
 * attacker-controlled — rotating it per request mints a fresh bucket and
 * defeats the throttle entirely (login 10/15min, forgot-password 3/hr, …).
 *
 * The fix routes every auth endpoint through `resolveClientIp` (X-Real-IP only,
 * which nginx overwrites with `$remote_addr` and the client cannot forge). These
 * tests prove the throttle IDENTIFIER equals X-Real-IP and is NEVER influenced
 * by X-Forwarded-For — for all six previously-vulnerable endpoints.
 */

const MOCKED = ["@/lib/auth/rate-limiter", "@/lib/auth/config"];

let rlCalls: Array<{ action: string; id: string }> = [];

beforeEach(() => {
  vi.resetModules();
  rlCalls = [];
});
afterEach(() => {
  for (const m of MOCKED) vi.doUnmock(m);
  vi.restoreAllMocks();
});

// Spy limiter: record (action, identifier) and always allow so the handler
// proceeds to (and fails) input validation AFTER the rate-limit call we assert.
function mockRateLimiter() {
  vi.doMock("@/lib/auth/rate-limiter", () => ({
    checkRateLimit: async (action: string, id: string) => {
      rlCalls.push({ action, id });
      return true;
    },
    retryAfter: () => 60,
    limitWindowSeconds: () => 60,
    remainingAttempts: async () => 5,
    isAuthLimiterDegraded: () => false,
  }));
}

// The /api/auth POST gates on isAuthConfigured() before reaching the limiter.
async function mockAuthConfigured() {
  const actual = await vi.importActual<typeof import("@/lib/auth/config")>("@/lib/auth/config");
  vi.doMock("@/lib/auth/config", () => ({ ...actual, isAuthConfigured: () => true }));
}

const REAL_IP = "203.0.113.7"; // proxy-set (X-Real-IP) — trusted, un-spoofable
const SPOOF_XFF_HEAD = "198.51.100.9"; // client-appendable left-most XFF entry
const SPOOF_XFF = `${SPOOF_XFF_HEAD}, 10.0.0.1`;

function reqWith(url: string, body: unknown, headers: Record<string, string>) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// Each case: (label, url, importer, action, minimal body reaching the limiter)
const CASES: Array<{
  label: string;
  url: string;
  load: () => Promise<{ POST: (r: NextRequest) => Promise<Response> }>;
  action: string;
  body: unknown;
  needsAuthConfig?: boolean;
}> = [
  {
    label: "login (/api/auth)",
    url: "http://localhost/api/auth",
    load: () => import("@/app/api/auth/route"),
    action: "login",
    body: { action: "login" },
    needsAuthConfig: true,
  },
  {
    label: "forgot-password",
    url: "http://localhost/api/auth/forgot-password",
    load: () => import("@/app/api/auth/forgot-password/route"),
    action: "forgot-password",
    body: {},
  },
  {
    label: "reset-password",
    url: "http://localhost/api/auth/reset-password",
    load: () => import("@/app/api/auth/reset-password/route"),
    action: "reset-password",
    body: {},
  },
  {
    label: "verify-email",
    url: "http://localhost/api/auth/verify-email",
    load: () => import("@/app/api/auth/verify-email/route"),
    action: "verify-email",
    body: {},
  },
  {
    label: "accept-invite",
    url: "http://localhost/api/auth/accept-invite",
    load: () => import("@/app/api/auth/accept-invite/route"),
    action: "accept-invite",
    body: {},
  },
  {
    label: "access-request",
    url: "http://localhost/api/auth/access-request",
    load: () => import("@/app/api/auth/access-request/route"),
    action: "access-request",
    body: {},
  },
];

describe("Phase 93 — auth rate-limit key is derived from X-Real-IP, not X-Forwarded-For", () => {
  for (const c of CASES) {
    it(`${c.label}: throttle identifier = X-Real-IP, ignores a spoofed X-Forwarded-For`, async () => {
      mockRateLimiter();
      if (c.needsAuthConfig) await mockAuthConfigured();
      const { POST } = await c.load();

      await POST(
        reqWith(c.url, c.body, {
          "x-real-ip": REAL_IP,
          "x-forwarded-for": SPOOF_XFF,
        }),
      );

      const hit = rlCalls.find((r) => r.action === c.action);
      expect(hit, `checkRateLimit("${c.action}", …) was not called`).toBeTruthy();
      expect(hit!.id).toBe(REAL_IP);
      // The client-controlled XFF value must never become the bucket key.
      expect(hit!.id).not.toBe(SPOOF_XFF_HEAD);
      expect(hit!.id).not.toBe(SPOOF_XFF);
    });

    it(`${c.label}: rotating X-Forwarded-For cannot mint a fresh bucket (same X-Real-IP ⇒ same key)`, async () => {
      mockRateLimiter();
      if (c.needsAuthConfig) await mockAuthConfigured();
      const { POST } = await c.load();

      // Two requests, same trusted peer, DIFFERENT spoofed XFF each time.
      await POST(reqWith(c.url, c.body, { "x-real-ip": REAL_IP, "x-forwarded-for": "1.1.1.1" }));
      await POST(reqWith(c.url, c.body, { "x-real-ip": REAL_IP, "x-forwarded-for": "2.2.2.2" }));

      const ids = rlCalls.filter((r) => r.action === c.action).map((r) => r.id);
      expect(ids.length).toBe(2);
      expect(ids[0]).toBe(REAL_IP);
      expect(ids[1]).toBe(REAL_IP); // identical key — no bypass via header rotation
    });

    it(`${c.label}: absent X-Real-IP falls back to "unknown" and still ignores X-Forwarded-For`, async () => {
      mockRateLimiter();
      if (c.needsAuthConfig) await mockAuthConfigured();
      const { POST } = await c.load();

      await POST(reqWith(c.url, c.body, { "x-forwarded-for": SPOOF_XFF }));

      const hit = rlCalls.find((r) => r.action === c.action);
      expect(hit, `checkRateLimit("${c.action}", …) was not called`).toBeTruthy();
      expect(hit!.id).toBe("unknown");
      expect(hit!.id).not.toBe(SPOOF_XFF_HEAD);
    });
  }
});
