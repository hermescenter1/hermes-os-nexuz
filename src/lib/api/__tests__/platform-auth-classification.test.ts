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

/**
 * NO CREDENTIAL OR DRIVER MATERIAL REACHES THE LOG STREAM.
 *
 * The earlier version of this suite asserted this against a MOCK of
 * `logInfraFailure` that discarded the error argument, so it proved nothing
 * about what the real logger emits. `logInfraFailure` records
 * `error.message.slice(0, 300)`, and the logger's scrubber only masks URL
 * userinfo, `key=value` secrets and JWT-shaped strings — a bare `host:port`, a
 * table name or a statement fragment inside a driver message is none of those
 * and would pass straight through.
 *
 * These tests therefore exercise the REAL path end to end: the real
 * `security-events` helpers, the real `logger`, and the real serializer, with
 * `process.stdout.write` captured so the assertions run against the exact bytes
 * that would be written in production.
 */
describe("platform auth — nothing sensitive reaches the REAL log stream", () => {
  /** Everything the real logger would write during `fn`. */
  async function captureLogOutput(fn: () => Promise<unknown>): Promise<string> {
    const written: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(((chunk: unknown) => { written.push(String(chunk)); return true; }) as never);
    // The logger falls back to console.* when process.stdout is unavailable.
    const errSpy  = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => { written.push(a.join(" ")); });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => { written.push(a.join(" ")); });
    const logSpy  = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { written.push(a.join(" ")); });
    try { await fn(); } finally {
      stdoutSpy.mockRestore(); errSpy.mockRestore(); warnSpy.mockRestore(); logSpy.mockRestore();
    }
    return written.join("\n");
  }

  /** Re-arm the mocks WITHOUT stubbing security-events, so the real logger runs. */
  function armReal() {
    // The outer beforeEach mocks security-events; resetModules() clears the
    // module REGISTRY but not registered mocks, so this must be undone
    // explicitly or the real logger never runs and the capture is empty.
    vi.doUnmock("@/lib/logger/security-events");
    vi.resetModules();
    vi.doMock("../keys", () => ({ verifyApiKey: async () => null, touchLastUsed: () => {} }));
  }

  it("a database fault logs the error CLASS and CODE but never the driver message", async () => {
    armReal();
    // A realistic Prisma failure: the message carries a host and port, and the
    // instance carries a stable code.
    class PrismaClientInitializationError extends Error {
      code = "P1001";
      constructor(m: string) { super(m); this.name = "PrismaClientInitializationError"; }
    }
    const thrown = new PrismaClientInitializationError(
      "Can not reach database server at 10.0.0.5 port 5432 — " + DB_SECRET,
    );
    mockJwt({ sub: "user_1", sid: "s1" });
    mockSession(true);
    vi.doMock("@/lib/db/prisma", () => ({
      getPrisma: async () => ({ organizationMember: { findFirst: async () => { throw thrown; } } }),
    }));

    let res: unknown;
    const out = await captureLogOutput(async () => { res = await callRequire(withCookie()); });

    // Fail-closed behaviour is unchanged.
    expect(res).toEqual({ error: "Authentication required", status: 401 });

    // The fault IS recorded, and usefully.
    expect(out).toContain("database.failure");
    expect(out).toContain("platform.auth.resolve_organization");
    expect(out).toContain("PrismaClientInitializationError");
    expect(out).toContain("P1001");

    // …but nothing the driver authored.
    expect(out).not.toContain(DB_SECRET);
    expect(out).not.toContain("10.0.0.5");
    expect(out).not.toContain("Can not reach database server");
  });

  it("a driver message carrying SQL, a table name or a connection string is never emitted", async () => {
    const hostile = [
      "relation OrganizationMember does not exist",
      "SELECT * FROM User WHERE email = victim@example.com",
      "postgresql://hermes:hunter2@db.internal:5432/hermes_db",
    ].join(" | ");

    armReal();
    mockJwt({ sub: "user_1", sid: "s1" });
    mockSession(true);
    vi.doMock("@/lib/db/prisma", () => ({
      getPrisma: async () => ({
        organizationMember: { findFirst: async () => { throw new Error(hostile); } },
      }),
    }));

    const out = await captureLogOutput(() => callRequire(withCookie()));

    expect(out).toContain("database.failure");
    for (const fragment of [
      "does not exist",
      "SELECT * FROM",
      "victim@example.com",
      "hunter2",
      "db.internal",
      "hermes_db",
    ]) {
      expect(out, "leaked: " + fragment).not.toContain(fragment);
    }
  });

  it("no token, cookie value or API key appears in ANY emitted line", async () => {
    const scenarios: Array<[() => void, () => NextRequest]> = [
      [() => { mockJwt(null); mockSession(true); mockOrg(null); }, withCookie],
      [() => { mockJwt({ sub: "user_1" }); mockSession(false); mockOrg(null); }, withCookie],
      [() => { mockJwt({ sub: "user_1" }); mockSession(true); mockOrg("throw"); }, withCookie],
      [() => { mockJwt(null); mockSession(true); mockOrg(null); }, () => req({ "x-api-key": RAW_KEY })],
      [() => { mockJwt(null); mockSession(true); mockOrg(null); }, () => req({ authorization: "Bearer " + RAW_KEY })],
    ];

    for (const [setup, request] of scenarios) {
      armReal();
      setup();
      const out = await captureLogOutput(() => callRequire(request()));

      expect(out).not.toContain(TOKEN);
      expect(out).not.toContain(RAW_KEY);
      expect(out).not.toContain("hk_");
      expect(out).not.toContain(DB_SECRET);
      // Header names would only appear if a raw request/header bag were logged.
      expect(out.toLowerCase()).not.toContain("set-cookie");
      expect(out.toLowerCase()).not.toContain("authorization");
    }
  });
});

/**
 * The sanitizer itself, driven directly with adversarial inputs. This is the
 * component the guarantee rests on, so it is tested as a unit rather than only
 * through the route.
 */
describe("sanitizeDatabaseError", () => {
  async function sanitize() {
    vi.doUnmock("@/lib/logger/security-events");
    vi.resetModules();
    vi.doMock("../keys", () => ({ verifyApiKey: async () => null, touchLastUsed: () => {} }));
    const mod = await import("../auth");
    return mod.sanitizeDatabaseError;
  }

  it("keeps the class name and a well-formed code", async () => {
    const s = await sanitize();
    class PrismaClientKnownRequestError extends Error { code = "P2021"; }
    expect(s(new PrismaClientKnownRequestError("boom at 10.0.0.5 port 5432")).message)
      .toBe("PrismaClientKnownRequestError(P2021)");
  });

  it("never carries the original message", async () => {
    const s = await sanitize();
    const out = s(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
    expect(out.message).toBe("Error");
    expect(out.message).not.toContain("ECONNREFUSED");
    expect(out.message).not.toContain("10.0.0.5");
  });

  it("drops a code that is not a plain short identifier", async () => {
    const s = await sanitize();
    const bad: unknown[] = [
      "P1001 at postgres://u:p@h/db",
      "x; DROP TABLE User",
      "a".repeat(64),
      "with space",
      "",
      123,
      null,
      { toString: () => "evil" },
    ];
    for (const code of bad) {
      const err = Object.assign(new Error("secret message"), { code });
      expect(s(err).message, String(code)).toBe("Error");
    }
  });

  it("handles non-Error throws without leaking their contents", async () => {
    const s = await sanitize();
    expect(s("connect ECONNREFUSED 10.0.0.5:5432").message).toBe("string");
    expect(s({ message: "10.0.0.5:5432" }).message).toBe("object");
    expect(s(null).message).toBe("object");
    expect(s(undefined).message).toBe("undefined");
  });

  it("rejects a forged constructor name that is not a plain identifier", async () => {
    const s = await sanitize();
    const err = new Error("boom");
    Object.defineProperty(err.constructor, "name", { value: "Err at 10.0.0.5 port 5432", configurable: true });
    expect(s(err).message).toBe("UnknownError");
  });
});
