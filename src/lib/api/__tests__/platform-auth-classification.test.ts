import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";

/**
 * PLATFORM AUTH — every rejection is DISTINGUISHABLE in the log stream, and the
 * public contract is unchanged.
 *
 * Investigation context: `/api/multi-site/summary` answered
 * `401 Authentication required` in production and nothing in the log stream
 * said why. Six materially different conditions — absent credentials, an
 * invalid token, a revoked session, a database fault, a user with no ACTIVE
 * organization membership, and an unusable API key — all returned an unlogged
 * `null` from `resolveJwtContext`, so an operator could not separate an expired
 * login from a database outage from an account that was never attached to an
 * organization.
 *
 * These tests pin BOTH halves of that fix:
 *   1. each condition emits its own machine-readable reason, on the right
 *      channel (auth failure vs. authorization denial);
 *   2. the observable HTTP behaviour did NOT change — `requirePlatformAuth`
 *      still answers 401 "Authentication required" for every one of them.
 *      `requirePlatformAuth` feeds ~80 routes; re-classifying "no organization"
 *      as 403 is a separate, reviewed change and is explicitly asserted here
 *      NOT to have happened yet.
 *
 * Security posture asserted alongside: fail-closed on every uncertainty,
 * session revocation still enforced, API-key behaviour untouched, and no
 * credential material of any kind reaching the logger.
 */

const TOKEN     = "eyJhbGciOiJIUzI1NiJ9.super-secret-access-token.signature";
const RAW_KEY   = "hk_live_ThisIsARawApiKeySecretValue";
const DB_SECRET = "connect ECONNREFUSED 10.0.0.5:5432";

const MOCKED = [
  "@/lib/auth/jwt",
  "@/lib/auth/session-store",
  "@/lib/db/prisma",
  "@/lib/logger/security-events",
  "../keys",
];

interface Captured { channel: string; payload: Record<string, unknown> }
let events: Captured[] = [];

/** Every argument handed to the security logger, for the no-secrets assertion. */
let infraArgs: unknown[][] = [];

beforeEach(() => {
  vi.resetModules();
  events    = [];
  infraArgs = [];

  vi.doMock("@/lib/logger/security-events", () => ({
    logAuthFailure: (ctx: Record<string, unknown>) => { events.push({ channel: "auth_failure", payload: ctx }); },
    logAuthzDenial: (ctx: Record<string, unknown>) => { events.push({ channel: "authz_denied", payload: ctx }); },
    logInfraFailure: (...args: unknown[]) => {
      infraArgs.push(args);
      events.push({ channel: "infra_failure", payload: { subsystem: args[0], operation: args[1] } });
    },
  }));

  // Default: no API keys resolve unless a test says otherwise.
  vi.doMock("../keys", () => ({
    verifyApiKey: async () => null,
    touchLastUsed: () => {},
  }));
});

afterEach(() => {
  for (const m of MOCKED) vi.doUnmock(m);
  vi.restoreAllMocks();
});

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/multi-site/summary", { method: "GET", headers });
}

const withCookie = () => req({ cookie: `${ACCESS_TOKEN_COOKIE}=${TOKEN}` });

/** Mock the JWT layer: `payload` null means the token fails verification. */
function mockJwt(payload: { sub: string; sid?: string } | null) {
  vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => payload }));
}

function mockSession(active: boolean) {
  vi.doMock("@/lib/auth/session-store", () => ({ isPayloadSessionActive: async () => active }));
}

/** Mock the org-membership lookup. `"throw"` simulates a database fault. */
function mockOrg(result: Record<string, unknown> | null | "throw" | "no-client") {
  if (result === "no-client") {
    vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => null }));
    return;
  }
  vi.doMock("@/lib/db/prisma", () => ({
    getPrisma: async () => ({
      organizationMember: {
        findFirst: async () => {
          if (result === "throw") throw new Error(DB_SECRET);
          return result;
        },
      },
    }),
  }));
}

async function callRequire(request: NextRequest) {
  const { requirePlatformAuth } = await import("../auth");
  return requirePlatformAuth(request);
}

const reasons = () => events.map((e) => e.payload.reason).filter(Boolean);
const only = (): Captured => {
  const classified = events.filter((e) => e.channel !== "infra_failure");
  expect(classified).toHaveLength(1);
  return classified[0];
};

describe("platform auth — failure classification", () => {
  it("no credentials at all -> missing_credentials, logged as an auth FAILURE", async () => {
    mockJwt(null); mockSession(true); mockOrg(null);
    const res = await callRequire(req());

    expect(res).toEqual({ error: "Authentication required", status: 401 });
    expect(only().channel).toBe("auth_failure");
    expect(only().payload.reason).toBe("missing_credentials");
    expect(only().payload.operation).toBe("platform.auth");
    expect(only().payload.userId).toBeUndefined(); // no identity was established
  });

  it("a token that fails verification -> invalid_access_token", async () => {
    mockJwt(null); mockSession(true); mockOrg(null);
    const res = await callRequire(withCookie());

    expect(res).toEqual({ error: "Authentication required", status: 401 });
    expect(only().channel).toBe("auth_failure");
    expect(only().payload.reason).toBe("invalid_access_token");
    // Identity was never established, so none is attributed.
    expect(only().payload.userId).toBeUndefined();
  });

  it("a revoked/inactive session -> inactive_or_revoked_session, logged as a DENIAL", async () => {
    mockJwt({ sub: "user_1", sid: "sess_1" }); mockSession(false); mockOrg({ organizationId: "org_1" });
    const res = await callRequire(withCookie());

    expect(res).toEqual({ error: "Authentication required", status: 401 });
    expect(only().channel).toBe("authz_denied");
    expect(only().payload.reason).toBe("inactive_or_revoked_session");
    expect(only().payload.userId).toBe("user_1");
  });

  it("session revocation is still ENFORCED — the org lookup is never reached", async () => {
    const findFirst = vi.fn(async () => ({ organizationId: "org_1" }));
    mockJwt({ sub: "user_1", sid: "sess_1" });
    mockSession(false);
    vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => ({ organizationMember: { findFirst } }) }));

    const res = await callRequire(withCookie());
    expect(res).toEqual({ error: "Authentication required", status: 401 });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("authenticated but no ACTIVE membership -> no_active_organization_membership (DENIAL, carries userId)", async () => {
    mockJwt({ sub: "user_1", sid: "sess_1" }); mockSession(true); mockOrg(null);
    const res = await callRequire(withCookie());

    expect(res).toEqual({ error: "Authentication required", status: 401 });
    expect(only().channel).toBe("authz_denied");
    expect(only().payload.reason).toBe("no_active_organization_membership");
    expect(only().payload.userId).toBe("user_1");
  });

  it("a DATABASE FAULT is separated from 'no membership' and recorded as infrastructure", async () => {
    mockJwt({ sub: "user_1", sid: "sess_1" }); mockSession(true); mockOrg("throw");
    const res = await callRequire(withCookie());

    // Fail-closed: still denied.
    expect(res).toEqual({ error: "Authentication required", status: 401 });
    // The distinction that made the production 401 undiagnosable.
    expect(reasons()).toContain("organization_resolution_failed");
    expect(reasons()).not.toContain("no_active_organization_membership");
    // Recorded on the infrastructure channel, scoped to this operation.
    expect(infraArgs).toHaveLength(1);
    expect(infraArgs[0][0]).toBe("database");
    expect(infraArgs[0][1]).toBe("platform.auth.resolve_organization");
  });

  it("an unavailable database client is 'could not resolve', not 'has no organization'", async () => {
    mockJwt({ sub: "user_1", sid: "sess_1" }); mockSession(true); mockOrg("no-client");
    const res = await callRequire(withCookie());

    expect(res).toEqual({ error: "Authentication required", status: 401 });
    expect(only().payload.reason).toBe("organization_resolution_failed");
  });

  it("a resolvable user is authenticated and logs NOTHING", async () => {
    mockJwt({ sub: "user_1", sid: "sess_1" }); mockSession(true); mockOrg({ organizationId: "org_9" });
    const res = await callRequire(withCookie());

    expect(res).toEqual({ ctx: { userId: "user_1", orgId: "org_9", authMethod: "jwt", scopes: ["admin"] } });
    expect(events).toHaveLength(0);
  });
});

describe("platform auth — API-key behaviour is unchanged", () => {
  it("a valid API key still authenticates with its own org and scopes, logging nothing", async () => {
    mockJwt(null); mockSession(true); mockOrg(null);
    vi.doMock("../keys", () => ({
      verifyApiKey: async () => ({ id: "key_1", organizationId: "org_k", scopes: ["read"], lastUsedAt: null }),
      touchLastUsed: () => {},
    }));

    const res = await callRequire(req({ "x-api-key": RAW_KEY }));
    expect(res).toEqual({
      ctx: { userId: null, orgId: "org_k", authMethod: "apikey", scopes: ["read"], keyId: "key_1" },
    });
    expect(events).toHaveLength(0);
  });

  it("an API key takes precedence over a session cookie (precedence unchanged)", async () => {
    mockJwt({ sub: "user_1" }); mockSession(true); mockOrg({ organizationId: "org_jwt" });
    vi.doMock("../keys", () => ({
      verifyApiKey: async () => ({ id: "key_1", organizationId: "org_k", scopes: [], lastUsedAt: null }),
      touchLastUsed: () => {},
    }));

    const res = await callRequire(
      new NextRequest("http://localhost/api/multi-site/summary", {
        method: "GET",
        headers: { "x-api-key": RAW_KEY, cookie: `${ACCESS_TOKEN_COOKIE}=${TOKEN}` },
      }),
    );
    expect(res).toMatchObject({ ctx: { authMethod: "apikey", orgId: "org_k" } });
  });

  it("an unusable API key still denies, and is now visible as invalid_api_key", async () => {
    mockJwt(null); mockSession(true); mockOrg(null);
    const res = await callRequire(req({ "x-api-key": RAW_KEY }));

    expect(res).toEqual({ error: "Authentication required", status: 401 });
    expect(only().payload.reason).toBe("invalid_api_key");
  });

  it("an API key sent as a Bearer token is routed to the key path, not the JWT path", async () => {
    mockJwt(null); mockSession(true); mockOrg(null);
    const res = await callRequire(req({ authorization: `Bearer ${RAW_KEY}` }));

    expect(res).toEqual({ error: "Authentication required", status: 401 });
    expect(only().payload.reason).toBe("invalid_api_key");
  });
});

describe("platform auth — the public contract did NOT change", () => {
  it("every rejection reason still answers 401 with the same generic message", async () => {
    const cases: Array<[string, () => void, NextRequest]> = [
      ["missing",     () => { mockJwt(null); mockSession(true); mockOrg(null); },                          req()],
      ["bad token",   () => { mockJwt(null); mockSession(true); mockOrg(null); },                          withCookie()],
      ["revoked",     () => { mockJwt({ sub: "u" }); mockSession(false); mockOrg({ organizationId: "o" }); }, withCookie()],
      ["no org",      () => { mockJwt({ sub: "u" }); mockSession(true); mockOrg(null); },                   withCookie()],
      ["db fault",    () => { mockJwt({ sub: "u" }); mockSession(true); mockOrg("throw"); },                withCookie()],
    ];

    for (const [name, setup, request] of cases) {
      vi.resetModules();
      events = [];
      vi.doMock("@/lib/logger/security-events", () => ({
        logAuthFailure: (c: Record<string, unknown>) => { events.push({ channel: "auth_failure", payload: c }); },
        logAuthzDenial: (c: Record<string, unknown>) => { events.push({ channel: "authz_denied", payload: c }); },
        logInfraFailure: () => {},
      }));
      vi.doMock("../keys", () => ({ verifyApiKey: async () => null, touchLastUsed: () => {} }));
      setup();

      const res = await callRequire(request);
      // Explicitly NOT 403 — that semantic change is deliberately deferred.
      expect(res, name).toEqual({ error: "Authentication required", status: 401 });
    }
  });
});

describe("platform auth — no credential material is ever logged", () => {
  it("no access token, cookie value, API key or database message reaches the logger", async () => {
    const scenarios: Array<[() => void, NextRequest]> = [
      [() => { mockJwt(null); mockSession(true); mockOrg(null); }, withCookie()],
      [() => { mockJwt({ sub: "user_1" }); mockSession(false); mockOrg(null); }, withCookie()],
      [() => { mockJwt({ sub: "user_1" }); mockSession(true); mockOrg("throw"); }, withCookie()],
      [() => { mockJwt(null); mockSession(true); mockOrg(null); }, req({ "x-api-key": RAW_KEY })],
    ];

    for (const [setup, request] of scenarios) {
      vi.resetModules();
      events = []; infraArgs = [];
      vi.doMock("@/lib/logger/security-events", () => ({
        logAuthFailure:  (c: Record<string, unknown>) => { events.push({ channel: "auth_failure", payload: c }); },
        logAuthzDenial:  (c: Record<string, unknown>) => { events.push({ channel: "authz_denied", payload: c }); },
        // Only the subsystem/operation labels are captured; the error object is
        // handed to the real helper, which records the CLASS and message only.
        logInfraFailure: (...args: unknown[]) => { infraArgs.push([args[0], args[1]]); },
      }));
      vi.doMock("../keys", () => ({ verifyApiKey: async () => null, touchLastUsed: () => {} }));
      setup();
      await callRequire(request);

      const serialized = JSON.stringify({ events, infraArgs });
      expect(serialized).not.toContain(TOKEN);
      expect(serialized).not.toContain(RAW_KEY);
      expect(serialized).not.toContain("hk_");
      expect(serialized).not.toContain(DB_SECRET);
      expect(serialized.toLowerCase()).not.toContain("cookie");
      expect(serialized.toLowerCase()).not.toContain("authorization");
    }
  });
});
