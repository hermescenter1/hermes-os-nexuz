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
/*
 * PHASE 110-A1.0b — identity for the billing path now comes from
 * `getUserIdFromRequest`, which verifies the signature AND checks session
 * revocation. The old path used a bare `verifyAccessToken`, so a revoked
 * session kept working here until the token expired. The mock honours the
 * revocation flag the rest of this file already controls, so "revoked" means
 * revoked on this path too.
 */
vi.mock("@/lib/org/context", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getUserIdFromRequest: async () => {
    const payload = await verifyAccessToken("token");
    if (!payload?.sub) return null;
    return (await isPayloadSessionActive(payload)) ? payload.sub : null;
  },
}));
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

/**
 * A verified session whose membership lookup the test controls.
 *
 * PHASE 110-A1.0b — the ports changed shape, deliberately. `findFirst` cannot
 * distinguish one membership from several, which is why the resolver uses
 * `findMany`; and the organization row must load for a context to exist, so
 * `findUnique` is part of the contract now. The helper keeps its old
 * one-membership-or-none signature so every case below reads the same.
 */
const signedIn = (member: Record<string, unknown> | null, mode = "database") => {
  getAuthRole.mockResolvedValue("admin");
  verifyAccessToken.mockResolvedValue({ sub: "user-1" });
  isPayloadSessionActive.mockResolvedValue(true);
  getStorageMode.mockReturnValue(mode);
  const rows = member ? [{ status: "ACTIVE", ...member }] : [];
  getPrisma.mockResolvedValue({
    organizationMember: {
      // Both shapes, and they agree. `requireOrgContext` (adopted) reads every
      // row with findMany; `requirePlatformAuth` (NOT adopted in this slice)
      // still uses findFirst with its own ACTIVE filter. Feeding one and not
      // the other would make a platform test fail for a reason that has nothing
      // to do with what it asserts.
      findMany: async () => rows,
      findFirst: async () => (rows.length > 0 ? rows[0] : null),
    },
    organization: {
      findUnique: async (a: { where: { id: string } }) => ({ id: a.where.id, slug: `slug-${a.where.id}` }),
    },
  });
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
    signedIn({ organizationId: "org-1", role: "ADMIN" });
    expect(await requireOrgContext(req())).toMatchObject({ ctx: { orgId: "org-1" } });
  });

  it("5. an unreachable store in database mode → 503, never 401 or 409", async () => {
    /*
     * PHASE 110-A1.0b — 503 where this used to assert 500, and that is the
     * point of the change rather than an accommodation to it. The property the
     * original test defended is untouched and still asserted: an outage is
     * never 401 and never 409, because it is not a fact about the caller.
     * What improved is the class of the answer — 500 reads as "the application
     * is broken", 503 as "a dependency is not answering, retry", and only the
     * second is true. `INTERNAL_ERROR` keeps its 500 for every other caller.
     */
    getAuthRole.mockResolvedValue("admin");
    verifyAccessToken.mockResolvedValue({ sub: "user-1" });
    isPayloadSessionActive.mockResolvedValue(true);
    getStorageMode.mockReturnValue("database");
    getPrisma.mockResolvedValue(null);          // outage
    const r = refusalOf(await requireOrgContext(req()));
    expect(r).toMatchObject({ status: 503, code: "ORGANIZATION_CONTEXT_UNAVAILABLE" });
    expect(r.status).not.toBe(401);
    expect(r.status).not.toBe(409);
  });

  it("6. session mode has no organization store, so the question cannot be asked", async () => {
    /*
     * PHASE 110-A1.0b — this asserted 409 ORGANIZATION_CONTEXT_REQUIRED, i.e.
     * "you have no organization". The reviewed Phase 110-A1.0 core classifies a
     * missing store as MEMBERSHIP_UNAVAILABLE with the diagnostic
     * ORGANIZATION_STORE_DISABLED, and this layer carries that through as 503.
     *
     * The core is right and the old answer was not. In session mode the account
     * may well belong to an organization; there is simply nowhere to ask. "You
     * have no organization" is a claim about the caller that this deployment
     * has no evidence for — the same class of mistake as reporting an outage as
     * an empty account, which the test above exists to prevent.
     */
    getAuthRole.mockResolvedValue("admin");
    verifyAccessToken.mockResolvedValue({ sub: "user-1" });
    isPayloadSessionActive.mockResolvedValue(true);
    getStorageMode.mockReturnValue("session");
    getPrisma.mockResolvedValue(null);
    expect(refusalOf(await requireOrgContext(req()))).toMatchObject({
      status: 503, code: "ORGANIZATION_CONTEXT_UNAVAILABLE",
    });
  });

  it("7. a SUSPENDED member is still refused — ACTIVE is required", async () => {
    // Only an ACTIVE membership grants context; see 7b for the direct proof.
    signedIn(null);
    expect(refusalOf(await requireOrgContext(req())).status).not.toBe(200);
    expect(await resolveOrgContext(req())).toMatchObject({ ok: false });
  });

  it("7b. a non-ACTIVE row must not grant — asserted on behaviour, not on a query", async () => {
    /*
     * PHASE 110-A1.0b — REWRITTEN, AND STRICTLY STRONGER.
     *
     * This used to inspect the `where` clause for `status: "ACTIVE"`. The filter
     * is no longer in the query: the resolver reads every row with `findMany`
     * (it has to, or it could not tell one membership from several) and applies
     * the ACTIVE allow-list itself. Pinning the old `where` would pin an
     * implementation that is gone.
     *
     * What the original test was defending — a suspended member must not regain
     * access — is asserted directly instead, by FEEDING a non-ACTIVE row and
     * requiring that no context comes back. That is the property; the query
     * shape was only ever a proxy for it, and this version also covers INVITED,
     * which the `where`-clause assertion never did.
     */
    for (const status of ["SUSPENDED", "INVITED"]) {
      signedIn({ organizationId: "org-1", role: "ADMIN", status });
      const r = await resolveOrgContext(req());
      expect(r, `${status} must not resolve a context`).toMatchObject({ ok: false });
      expect(JSON.stringify(r), "and must not carry an organization").not.toMatch(/org-1/);
    }
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
    isPayloadSessionActive.mockResolvedValue(true);
    getStorageMode.mockReturnValue("database");
    getPrisma.mockResolvedValue({
      organizationMember: {
        findMany: async () => { throw new Error("connect ECONNREFUSED 10.0.0.5:5432"); },
      },
      organization: { findUnique: async () => null },
    });

    const r = refusalOf(await requireOrgContext(req()));
    // PHASE 110-A1.0b — 503 rather than 500; the invariant this test defends is
    // that it is NEVER 409, and that is asserted explicitly below.
    expect(r).toMatchObject({ status: 503, code: "ORGANIZATION_CONTEXT_UNAVAILABLE" });
    expect(r.status).not.toBe(409);
    // The driver's message must never travel with it.
    expect(JSON.stringify(r)).not.toMatch(/ECONNREFUSED|10\.0\.0|5432/);
  });

  it("5c. the store is queried exactly ONCE per resolution", async () => {
    // A second lookup is what made the reconstruction possible in the first
    // place; counting the calls is what keeps it from coming back.
    let calls = 0;
    getAuthRole.mockResolvedValue("admin");
    verifyAccessToken.mockResolvedValue({ sub: "user-1" });
    isPayloadSessionActive.mockResolvedValue(true);
    getStorageMode.mockReturnValue("database");
    getPrisma.mockResolvedValue({
      organizationMember: { findMany: async () => { calls++; return []; } },
      organization: { findUnique: async () => null },
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

  it("11b. session mode: the platform still answers 409, and billing no longer agrees", async () => {
    /*
     * `organization_resolution_failed` means two different things. In DATABASE
     * mode a missing client is an outage; in SESSION mode there is no store at
     * all by design. Without this distinction the two unified helpers disagreed
     * on the same deployment — billing answered 409 while the platform answered
     * 500, claiming an outage that was not happening.
     *
     * PHASE 110-A1.0b — THE AGREEMENT THIS TEST PINNED IS BROKEN, ON PURPOSE
     * AND ONLY HALFWAY, AND THAT IS RECORDED HERE RATHER THAN PAPERED OVER.
     *
     * `requireOrgContext` was adopted onto the Phase 110-A1.0 resolver, which
     * classifies a missing store as "the question could not be asked" (503).
     * `requirePlatformAuth` was NOT adopted — `src/lib/api/auth.ts` is outside
     * this slice's allowlist — so it still answers 409 "you have no
     * organization".
     *
     * So on a session-mode deployment the two helpers now say different things
     * about the same account. Neither is unsafe: both refuse, neither names an
     * organization, and neither grants anything. But it is a real divergence,
     * it is carried as follow-up work, and this test asserts what is ACTUALLY
     * true today instead of an agreement that no longer exists. Making it green
     * by asserting the old equality would have hidden the gap; making it green
     * by adopting the platform helper here would have edited a forbidden path.
     */
    getAuthRole.mockResolvedValue("admin");
    verifyAccessToken.mockResolvedValue({ sub: "user-1" });
    isPayloadSessionActive.mockResolvedValue(true);
    getStorageMode.mockReturnValue("session");
    getPrisma.mockResolvedValue(null);

    const platform = refusalOf(await requirePlatformAuth(req()));
    const billing = refusalOf(await requireOrgContext(req()));

    expect(platform).toMatchObject({ status: 409, code: "ORGANIZATION_CONTEXT_REQUIRED" });
    expect(billing).toMatchObject({ status: 503, code: "ORGANIZATION_CONTEXT_UNAVAILABLE" });

    // The property that actually matters is still asserted on BOTH: a refusal,
    // no organization named, and nothing granted.
    for (const r of [platform, billing]) {
      expect(r.status).not.toBe(200);
      expect(JSON.stringify(r)).not.toMatch(/org-|organizationId|user-1/);
    }
  });

  it("12. a database fault → 503, never 401", async () => {
    getAuthRole.mockResolvedValue("admin");
    verifyAccessToken.mockResolvedValue({ sub: "user-1" });
    isPayloadSessionActive.mockResolvedValue(true);
    getStorageMode.mockReturnValue("database");
    getPrisma.mockResolvedValue({
      // PHASE 110-A1.0b R5 — `findMany` is what the tenant resolver calls now;
      // `findFirst` is kept and still throws, so a regression to the removed
      // earliest-membership lookup fails here rather than passing quietly.
      organizationMember: {
        findFirst: async () => { throw new Error("connect ECONNREFUSED"); },
        findMany:  async () => { throw new Error("connect ECONNREFUSED"); },
      },
    });
    const r = refusalOf(await requirePlatformAuth(req()));

    /*
     * PHASE 110-A1.0b R5 — A DELIBERATE CONTRACT CHANGE on these 71 routes:
     * 500 INTERNAL_ERROR -> 503 ORGANIZATION_CONTEXT_UNAVAILABLE.
     *
     * `requirePlatformAuth` no longer resolves the tenant with its own
     * earliest-membership `findFirst`; it asks the selection-aware resolver,
     * which classifies an unreachable membership store as MEMBERSHIP_UNAVAILABLE.
     *
     * The new status is the one this repository already argues for, in
     * `src/lib/auth/context-result.ts`: "503, not 500 … 500 reads as 'the
     * application is broken', 503 as 'a dependency is not answering, try again'".
     * The billing path has answered 503 for this condition since Phase
     * 110-A1.0b; the platform path answering 500 was half of the divergence R3
     * recorded as OPEN, and this closes that half deliberately.
     *
     * The point of the case is unchanged and still asserted: it is NEVER 401,
     * and the driver's message never reaches the caller.
     */
    expect(r.status).toBe(503);
    expect(r.status).not.toBe(401);
    expect(r.code).toBe("ORGANIZATION_CONTEXT_UNAVAILABLE");
    // The driver's message must never reach the caller.
    expect(JSON.stringify(r)).not.toMatch(/ECONNREFUSED|connect/i);
  });

  it("13. a valid session WITH a membership passes through", async () => {
    signedIn({ organizationId: "org-7", role: "ADMIN" });
    expect(await requirePlatformAuth(req())).toMatchObject({ ctx: { orgId: "org-7" } });
  });

  it("14. a caller-supplied organizationId is never honoured", async () => {
    signedIn({ organizationId: "org-server", role: "ADMIN" });
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
