/**
 * Phase 86C4B2B1D-SECURITY-4 — Dashboard route protection.
 *
 * Production evidence showed anonymous requests to /fa/dashboard and
 * /en/dashboard returning HTTP 200 with the dashboard shell, while sibling
 * modules (ERP, CRM, CMMS, …) correctly redirected to login. Root cause:
 * the /dashboard subtree was never registered in PROTECTED_PATHS
 * (src/lib/auth/rbac.ts), so middleware's `isProtectedPath` gate — its only
 * page-level auth check — never fired. Classification A of the phase's
 * root-cause taxonomy: missing canonical protected route, not a matcher,
 * locale, session or matrix defect.
 *
 * The fix registers `localePathPattern("dashboard")` and authorizes it with
 * the PRE-EXISTING "dashboard" capability from ROLE_CAPS (roles.ts):
 * superadmin, admin, engineer, customer and vendor hold it; viewer and
 * candidate do not. This suite pins:
 *
 *   - path protection for both locales, trailing slashes and nested routes;
 *   - segment safety (dashboarding/dashboard-public/… stay unprotected);
 *   - the capability-derived role matrix;
 *   - session-decode rejection of missing/malformed/tampered/expired tokens;
 *   - real middleware behavior: anonymous and unauthorized requests receive
 *     a 307 redirect to the locale-correct login carrying `from`, while an
 *     authorized session is not redirected to login;
 *   - the middleware matcher still excludes api/_next/_vercel/files;
 *   - neighboring protected (ERP) and public routes keep their behavior.
 *
 * Convention note (mirrors rbac-path-boundaries.test.ts): middleware denies
 * any request without a decodable role on every path where isProtectedPath()
 * is true, so `isProtectedPath(p) === true` is itself the
 * unauthenticated-denial assertion; the middleware cases below additionally
 * prove the concrete 307 + Location contract.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  isProtectedPath,
  isAuthorizedForPath,
  getRoleFromRequestSync,
} from "@/lib/auth/rbac";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import type { Role } from "@/lib/auth/roles";

// The next-intl v4 middleware entry imports `next/server` with a bare
// specifier that Vitest's resolver cannot follow, so importing the real
// middleware would fail on an unrelated locale-routing dependency. Stub only
// that layer with a pass-through so the REAL auth branch under test (protected
// -path check, sync session decode, authorization, login redirect) executes
// unchanged. The stub returns a 200 NextResponse.next(), matching next-intl's
// non-redirect behavior for the already-localized URLs used here.
vi.mock("next-intl/middleware", () => ({
  default: () => () => NextResponse.next(),
}));

const { middleware, config: middlewareConfig } = await import("@/middleware");

const LOCALES = ["fa", "en"] as const;

/** Roles holding the "dashboard" capability in ROLE_CAPS (roles.ts). */
const DASHBOARD_ROLES: Role[] = [
  "superadmin",
  "admin",
  "engineer",
  "customer",
  "vendor",
];
/** Roles without the "dashboard" capability. */
const NON_DASHBOARD_ROLES: Role[] = ["viewer", "candidate"];

/**
 * Ordinary workspace routes: the generic "dashboard" capability applies.
 *
 * PHASE 87L.6G moved "/dashboard/organization/members" OUT of this list — the
 * three administration surfaces under /dashboard (billing, organization, api)
 * now carry their own domain capabilities and are asserted separately below.
 * They remain PROTECTED paths, so the isProtectedPath coverage is unchanged.
 */
const NESTED_DASHBOARD_ROUTES = [
  "/dashboard/operations",
  "/dashboard/predictive/risk",
  "/dashboard/industrial/assets",
] as const;

/** The 87L.6G administration surfaces — admin/superadmin only. */
const ADMIN_SURFACE_ROUTES = [
  "/dashboard/billing",
  "/dashboard/organization",
  "/dashboard/organization/members",
  "/dashboard/organization/invitations",
  "/dashboard/organization/settings",
  "/dashboard/api",
] as const;

// The sync middleware decoder parses (but does not signature-verify) the JWT,
// so an unsigned three-part token exercises the exact decode path.
function fakeToken(payload: Record<string, unknown>): string {
  const enc = (o: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.test-signature`;
}

function requestFor(path: string, token?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: token
      ? { cookie: `${ACCESS_TOKEN_COOKIE}=${token}` }
      : undefined,
  });
}

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600;
const PAST_EXP = 1_000_000_000; // 2001 — deterministically expired

// ── Path protection ───────────────────────────────────────────────────────────

describe("dashboard route protection — isProtectedPath", () => {
  for (const loc of LOCALES) {
    it(`/${loc}/dashboard is protected, including trailing slash and nested children`, () => {
      expect(isProtectedPath(`/${loc}/dashboard`)).toBe(true);
      expect(isProtectedPath(`/${loc}/dashboard/`)).toBe(true);
      for (const route of [...NESTED_DASHBOARD_ROUTES, ...ADMIN_SURFACE_ROUTES]) {
        expect(isProtectedPath(`/${loc}${route}`)).toBe(true);
        expect(isProtectedPath(`/${loc}${route}/`)).toBe(true);
      }
    });

    it(`/${loc} lookalike paths extending "dashboard" are NOT matched`, () => {
      expect(isProtectedPath(`/${loc}/dashboarding`)).toBe(false);
      expect(isProtectedPath(`/${loc}/dashboard-public`)).toBe(false);
      expect(isProtectedPath(`/${loc}/dashboards`)).toBe(false);
      expect(isProtectedPath(`/${loc}/dashboardخانه`)).toBe(false);
    });
  }

  it("locale-less /dashboard stays unmatched (next-intl redirects it first)", () => {
    expect(isProtectedPath("/dashboard")).toBe(false);
  });

  it("neighboring routes keep their existing policy", () => {
    for (const loc of LOCALES) {
      // ERP stays protected exactly as before this phase.
      expect(isProtectedPath(`/${loc}/erp/inventory`)).toBe(true);
      // Established public routes stay public.
      expect(isProtectedPath(`/${loc}/articles/editors-picks`)).toBe(false);
      expect(isProtectedPath(`/${loc}/vendors`)).toBe(false);
      expect(isProtectedPath(`/${loc}/academy`)).toBe(false);
    }
  });
});

// ── Role matrix (the pre-existing "dashboard" capability) ────────────────────

describe("dashboard route protection — isAuthorizedForPath", () => {
  for (const loc of LOCALES) {
    it(`/${loc}/dashboard follows the ROLE_CAPS "dashboard" capability`, () => {
      for (const path of [
        `/${loc}/dashboard`,
        `/${loc}/dashboard/`,
        ...NESTED_DASHBOARD_ROUTES.map((r) => `/${loc}${r}`),
      ]) {
        for (const role of DASHBOARD_ROLES) {
          expect(isAuthorizedForPath(role, path), `${role} on ${path}`).toBe(true);
        }
        for (const role of NON_DASHBOARD_ROLES) {
          expect(isAuthorizedForPath(role, path), `${role} on ${path}`).toBe(false);
        }
      }
    });
  }

  /**
   * PHASE 87L.6G — the accepted final access contract.
   *
   * This REPLACES the temporary "PINS THE ACTUAL CONTRACT" assertion that
   * merely recorded the observed gap (engineer could reach billing,
   * organization administration and API-key management through the generic
   * "dashboard" capability). That gap is now closed; these assertions describe
   * the intended policy, not the old behaviour.
   */
  for (const loc of LOCALES) {
    it(`/${loc}: engineer is DENIED billing, organization admin and API platform`, () => {
      for (const route of ADMIN_SURFACE_ROUTES) {
        const path = `/${loc}${route}`;
        expect(isAuthorizedForPath("engineer", path), `engineer on ${path}`).toBe(false);
        // every other non-administrative role is denied too
        for (const role of ["customer", "vendor", "viewer", "candidate"] as Role[]) {
          expect(isAuthorizedForPath(role, path), `${role} on ${path}`).toBe(false);
        }
        // admin and superadmin keep their existing access
        for (const role of ["admin", "superadmin"] as Role[]) {
          expect(isAuthorizedForPath(role, path), `${role} on ${path}`).toBe(true);
        }
      }
    });
  }

  it("engineer KEEPS every allowed workspace route (no collateral denial)", () => {
    const allowed = [
      "/fa/dashboard", "/en/dashboard", "/de/dashboard",
      "/de/dashboard/operations", "/de/dashboard/predictive/risk",
      "/de/dashboard/industrial/assets", "/de/dashboard/copilot",
      "/de/assets", "/de/cmms", "/de/automation", "/de/documents",
      "/de/industrial-brain",
    ];
    for (const path of allowed) {
      expect(isAuthorizedForPath("engineer", path), `engineer on ${path}`).toBe(true);
    }
  });

  it("the administration surfaces do not over-match sibling dashboard routes", () => {
    // "dashboard/api" must not swallow e.g. "dashboard/apiary" — SEGMENT_END
    // anchors the pattern at a path boundary.
    for (const path of ["/de/dashboard/apikeys", "/de/dashboard/organizations"]) {
      expect(isAuthorizedForPath("engineer", path), `engineer on ${path}`).toBe(true);
    }
  });

  // PHASE 87L.4 AMENDMENT (owner-resolved): ERP is a commercial module, so it
  // is now admin/superadmin only — engineer is denied here while keeping its
  // access to the engineering modules.
  it("ERP keeps its stricter admin/superadmin matrix — engineer is denied", () => {
    for (const role of ["admin", "superadmin"] as Role[]) {
      expect(isAuthorizedForPath(role, "/fa/erp/inventory")).toBe(true);
    }
    for (const role of ["engineer", "customer", "vendor", "viewer", "candidate"] as Role[]) {
      expect(isAuthorizedForPath(role, "/fa/erp/inventory")).toBe(false);
    }
  });
});

// ── Session decoding (middleware pre-check) ──────────────────────────────────

describe("dashboard route protection — session decoding", () => {
  it("rejects a missing session", () => {
    expect(getRoleFromRequestSync(requestFor("/fa/dashboard"))).toBeNull();
  });

  it("rejects a malformed session token", () => {
    expect(
      getRoleFromRequestSync(requestFor("/fa/dashboard", "not-a-jwt")),
    ).toBeNull();
    expect(
      getRoleFromRequestSync(requestFor("/fa/dashboard", "a.b")),
    ).toBeNull();
  });

  it("rejects a tampered payload", () => {
    expect(
      getRoleFromRequestSync(
        requestFor("/fa/dashboard", "header.%%%not-base64-json%%%.sig"),
      ),
    ).toBeNull();
    expect(
      getRoleFromRequestSync(
        requestFor(
          "/fa/dashboard",
          fakeToken({ role: "not-a-real-role", exp: FUTURE_EXP }),
        ),
      ),
    ).toBeNull();
  });

  it("rejects an expired session", () => {
    expect(
      getRoleFromRequestSync(
        requestFor("/fa/dashboard", fakeToken({ role: "admin", exp: PAST_EXP })),
      ),
    ).toBeNull();
  });

  it("decodes a well-formed unexpired session role", () => {
    expect(
      getRoleFromRequestSync(
        requestFor("/fa/dashboard", fakeToken({ role: "admin", exp: FUTURE_EXP })),
      ),
    ).toBe("admin");
  });
});

// ── Real middleware behavior ─────────────────────────────────────────────────

describe("dashboard route protection — middleware redirects", () => {
  it("anonymous /fa/dashboard receives a 307 to the Persian login with `from`", () => {
    const response = middleware(requestFor("/fa/dashboard"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/fa/auth/login");
    expect(location.searchParams.get("from")).toBe("/fa/dashboard");
  });

  it("anonymous nested /en/dashboard/operations receives a 307 to the English login with `from`", () => {
    const response = middleware(requestFor("/en/dashboard/operations"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/en/auth/login");
    expect(location.searchParams.get("from")).toBe("/en/dashboard/operations");
  });

  it("query strings do not bypass protection", () => {
    const response = middleware(requestFor("/fa/dashboard?tab=operations&x=1"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/fa/auth/login");
  });

  it("an expired session is redirected to login like an anonymous request", () => {
    const response = middleware(
      requestFor("/en/dashboard", fakeToken({ role: "admin", exp: PAST_EXP })),
    );
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe(
      "/en/auth/login",
    );
  });

  it("a role without the dashboard capability is redirected to login", () => {
    for (const role of NON_DASHBOARD_ROLES) {
      const response = middleware(
        requestFor("/fa/dashboard", fakeToken({ role, exp: FUTURE_EXP })),
      );
      expect(response.status, `role ${role}`).toBe(307);
      expect(new URL(response.headers.get("location") ?? "").pathname).toBe(
        "/fa/auth/login",
      );
    }
  });

  it("an authorized session is not redirected to login", () => {
    for (const role of DASHBOARD_ROLES) {
      const response = middleware(
        requestFor("/fa/dashboard", fakeToken({ role, exp: FUTURE_EXP })),
      );
      const location = response.headers.get("location");
      expect(
        location === null || !location.includes("/auth/login"),
        `role ${role} must not be sent to login (got ${location})`,
      ).toBe(true);
    }
  });

  it("the middleware matcher still excludes api, Next.js assets and files", () => {
    expect(middlewareConfig.matcher).toEqual([
      "/((?!api|_next|_vercel|.*\\..*).*)",
    ]);
  });
});
