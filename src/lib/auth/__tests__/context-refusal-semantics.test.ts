/**
 * PHASE 107 STAGE 6-A — the two remaining helpers must say WHY they refused.
 *
 * `requireOrgContext` (10 callers) and `requirePlatformAuth` (71 callers) both
 * answered 401 for every cause. Three of those causes are materially different:
 *
 *   - no session — signing in fixes it;
 *   - a valid session with no ACTIVE organization — signing in changes nothing;
 *   - the organization store was unreachable — nothing is wrong with the caller
 *     at all, and telling them to sign in during a database outage sends an
 *     operator to a login form while the incident continues.
 *
 * These exercise the REAL helpers. The security properties that motivated the
 * original flattening are asserted, not assumed: every PRE-authentication
 * refusal stays a uniform, indistinguishable 401, and no response names an
 * organization or reveals whether one exists.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const getAuthRole = vi.fn();
const verifyAccessToken = vi.fn();
const getPrisma = vi.fn();
const getStorageMode = vi.fn();
const isPayloadSessionActive = vi.fn();
const verifyApiKey = vi.fn();

vi.mock("@/lib/auth/rbac-server", () => ({ getAuthRole: (r: unknown) => getAuthRole(r) }));
vi.mock("@/lib/auth/jwt", () => ({ verifyAccessToken: (t: unknown) => verifyAccessToken(t) }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: () => getPrisma() }));
vi.mock("@/lib/storage/storage-mode", () => ({
  getStorageMode: () => getStorageMode(),
  isDatabaseMode: () => getStorageMode() === "database",
}));
vi.mock("@/lib/auth/session-store", () => ({ isPayloadSessionActive: (p: unknown) => isPayloadSessionActive(p) }));
vi.mock("@/lib/api/keys", () => ({ verifyApiKey: (k: unknown) => verifyApiKey(k), touchLastUsed: vi.fn() }));
vi.mock("@/lib/logger/security-events", () => ({
  logAuthFailure: vi.fn(), logAuthzDenial: vi.fn(), logInfraFailure: vi.fn(),
}));

const { requireOrgContext, resolveOrgContext } = await import("@/lib/billing/context");
const { requirePlatformAuth } = await import("@/lib/api/auth");
const { REFUSAL_STATUS } = await import("../context-result");
const { orgActorRefusalCode } = await import("@/lib/org/context");

const req = (cookie = true) =>
  new NextRequest("http://localhost/api/x", {
    headers: cookie ? { cookie: "hermes_at=token" } : {},
  });

/** A verified session whose membership lookup the test controls. */
const signedIn = (member: Record<string, unknown> | null, mode = "database") => {
  getAuthRole.mockResolvedValue("admin");
  verifyAccessToken.mockResolvedValue({ sub: "user-1" });
  isPayloadSessionActive.mockResolvedValue(true);
  getStorageMode.mockReturnValue(mode);
  getPrisma.mockResolvedValue({ organizationMember: { findFirst: async () => member } });
};
const signedOut = () => {
  getAuthRole.mockResolvedValue(null);
  verifyAccessToken.mockResolvedValue(null);
  isPayloadSessionActive.mockResolvedValue(false);
  getStorageMode.mockReturnValue("database");
  getPrisma.mockResolvedValue(null);
};

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

const refusalOf = (r: unknown) => r as { error: string; status: number; code?: string };

describe("requireOrgContext — billing and its nine routes", () => {
  it("1. no session → 401", async () => {
    signedOut();
    expect(refusalOf(await requireOrgContext(req(false)))).toMatchObject({ status: 401, code: "AUTHENTICATION_REQUIRED" });
  });

  it("2. an invalid or expired token → 401", async () => {
    getAuthRole.mockResolvedValue("admin");
    verifyAccessToken.mockResolvedValue(null);
    getStorageMode.mockReturnValue("database");
    getPrisma.mockResolvedValue(null);
    expect(refusalOf(await requireOrgContext(req()))).toMatchObject({ status: 401, code: "AUTHENTICATION_REQUIRED" });
  });

  it("3. a valid session with no ACTIVE membership → 409, not 401", async () => {
    signedIn(null);
    const r = refusalOf(await requireOrgContext(req()));
    expect(r).toMatchObject({ status: 409, code: "ORGANIZATION_CONTEXT_REQUIRED" });
  });

  it("4. a valid session WITH a membership passes through", async () => {
    signedIn({ organizationId: "org-1", role: "admin" });
    expect(await requireOrgContext(req())).toMatchObject({ ctx: { orgId: "org-1" } });
  });

  it("5. an unreachable store in database mode → 500, never 401 or 409", async () => {
    getAuthRole.mockResolvedValue("admin");
    verifyAccessToken.mockResolvedValue({ sub: "user-1" });
    getStorageMode.mockReturnValue("database");
    getPrisma.mockResolvedValue(null);          // outage
    const r = refusalOf(await requireOrgContext(req()));
    expect(r).toMatchObject({ status: 500, code: "INTERNAL_ERROR" });
  });

  it("6. session mode has no organization store by design → 409, not 500", async () => {
    getAuthRole.mockResolvedValue("admin");
    verifyAccessToken.mockResolvedValue({ sub: "user-1" });
    getStorageMode.mockReturnValue("session");
    getPrisma.mockResolvedValue(null);
    expect(refusalOf(await requireOrgContext(req()))).toMatchObject({ status: 409, code: "ORGANIZATION_CONTEXT_REQUIRED" });
  });

  it("7. a SUSPENDED member is still refused — ACTIVE is required", async () => {
    // The query filters on status ACTIVE; a suspended row simply does not match.
    signedIn(null);
    expect(refusalOf(await requireOrgContext(req())).status).not.toBe(200);
    expect(await resolveOrgContext(req())).toMatchObject({ ok: false });
  });

  it("7b. the membership lookup filters on ACTIVE — a suspended row must not match", async () => {
    /*
     * Asserted on the QUERY, not on a stubbed answer. A test that only controls
     * what `findFirst` returns cannot notice the `status: "ACTIVE"` filter being
     * removed, and a suspended member would silently regain access to every
     * org-scoped route. The mutation proof found exactly that hole.
     */
    const seen: Array<Record<string, unknown>> = [];
    getAuthRole.mockResolvedValue("admin");
    verifyAccessToken.mockResolvedValue({ sub: "user-1" });
    getStorageMode.mockReturnValue("database");
    getPrisma.mockResolvedValue({
      organizationMember: {
        findFirst: async (args: { where: Record<string, unknown> }) => {
          seen.push(args.where);
          return null;
        },
      },
    });

    await requireOrgContext(req());
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toMatchObject({ status: "ACTIVE" });
  });

  it("5b. a membership query that THROWS is 500, never 409", async () => {
    /*
     * The defect this closes. `getOrgContext` caught the exception and returned
     * null; `resolveOrgContext` then re-queried, found a healthy client, and
     * concluded "this account has no organization" — reporting a database fault
     * to the user as a fact about their account, and hiding the incident.
     */
    getAuthRole.mockResolvedValue("admin");
    verifyAccessToken.mockResolvedValue({ sub: "user-1" });
    getStorageMode.mockReturnValue("database");
    getPrisma.mockResolvedValue({
      organizationMember: {
        findFirst: async () => { throw new Error("connect ECONNREFUSED 10.0.0.5:5432"); },
      },
    });

    const r = refusalOf(await requireOrgContext(req()));
    expect(r).toMatchObject({ status: 500, code: "INTERNAL_ERROR" });
    // The driver's message must never travel with it.
    expect(JSON.stringify(r)).not.toMatch(/ECONNREFUSED|10\.0\.0|5432/);
  });

  it("5c. the store is queried exactly ONCE per resolution", async () => {
    // A second lookup is what made the reconstruction possible in the first
    // place; counting the calls is what keeps it from coming back.
    let calls = 0;
    getAuthRole.mockResolvedValue("admin");
    verifyAccessToken.mockResolvedValue({ sub: "user-1" });
    getStorageMode.mockReturnValue("database");
    getPrisma.mockResolvedValue({
      organizationMember: { findFirst: async () => { calls++; return null; } },
    });

    await resolveOrgContext(req());
    expect(calls).toBe(1);
  });

  it("8. no refusal names an organization or reveals that one exists", async () => {
    signedIn(null);
    const a = JSON.stringify(await requireOrgContext(req()));
    signedOut();
    const b = JSON.stringify(await requireOrgContext(req(false)));
    for (const body of [a, b]) {
      expect(body).not.toMatch(/org-1|organizationId|user-1/);
    }
  });
});

describe("requirePlatformAuth — the API platform and its 71 routes", () => {
  it("9. no credential → 401", async () => {
    signedOut();
    expect(refusalOf(await requirePlatformAuth(req(false)))).toMatchObject({ status: 401, code: "AUTHENTICATION_REQUIRED" });
  });

  it("10. a revoked session → 401, indistinguishable from having no session", async () => {
    getAuthRole.mockResolvedValue("admin");
    verifyAccessToken.mockResolvedValue({ sub: "user-1" });
    isPayloadSessionActive.mockResolvedValue(false);   // revoked
    getStorageMode.mockReturnValue("database");
    getPrisma.mockResolvedValue(null);
    const revoked = refusalOf(await requirePlatformAuth(req()));

    signedOut();
    const absent = refusalOf(await requirePlatformAuth(req(false)));

    // Anti-enumeration: a caller who has not proved who they are learns nothing.
    expect(revoked.status).toBe(401);
    expect(revoked.error).toBe(absent.error);
    expect(revoked.code).toBe(absent.code);
  });

  it("11. a valid session with no ACTIVE membership → 409", async () => {
    signedIn(null);
    expect(refusalOf(await requirePlatformAuth(req()))).toMatchObject({
      status: 409, code: "ORGANIZATION_CONTEXT_REQUIRED",
    });
  });

  it("11b. session mode has no organization store, so the platform agrees with billing", async () => {
    /*
     * `organization_resolution_failed` means two different things. In DATABASE
     * mode a missing client is an outage; in SESSION mode there is no store at
     * all by design. Without this distinction the two unified helpers disagreed
     * on the same deployment — billing answered 409 while the platform answered
     * 500, claiming an outage that was not happening.
     */
    getAuthRole.mockResolvedValue("admin");
    verifyAccessToken.mockResolvedValue({ sub: "user-1" });
    isPayloadSessionActive.mockResolvedValue(true);
    getStorageMode.mockReturnValue("session");
    getPrisma.mockResolvedValue(null);

    const platform = refusalOf(await requirePlatformAuth(req()));
    const billing = refusalOf(await requireOrgContext(req()));
    expect(platform).toMatchObject({ status: 409, code: "ORGANIZATION_CONTEXT_REQUIRED" });
    expect(billing.status).toBe(platform.status);
    expect(billing.code).toBe(platform.code);
  });

  it("12. a database fault → 500, never 401", async () => {
    getAuthRole.mockResolvedValue("admin");
    verifyAccessToken.mockResolvedValue({ sub: "user-1" });
    isPayloadSessionActive.mockResolvedValue(true);
    getStorageMode.mockReturnValue("database");
    getPrisma.mockResolvedValue({
      organizationMember: { findFirst: async () => { throw new Error("connect ECONNREFUSED"); } },
    });
    const r = refusalOf(await requirePlatformAuth(req()));
    expect(r.status).toBe(500);
    expect(r.code).toBe("INTERNAL_ERROR");
    // The driver's message must never reach the caller.
    expect(JSON.stringify(r)).not.toMatch(/ECONNREFUSED|connect/i);
  });

  it("13. a valid session WITH a membership passes through", async () => {
    signedIn({ organizationId: "org-7", role: "admin" });
    expect(await requirePlatformAuth(req())).toMatchObject({ ctx: { orgId: "org-7" } });
  });

  it("14. a caller-supplied organizationId is never honoured", async () => {
    signedIn({ organizationId: "org-server", role: "admin" });
    const result = await requirePlatformAuth(
      new NextRequest("http://localhost/api/x?organizationId=org-attacker", {
        headers: { cookie: "hermes_at=token" },
      }),
    );
    expect(result).toMatchObject({ ctx: { orgId: "org-server" } });
  });
});

describe("pre-authentication refusals are indistinguishable — all four", () => {
  /*
   * PHASE 107 STAGE 6-A.1 — the review found this proof incomplete. It compared
   * three reasons and claimed four; `invalid_api_key` is a REAL fourth path
   * (bearer token with the key prefix) and was never exercised, so a change to
   * its mapping alone would have gone unnoticed.
   *
   * The comparison is byte-for-byte on the serialized response. A prober who
   * cannot authenticate must not be able to tell "no credential" from "malformed
   * token" from "revoked session" from "unusable API key" — because each of those
   * answers, if distinguishable, tells them something true about an account.
   */
  const keyRequest = () =>
    new NextRequest("http://localhost/api/x", {
      headers: { authorization: "Bearer hk_deadbeefdeadbeefdeadbeef" },
    });

  it("16. all four pre-authentication reasons serialize identically", async () => {
    const answers: string[] = [];

    // 1. no credential at all
    signedOut();
    answers.push(JSON.stringify(await requirePlatformAuth(req(false))));

    // 2. a token that fails verification
    getAuthRole.mockResolvedValue("admin");
    verifyAccessToken.mockResolvedValue(null);
    getStorageMode.mockReturnValue("database");
    getPrisma.mockResolvedValue(null);
    answers.push(JSON.stringify(await requirePlatformAuth(req())));

    // 3. a verified token whose session has been revoked
    verifyAccessToken.mockResolvedValue({ sub: "user-1" });
    isPayloadSessionActive.mockResolvedValue(false);
    answers.push(JSON.stringify(await requirePlatformAuth(req())));

    // 4. an API key that does not resolve — the case the proof was missing
    verifyApiKey.mockResolvedValue(null);
    answers.push(JSON.stringify(await requirePlatformAuth(keyRequest())));

    expect(answers).toHaveLength(4);
    expect(new Set(answers).size, `four answers, ${new Set(answers).size} distinct: ${answers.join(" | ")}`).toBe(1);
    expect(JSON.parse(answers[0])).toMatchObject({ status: 401, code: "AUTHENTICATION_REQUIRED" });
  });

  it("17. requireOrgContext is equally uniform across absent, invalid and revoked identity", async () => {
    const answers: string[] = [];

    signedOut();
    answers.push(JSON.stringify(await requireOrgContext(req(false))));

    getAuthRole.mockResolvedValue("admin");
    verifyAccessToken.mockResolvedValue(null);
    getStorageMode.mockReturnValue("database");
    getPrisma.mockResolvedValue(null);
    answers.push(JSON.stringify(await requireOrgContext(req())));

    // A revoked session fails `getAuthRole` in this helper's chain.
    getAuthRole.mockResolvedValue(null);
    verifyAccessToken.mockResolvedValue({ sub: "user-1" });
    answers.push(JSON.stringify(await requireOrgContext(req())));

    expect(new Set(answers).size, `distinct: ${answers.join(" | ")}`).toBe(1);
  });
});

describe("the status contract itself", () => {
  it("15. every refusal keeps its own status — none collapse", () => {
    expect(REFUSAL_STATUS.AUTHENTICATION_REQUIRED).toBe(401);
    expect(REFUSAL_STATUS.ORGANIZATION_CONTEXT_REQUIRED).toBe(409);
    expect(REFUSAL_STATUS.SITE_CONTEXT_REQUIRED).toBe(409);
    expect(REFUSAL_STATUS.FORBIDDEN).toBe(403);
    expect(REFUSAL_STATUS.INTERNAL_ERROR).toBe(500);

    // 401, 403, 409 and 500 must remain four different answers.
    expect(new Set([
      REFUSAL_STATUS.AUTHENTICATION_REQUIRED,
      REFUSAL_STATUS.FORBIDDEN,
      REFUSAL_STATUS.ORGANIZATION_CONTEXT_REQUIRED,
      REFUSAL_STATUS.INTERNAL_ERROR,
    ]).size).toBe(4);
  });
});

describe("orgActorRefusalCode — requireOrgActor refuses for TWO reasons", () => {
  /*
   * PHASE 107 STAGE 6-A.2 — found by the AST refusal detector, in guards this
   * stage had never looked at.
   *
   * `requireOrgActor` answers 401 when there is no usable session (absent,
   * unverifiable, or REVOKED) and 403 when the caller is authenticated but not
   * a member. Five call sites forwarded that status and hard-coded
   * `ORGANIZATION_SCOPE_REQUIRED` next to it, so a revoked session produced
   * `401 ORGANIZATION_SCOPE_REQUIRED` — the status said "sign in", the body
   * said "you lack organization scope", and the UI branches on the body.
   */
  it("401 — no usable session — is an AUTHENTICATION problem", () => {
    expect(orgActorRefusalCode(401)).toBe("AUTHENTICATION_REQUIRED");
  });

  it("403 — authenticated but not a member — is an ORGANIZATION SCOPE problem", () => {
    expect(orgActorRefusalCode(403)).toBe("ORGANIZATION_SCOPE_REQUIRED");
  });

  it("never labels a 401 as an organization-scope problem", () => {
    // The exact contradiction that shipped, named so a regression is unambiguous.
    expect(`401:${orgActorRefusalCode(401)}`).not.toBe("401:ORGANIZATION_SCOPE_REQUIRED");
  });

  it("falls back to FORBIDDEN for any status it was not taught", () => {
    // Fail closed: an unfamiliar refusal must not be described as a login problem.
    expect(orgActorRefusalCode(418)).toBe("FORBIDDEN");
    expect(orgActorRefusalCode(500)).toBe("FORBIDDEN");
  });
});
