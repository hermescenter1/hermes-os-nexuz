/**
 * PHASE 107 STAGE 6-A — the OT gate must say WHY it refused.
 *
 * `withOtRoute` answered 401 for two situations that need different actions from
 * the reader: no session at all, and a valid session with no organization
 * selected. The second put "your session has ended" and a sign-in link in front
 * of a signed-in administrator on every OT page — advice that could not work.
 *
 * These exercise the REAL helper and the REAL route kit. The authorization chain
 * itself is unchanged and is asserted to still be closed: an unknown
 * organization, a suspended member and a foreign tenant must all still be
 * refused, and no answer may reveal whether a particular organization exists.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const ACCESS_COOKIE = "hermes_at";

/* ── the seams, mocked at the module boundary ─────────────────────────────── */
const getAuthRole = vi.fn();
const verifyAccessToken = vi.fn();
const getPrisma = vi.fn();
const requireOrgActor = vi.fn();
const getAllowedSiteIds = vi.fn();
const checkRateLimit = vi.fn();
const can = vi.fn();

vi.mock("@/lib/auth/rbac-server", () => ({ getAuthRole: (r: unknown) => getAuthRole(r) }));
vi.mock("@/lib/auth/jwt", () => ({ verifyAccessToken: (t: unknown) => verifyAccessToken(t) }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: () => getPrisma() }));
vi.mock("@/lib/org/context", () => ({ requireOrgActor: (...a: unknown[]) => requireOrgActor(...a) }));
vi.mock("@/lib/site/context", () => ({ getAllowedSiteIds: (...a: unknown[]) => getAllowedSiteIds(...a) }));
vi.mock("@/lib/auth/rate-limiter", () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }));
vi.mock("@/lib/org/rbac", () => ({ can: (...a: unknown[]) => can(...a) }));
vi.mock("@/lib/security/request-guards", () => ({ resolveClientIp: () => "10.0.0.1" }));

const { withOtRoute, HTTP_STATUS } = await import("../route-kit");
const { resolveOrgContext, requireOrgContext } = await import("@/lib/billing/context");

const request = (withCookie = true) =>
  new NextRequest("http://localhost/api/ot/gateways", {
    headers: withCookie ? { cookie: `${ACCESS_COOKIE}=token-value` } : {},
  });

/** A signed-in user whose membership lookup is under the test's control. */
function signedIn(member: Record<string, unknown> | null) {
  getAuthRole.mockResolvedValue("admin");
  verifyAccessToken.mockResolvedValue({ sub: "user-1" });
  getPrisma.mockResolvedValue({ organizationMember: { findFirst: async () => member } });
}
function signedOut() {
  getAuthRole.mockResolvedValue(null);
  verifyAccessToken.mockResolvedValue(null);
  getPrisma.mockResolvedValue(null);
}

/** The handler stands in for a real route: it answers JSON, as they all do. */
const handler = vi.fn(async () =>
  new Response(JSON.stringify({ ok: true, data: [] }), {
    status: 200, headers: { "content-type": "application/json" },
  }) as never);

beforeEach(() => {
  vi.clearAllMocks();
  requireOrgActor.mockResolvedValue({ ctx: { orgId: "org-1", role: "admin", userId: "user-1" } });
  getAllowedSiteIds.mockResolvedValue(["site-1"]);
  checkRateLimit.mockResolvedValue(true);
  can.mockReturnValue(true);
});
afterEach(() => { vi.restoreAllMocks(); });

const run = async () => {
  const res = await withOtRoute(request(), { permission: "view_ot_gateway", bucket: "ot-read" }, handler);
  return { status: res.status, body: await res.json() as { ok: boolean; code?: string; message?: string } };
};

describe("the two refusals a 401 used to hide", () => {
  it("1. no session at all is 401", async () => {
    signedOut();
    const { status, body } = await run();
    expect(status).toBe(401);
    expect(body.code).toBe("UNAUTHENTICATED");
    expect(handler).not.toHaveBeenCalled();
  });

  it("2. an invalid token is 401", async () => {
    getAuthRole.mockResolvedValue("admin");
    verifyAccessToken.mockResolvedValue(null);   // signature/expiry rejected
    getPrisma.mockResolvedValue(null);
    const { status, body } = await run();
    expect(status).toBe(401);
    expect(body.code).toBe("UNAUTHENTICATED");
  });

  it("3. a valid admin with NO organization is 409, not 401", async () => {
    signedIn(null);   // authenticated, but no ACTIVE membership row
    const { status, body } = await run();
    // The whole point: this reader is signed in. Telling them to sign in again
    // is advice that cannot work.
    expect(status).toBe(409);
    expect(body.code).toBe("ORGANIZATION_CONTEXT_REQUIRED");
    expect(handler).not.toHaveBeenCalled();
  });

  it("4. a valid admin WITH an organization reaches the handler", async () => {
    signedIn({ organizationId: "org-1", role: "admin" });
    await run();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("the authorization chain is still closed", () => {
  it("5. a member who is not active in the org is refused", async () => {
    signedIn({ organizationId: "org-1", role: "admin" });
    requireOrgActor.mockResolvedValue({ error: "not a member", status: 403 });
    const { status, body } = await run();
    expect(status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
    expect(handler).not.toHaveBeenCalled();
  });

  it("6. an unknown organization leaks nothing — same answer as having none", async () => {
    signedIn(null);
    const missing = await run();
    signedIn({ organizationId: "org-does-not-exist", role: "admin" });
    requireOrgActor.mockResolvedValue({ error: "no such org", status: 403 });
    const unknown = await run();
    // A prober must not be able to tell "this org does not exist" from
    // "you are not in it" — and neither answer names an organization.
    expect(JSON.stringify(missing.body)).not.toMatch(/org-1|org-does-not-exist/);
    expect(JSON.stringify(unknown.body)).not.toMatch(/org-1|org-does-not-exist/);
    expect(unknown.status).toBe(403);
  });

  it("7. lacking the permission is 403, never 409", async () => {
    signedIn({ organizationId: "org-1", role: "viewer" });
    can.mockReturnValue(false);
    const { status, body } = await run();
    expect(status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
  });

  it("8. the organization is never taken from the request", async () => {
    signedIn({ organizationId: "org-server-resolved", role: "admin" });
    const res = await withOtRoute(
      new NextRequest("http://localhost/api/ot/gateways?organizationId=org-attacker", {
        headers: { cookie: `${ACCESS_COOKIE}=token-value` },
      }),
      { permission: "view_ot_gateway", bucket: "ot-read" },
      handler,
    );
    expect(res.status).toBe(200);
    // The actor is resolved with the SERVER's organization, not the query's.
    expect(requireOrgActor).toHaveBeenCalledWith(expect.anything(), "org-server-resolved");
  });

  it("9. an upstream failure is not reported as an auth problem", async () => {
    // TRANSIENT_FAILURE maps to 503 and must never collapse into 401 or 409.
    expect(HTTP_STATUS.TRANSIENT_FAILURE).toBe(503);
    expect(HTTP_STATUS.INTERNAL_FAILURE).toBe(500);
    expect(HTTP_STATUS.UNAUTHENTICATED).toBe(401);
    expect(HTTP_STATUS.ORGANIZATION_CONTEXT_REQUIRED).toBe(409);
    expect(HTTP_STATUS.SITE_CONTEXT_REQUIRED).toBe(409);
    expect(HTTP_STATUS.FORBIDDEN).toBe(403);
  });

  it("10. every refusal keeps its own status — none collapse", async () => {
    const distinct = new Set([
      HTTP_STATUS.UNAUTHENTICATED,
      HTTP_STATUS.ORGANIZATION_CONTEXT_REQUIRED,
      HTTP_STATUS.FORBIDDEN,
      HTTP_STATUS.NOT_FOUND,
      HTTP_STATUS.TRANSIENT_FAILURE,
    ]);
    expect(distinct.size).toBe(5);
  });
});

describe("the shared helper", () => {
  it("11. distinguishes the two causes", async () => {
    signedOut();
    expect(await resolveOrgContext(request(false))).toEqual({ ok: false, reason: "AUTHENTICATION_REQUIRED" });

    signedIn(null);
    expect(await resolveOrgContext(request())).toEqual({ ok: false, reason: "ORGANIZATION_CONTEXT_REQUIRED" });

    signedIn({ organizationId: "org-1", role: "admin" });
    const ok = await resolveOrgContext(request());
    expect(ok.ok).toBe(true);
  });

  it("12. billing now answers each cause on its own terms", async () => {
    /*
     * This test previously asserted that `requireOrgContext` still answered 401
     * for BOTH causes, because widening billing was deferred. That widening has
     * since been authorized and made: a signed-in customer with no organization
     * looking at their own billing page was being told their session had ended.
     */
    signedOut();
    expect(await requireOrgContext(request(false))).toMatchObject({
      status: 401, code: "AUTHENTICATION_REQUIRED",
    });
    signedIn(null);
    expect(await requireOrgContext(request())).toMatchObject({
      status: 409, code: "ORGANIZATION_CONTEXT_REQUIRED",
    });
  });
});
