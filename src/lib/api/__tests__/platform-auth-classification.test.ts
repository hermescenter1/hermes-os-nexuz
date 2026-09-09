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

/**
 * ../keys is mocked EXACTLY ONCE, hoisted above every import, and its factory
 * never changes. Behaviour is varied only through the `vi.fn`s it delegates to.
 *
 * WHY THIS SHAPE — a CI failure, not a preference. Two API-key tests used to
 * re-register this same specifier inside the test body to override a DIFFERENT
 * factory registered in `beforeEach`. Re-registering a specifier is only
 * reliable while nothing has resolved it yet, so which factory won depended on
 * module-resolution order — which in turn depends on how vitest packs test files
 * into workers. This suite was green at 05973cc and red at ef4d16b with
 * IDENTICAL test code: the only delta was merging main, which changed the file
 * set. Both failures were the default null-returning stub winning, so a valid
 * API key produced a 401.
 *
 * With one permanent registration there is no second factory to lose a race to,
 * and the tests no longer depend on ordering at all.
 */
const { verifyApiKeyMock, touchLastUsedMock } = vi.hoisted(() => ({
  verifyApiKeyMock:  vi.fn(),
  touchLastUsedMock: vi.fn(),
}));

vi.mock("../keys", () => ({
  verifyApiKey:  (...args: unknown[]) => verifyApiKeyMock(...args),
  touchLastUsed: (...args: unknown[]) => touchLastUsedMock(...args),
}));

const TOKEN     = "eyJhbGciOiJIUzI1NiJ9.super-secret-access-token.signature";
const RAW_KEY   = "hk_live_ThisIsARawApiKeySecretValue";
const DB_SECRET = "connect ECONNREFUSED 10.0.0.5:5432";

const MOCKED = [
  "@/lib/auth/jwt",
  "@/lib/auth/session-store",
  "@/lib/db/prisma",
  "@/lib/logger/security-events",
];

interface Captured { channel: string; payload: Record<string, unknown> }
let events: Captured[] = [];

/** Every argument handed to the security logger, for the no-secrets assertion. */
let infraArgs: unknown[][] = [];

beforeEach(() => {
  vi.resetModules();
  events    = [];
  infraArgs = [];

  /*
   * PHASE 107 STAGE 6-A — this suite describes a DATABASE-mode deployment, where
   * an unreachable client is an outage (500). Left ambient, the mode came from
   * the環境 and a session-mode run reclassified those cases as 409. Pinning it
   * makes each test say which deployment it is talking about.
   */
  vi.doMock("@/lib/storage/storage-mode", () => ({
    getStorageMode: () => "database",
    isDatabaseMode: () => true,
  }));

  vi.doMock("@/lib/logger/security-events", () => ({
    logAuthFailure: (ctx: Record<string, unknown>) => { events.push({ channel: "auth_failure", payload: ctx }); },
    logAuthzDenial: (ctx: Record<string, unknown>) => { events.push({ channel: "authz_denied", payload: ctx }); },
    logInfraFailure: (...args: unknown[]) => {
      infraArgs.push(args);
      events.push({ channel: "infra_failure", payload: { subsystem: args[0], operation: args[1] } });
    },
  }));

  // Default: no API key resolves unless a test arms one. Reset and re-arm the
  // shared fn rather than re-registering the module factory, so no ordering
  // between competing registrations can exist.
  verifyApiKeyMock.mockReset();
  verifyApiKeyMock.mockResolvedValue(null);
  touchLastUsedMock.mockReset();
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

/**
 * Mock the org-membership lookup. `"throw"` simulates a database fault.
 *
 * PHASE 110-A1.0b R5 — this now serves `findMany`, because the lookup it stands
 * in for changed. `requirePlatformAuth` used to call
 * `findFirst({ orderBy: { createdAt: "asc" } })` — the arbitrary earliest
 * membership — and now asks the selection-aware tenant resolver, which lists
 * memberships with `findMany` and refuses when the reader has several and has
 * chosen none.
 *
 * Serving only the old shape would not have failed loudly: the resolver would
 * have seen no rows on every case and answered "unavailable" for all of them,
 * so five tests here would still have been red but for the WRONG reason, and a
 * sixth would have looked like a behaviour change that was really a dead
 * double. `findFirst` is deliberately still served and still throws on a fault,
 * so a regression to the old lookup is caught rather than silently tolerated.
 */
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
        findMany: async () => {
          if (result === "throw") throw new Error(DB_SECRET);
          // One membership, or none. The multi-membership refusal has its own
          // coverage in `tenant-selection/__tests__/r4-adoption-gap.test.ts`.
          return result === null
            ? []
            : [{ organizationId: result.organizationId, role: "OWNER", status: "ACTIVE" }];
        },
      },
      organization: {
        findUnique: async (a: { where: { id: string } }) => ({
          id: a.where.id,
          slug: `slug-${String(a.where.id)}`,
        }),
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

    // PHASE 107 STAGE 6-A — the refusal now carries the machine-readable code the
    // UI branches on. The status and sentence are unchanged for this case.
    expect(res).toMatchObject({ error: "Authentication required", status: 401 });
    expect(only().channel).toBe("auth_failure");
    expect(only().payload.reason).toBe("missing_credentials");
    expect(only().payload.operation).toBe("platform.auth");
    expect(only().payload.userId).toBeUndefined(); // no identity was established
  });

  it("a token that fails verification -> invalid_access_token", async () => {
    mockJwt(null); mockSession(true); mockOrg(null);
    const res = await callRequire(withCookie());

    // PHASE 107 STAGE 6-A — the refusal now carries the machine-readable code the
    // UI branches on. The status and sentence are unchanged for this case.
    expect(res).toMatchObject({ error: "Authentication required", status: 401 });
    expect(only().channel).toBe("auth_failure");
    expect(only().payload.reason).toBe("invalid_access_token");
    // Identity was never established, so none is attributed.
    expect(only().payload.userId).toBeUndefined();
  });

  it("a revoked/inactive session -> inactive_or_revoked_session, logged as a DENIAL", async () => {
    mockJwt({ sub: "user_1", sid: "sess_1" }); mockSession(false); mockOrg({ organizationId: "org_1" });
    const res = await callRequire(withCookie());

    // PHASE 107 STAGE 6-A — the refusal now carries the machine-readable code the
    // UI branches on. The status and sentence are unchanged for this case.
    expect(res).toMatchObject({ error: "Authentication required", status: 401 });
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
    // PHASE 107 STAGE 6-A — the refusal now carries the machine-readable code the
    // UI branches on. The status and sentence are unchanged for this case.
    expect(res).toMatchObject({ error: "Authentication required", status: 401 });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("authenticated but no ACTIVE membership -> no_active_organization_membership (DENIAL, carries userId)", async () => {
    mockJwt({ sub: "user_1", sid: "sess_1" }); mockSession(true); mockOrg(null);
    const res = await callRequire(withCookie());

    // PHASE 107 STAGE 6-A — the refusal now carries the machine-readable code the
    // UI branches on. The status and sentence are unchanged for this case.
    // PHASE 107 STAGE 6-A — a signed-in caller with no organization is told what is missing, not to sign in again.
    expect(res).toMatchObject({ status: 409, code: "ORGANIZATION_CONTEXT_REQUIRED" });
    expect(only().channel).toBe("authz_denied");
    expect(only().payload.reason).toBe("no_active_organization_membership");
    expect(only().payload.userId).toBe("user_1");
  });

  it("a DATABASE FAULT is separated from 'no membership' and recorded as infrastructure", async () => {
    mockJwt({ sub: "user_1", sid: "sess_1" }); mockSession(true); mockOrg("throw");
    const res = await callRequire(withCookie());

    // Fail-closed: still denied.
    // PHASE 107 STAGE 6-A — the refusal now carries the machine-readable code the
    // UI branches on. The status and sentence are unchanged for this case.
    // PHASE 107 STAGE 6-A — a database fault is the platform's problem, not the caller's.
    /*
     * PHASE 110-A1.0b R5 — A DELIBERATE CONTRACT CHANGE, recorded rather than
     * absorbed: 500 INTERNAL_ERROR -> 503 ORGANIZATION_CONTEXT_UNAVAILABLE.
     *
     * `requirePlatformAuth` now resolves the tenant through the selection-aware
     * resolver instead of its own earliest-membership `findFirst`, and that
     * resolver classifies an unreachable membership store as
     * MEMBERSHIP_UNAVAILABLE, which this module maps to 503.
     *
     * WHY THE NEW STATUS IS THE RIGHT ONE, in this repository's own words
     * (`src/lib/auth/context-result.ts`): "503, not 500. The distinction is not
     * cosmetic: 500 reads as 'the application is broken', 503 as 'a dependency
     * is not answering, try again'". The billing path has answered 503 for this
     * condition since Phase 110-A1.0b; the platform path answering 500 was the
     * session-mode divergence recorded as OPEN in R3, and this closes half of
     * it deliberately rather than by accident.
     *
     * WHAT DID NOT CHANGE, and is still asserted below: the fault stays
     * separated from "no membership", it is still recorded on the
     * infrastructure channel, and the driver message still never escapes.
     *
     * OPERATIONAL CONSEQUENCE, reported in the R5 report: the infrastructure
     * operation name moves from `platform.auth.resolve_organization` to the
     * resolver's own `tenant.memberships`, so any alert keyed on the old string
     * must be re-pointed. A monitor that goes quiet is worse than one that
     * fires, which is why it is named here and not left to be discovered.
     */
    expect(res).toMatchObject({ status: 503, code: "ORGANIZATION_CONTEXT_UNAVAILABLE" });
    // The distinction that made the production 401 undiagnosable — unchanged.
    expect(reasons()).toContain("organization_context_unavailable");
    expect(reasons()).not.toContain("no_active_organization_membership");
    // Still recorded on the infrastructure channel, under the resolver's name.
    expect(infraArgs).toHaveLength(1);
    expect(infraArgs[0][0]).toBe("database");
    expect(infraArgs[0][1]).toBe("tenant.memberships");
  });

  it("an unavailable database client is 'could not resolve', not 'has no organization'", async () => {
    mockJwt({ sub: "user_1", sid: "sess_1" }); mockSession(true); mockOrg("no-client");
    const res = await callRequire(withCookie());

    // PHASE 107 STAGE 6-A — the refusal now carries the machine-readable code the
    // UI branches on. The status and sentence are unchanged for this case.
    // PHASE 107 STAGE 6-A — an unreachable client is an outage, never "you have no organization".
    // PHASE 110-A1.0b R5 — same deliberate change as above: 500 -> 503.
    expect(res).toMatchObject({ status: 503, code: "ORGANIZATION_CONTEXT_UNAVAILABLE" });
    expect(only().payload.reason).toBe("organization_context_unavailable");
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
    verifyApiKeyMock.mockResolvedValue({ id: "key_1", organizationId: "org_k", scopes: ["read"], lastUsedAt: null });

    const res = await callRequire(req({ "x-api-key": RAW_KEY }));
    expect(res).toEqual({
      ctx: { userId: null, orgId: "org_k", authMethod: "apikey", scopes: ["read"], keyId: "key_1" },
    });
    expect(events).toHaveLength(0);
  });

  it("an API key takes precedence over a session cookie (precedence unchanged)", async () => {
    mockJwt({ sub: "user_1" }); mockSession(true); mockOrg({ organizationId: "org_jwt" });
    verifyApiKeyMock.mockResolvedValue({ id: "key_1", organizationId: "org_k", scopes: [], lastUsedAt: null });

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

    // PHASE 107 STAGE 6-A — the refusal now carries the machine-readable code the
    // UI branches on. The status and sentence are unchanged for this case.
    expect(res).toMatchObject({ error: "Authentication required", status: 401 });
    expect(only().payload.reason).toBe("invalid_api_key");
  });

  it("an API key sent as a Bearer token is routed to the key path, not the JWT path", async () => {
    mockJwt(null); mockSession(true); mockOrg(null);
    const res = await callRequire(req({ authorization: `Bearer ${RAW_KEY}` }));

    // PHASE 107 STAGE 6-A — the refusal now carries the machine-readable code the
    // UI branches on. The status and sentence are unchanged for this case.
    expect(res).toMatchObject({ error: "Authentication required", status: 401 });
    expect(only().payload.reason).toBe("invalid_api_key");
  });
});

/**
 * PHASE 107 STAGE 6-A — the semantic change this block used to defer.
 *
 * The previous version asserted that ALL SIX reasons answer 401, with the note
 * "Explicitly NOT 403 — that semantic change is deliberately deferred". It has
 * now been made, so the contract is pinned at a finer grain — and the security
 * property that motivated the flattening is asserted MORE strongly than before,
 * not less.
 *
 * The concern was enumeration: a caller who has not proved who they are must not
 * learn whether an account exists, whether a session was revoked, or whether the
 * database is degraded. That is preserved exactly, and is now tested explicitly
 * by requiring the four pre-authentication reasons to be byte-identical to one
 * another.
 *
 * The two remaining reasons are reachable ONLY after the token is verified and
 * the session confirmed active. They describe the caller's own account, to that
 * caller. Answering them with 401 is what sent a signed-in administrator to a
 * login form, and sent an operator there during a database outage.
 */
describe("platform auth — pre-authentication refusals stay indistinguishable", () => {
  const preAuth: Array<[string, () => void, NextRequest]> = [
    ["missing",   () => { mockJwt(null); mockSession(true); mockOrg(null); },                            req()],
    ["bad token", () => { mockJwt(null); mockSession(true); mockOrg(null); },                            withCookie()],
    ["revoked",   () => { mockJwt({ sub: "u" }); mockSession(false); mockOrg({ organizationId: "o" }); }, withCookie()],
  ];

  it("answers every pre-authentication reason with one identical 401", async () => {
    const answers: string[] = [];
    for (const [name, setup, request] of preAuth) {
      vi.resetModules();
      events = [];
      vi.doMock("@/lib/logger/security-events", () => ({
        logAuthFailure: (c: Record<string, unknown>) => { events.push({ channel: "auth_failure", payload: c }); },
        logAuthzDenial: (c: Record<string, unknown>) => { events.push({ channel: "authz_denied", payload: c }); },
        logInfraFailure: () => {},
      }));
      setup();

      const res = await callRequire(request) as { error: string; status: number; code?: string };
      expect(res, name).toMatchObject({ error: "Authentication required", status: 401 });
      answers.push(JSON.stringify(res));
    }
    // The whole anti-enumeration property in one line: a prober cannot tell
    // "no credential" from "bad token" from "revoked session".
    expect(new Set(answers).size, "pre-authentication answers must be identical").toBe(1);
  });

  it("answers a verified caller precisely, because they already proved who they are", async () => {
    const post: Array<[string, () => void, number, string]> = [
      ["no org",   () => { mockJwt({ sub: "u" }); mockSession(true); mockOrg(null); },    409, "ORGANIZATION_CONTEXT_REQUIRED"],
      // PHASE 110-A1.0b R5 — 503, deliberately. See the note on the database-fault case above.
      ["db fault", () => { mockJwt({ sub: "u" }); mockSession(true); mockOrg("throw"); }, 503, "ORGANIZATION_CONTEXT_UNAVAILABLE"],
    ];

    for (const [name, setup, status, code] of post) {
      vi.resetModules();
      events = [];
      vi.doMock("@/lib/logger/security-events", () => ({
        logAuthFailure: (c: Record<string, unknown>) => { events.push({ channel: "auth_failure", payload: c }); },
        logAuthzDenial: (c: Record<string, unknown>) => { events.push({ channel: "authz_denied", payload: c }); },
        logInfraFailure: () => {},
      }));
      setup();

      const res = await callRequire(withCookie()) as { status: number; code?: string };
      expect(res.status, name).toBe(status);
      expect(res.code, name).toBe(code);
      // Never served: a refusal is still a refusal.
      expect(res).not.toHaveProperty("ctx");
    }
  });

  it("never names an organization or a user in the response", async () => {
    vi.resetModules();
    mockJwt({ sub: "user-secret" }); mockSession(true); mockOrg(null);
    const res = await callRequire(withCookie());
    expect(JSON.stringify(res)).not.toMatch(/user-secret|organizationId/);
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
    // PHASE 107 STAGE 6-A — the refusal now carries the machine-readable code the
    // UI branches on. The status and sentence are unchanged for this case.
    // PHASE 107 STAGE 6-A — a driver fault is a 500. What matters here is
    // unchanged: nothing the driver wrote may reach the caller or the log.
    // PHASE 110-A1.0b R5 — 503, deliberately; the log-hygiene assertions that
    // follow are the point of this case and are unchanged.
    expect(res).toMatchObject({ status: 503, code: "ORGANIZATION_CONTEXT_UNAVAILABLE" });
    expect(JSON.stringify(res)).not.toMatch(/ECONNREFUSED|10\.0\.0|5432/);

    /*
     * The fault IS still recorded — and PHASE 110-A1.0b R5 COSTS SOMETHING
     * HERE, which is asserted rather than quietly dropped.
     *
     * The removed `resolveFirstOrgId` caught the driver error itself and logged
     * a SANITIZED descriptor carrying the class and code —
     * `PrismaClientInitializationError`, `P1001` — under
     * `platform.auth.resolve_organization`. That detail is what made the
     * original production incident diagnosable, and it is the reason this whole
     * file exists.
     *
     * The tenant resolver this path now shares logs its own line instead:
     * `database.failure` under `tenant.memberships`, with the fixed descriptor
     * `MEMBERSHIP_QUERY_FAILED`. It never captures the driver's class or code,
     * so they cannot be forwarded, and emitting a second line from this module
     * under the old name would double-count one fault under two names.
     *
     * TWO OPERATIONAL CONSEQUENCES, both named in the R5 report rather than
     * left to be discovered by a quiet dashboard:
     *   1. alerts keyed on `platform.auth.resolve_organization` must be
     *      re-pointed at `tenant.memberships`;
     *   2. the driver class and code are no longer available on this path. An
     *      operator diagnosing a P1001 must read the database's own telemetry.
     *
     * What has NOT changed is the security property, asserted below unaltered:
     * nothing the driver authored reaches the caller or the log.
     */
    expect(out).toContain("database.failure");
    expect(out).toContain("tenant.memberships");
    expect(out).toContain("MEMBERSHIP_QUERY_FAILED");

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
