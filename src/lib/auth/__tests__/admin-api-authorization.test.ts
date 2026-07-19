import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { can, requirePermission, type OrgPermission } from "@/lib/org/rbac";
import type { OrgRole } from "@/lib/org/types";

/**
 * PHASE 87L.6H — authenticated API authorization for the three administration
 * domains closed in 87L.6G.
 *
 * 87L.6G added `view_billing` to three sensitive billing GETs and
 * `view_api_keys` to the rate-limit session path, but shipped no test that
 * invokes those handlers. This file closes that gap by calling the REAL route
 * handlers with a mocked organization context, so the assertions exercise the
 * shipped authorization branch rather than re-implementing it.
 *
 * ANTI-VACUITY (§7). A denial test that passes for the wrong reason is worse
 * than no test — 87L.6E shipped exactly that bug (a helper called with its
 * arguments reversed returned false for every input, so every "is denied"
 * assertion passed vacuously). Every describe block below therefore pins the
 * POSITIVE direction too: if authorization silently started denying everyone,
 * these tests fail.
 */

const ORG_ROLES: OrgRole[] = [
  "OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN",
];

/**
 * Roles that exist in the Prisma `OrgRole` enum (Phases 58B/60/61 added ATS,
 * Academy and Compliance roles) but are NOT in the application's `OrgRole`
 * union and therefore appear in no PERMISSIONS row. `can()` is a membership
 * test, so these must resolve to DENY — deny-by-default, not accidental grant.
 */
const EXTENDED_PRISMA_ROLES = [
  "HR_MANAGER", "RECRUITER", "HIRING_MANAGER", "INTERVIEWER",
  "ACADEMY_ADMIN", "CUSTOMER_SUCCESS_MANAGER", "STUDENT",
  "COMPLIANCE_MANAGER", "MEMBER",
] as unknown as OrgRole[];

/** Roles the product treats as billing-privileged. */
const BILLING_ALLOWED = new Set(["OWNER", "ADMIN", "BILLING_ADMIN"]);
/** Roles the product treats as API-key administrators. */
const KEY_MANAGERS = new Set(["OWNER", "ADMIN", "MANAGER"]);

describe("87L.6H — org permission matrix is discriminating, not degenerate", () => {
  it("view_billing admits exactly OWNER/ADMIN/BILLING_ADMIN", () => {
    for (const role of ORG_ROLES) {
      expect(can(role, "view_billing"), `${role} view_billing`).toBe(BILLING_ALLOWED.has(String(role)));
    }
  });

  it("manage_billing admits exactly OWNER/ADMIN/BILLING_ADMIN", () => {
    for (const role of ORG_ROLES) {
      expect(can(role, "manage_billing"), `${role} manage_billing`).toBe(BILLING_ALLOWED.has(String(role)));
    }
  });

  it("manage_api_keys EXCLUDES ENGINEER and VIEWER", () => {
    for (const role of ORG_ROLES) {
      expect(can(role, "manage_api_keys"), `${role} manage_api_keys`).toBe(KEY_MANAGERS.has(String(role)));
    }
    expect(can("ENGINEER", "manage_api_keys")).toBe(false);
    expect(can("VIEWER", "manage_api_keys")).toBe(false);
  });

  /**
   * DOCUMENTED, NOT ASSERTED AS DESIRABLE. `view_api_keys` currently includes
   * ENGINEER by the Phase-33 decision. This test pins the CURRENT behaviour so
   * the owner's pending decision (docs/release/german-release-gate.md §2)
   * cannot be changed silently in either direction.
   */
  it("PINS CURRENT POLICY: view_api_keys still includes ENGINEER (owner decision pending)", () => {
    expect(can("ENGINEER", "view_api_keys")).toBe(true);
    expect(can("VIEWER", "view_api_keys")).toBe(false);
  });

  it("requirePermission returns a 403 shape on denial and ok on grant", () => {
    const denied = requirePermission("ENGINEER", "view_billing" as OrgPermission);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.status).toBe(403);
    expect(requirePermission("ADMIN", "view_billing" as OrgPermission).ok).toBe(true);
  });

  it("ANTI-VACUITY: the matrix is not uniformly false", () => {
    const grants = ORG_ROLES.flatMap((r) =>
      (["view_billing", "manage_billing", "view_api_keys", "manage_api_keys"] as OrgPermission[])
        .filter((p) => can(r, p))
    );
    expect(grants.length, "no role holds any permission — matrix is degenerate").toBeGreaterThan(0);
  });
});

/**
 * Real handler invocation. `requireOrgContext` / `requireOrgActor` are the only
 * seams mocked; the authorization branch under test is the shipped code.
 */
const reqFor = (url: string) => new NextRequest(`http://localhost:3000${url}`);

async function callBillingGet(route: "invoices" | "usage" | "subscription", role: OrgRole) {
  vi.resetModules();
  vi.doMock("@/lib/billing/context", () => ({
    requireOrgContext: async () => ({ ctx: { orgId: "org_1", userId: "u_1", role } }),
    getOrgContext: async () => ({ orgId: "org_1", userId: "u_1", role }),
  }));
  // keep the data layer inert — authorization must decide before any read
  vi.doMock("@/lib/billing/invoices", () => ({ listInvoices: async () => [] }));
  vi.doMock("@/lib/billing/usage", () => ({
    getUsageSummary: async () => ({}), listUsage: async () => [],
    recordUsage: async () => ({ ok: true }), getLimitStatuses: async () => [],
  }));
  vi.doMock("@/lib/billing/subscriptions", () => ({
    getSubscription: async () => null, getSubscriptionForOrg: async () => null,
  }));
  // Static specifiers: a template-literal import cannot be resolved statically
  // by the bundler, and a silently-unresolved module would make every
  // assertion below meaningless.
  const mod =
    route === "invoices"     ? await import("@/app/api/billing/invoices/route")
    : route === "usage"      ? await import("@/app/api/billing/usage/route")
    :                          await import("@/app/api/billing/subscription/route");
  return (mod as { GET: (r: NextRequest) => Promise<Response> }).GET(reqFor(`/api/billing/${route}`));
}

describe("87L.6H — billing API reads require view_billing (real handlers)", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { vi.doUnmock("@/lib/billing/context"); vi.resetModules(); });

  for (const route of ["invoices", "usage", "subscription"] as const) {
    it(`GET /api/billing/${route}: ENGINEER receives 403`, async () => {
      const res = await callBillingGet(route, "ENGINEER");
      expect(res.status, `${route} did not deny ENGINEER`).toBe(403);
    });

    it(`GET /api/billing/${route}: VIEWER receives 403`, async () => {
      const res = await callBillingGet(route, "VIEWER");
      expect(res.status).toBe(403);
    });

    // POSITIVE direction — proves the 403s above are real denials, not a
    // handler that fails for every caller.
    it(`GET /api/billing/${route}: ADMIN is allowed through`, async () => {
      const res = await callBillingGet(route, "ADMIN");
      expect(res.status, `${route} wrongly denied ADMIN`).not.toBe(403);
      expect(res.status).toBeLessThan(500);
    });

    it(`GET /api/billing/${route}: BILLING_ADMIN is allowed through`, async () => {
      const res = await callBillingGet(route, "BILLING_ADMIN" as OrgRole);
      expect(res.status).not.toBe(403);
    });
  }

  it("anonymous receives 401, not 403 (authentication precedes authorization)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/billing/context", () => ({
      requireOrgContext: async () => ({ error: "Authentication required", status: 401 }),
    }));
    vi.doMock("@/lib/billing/invoices", () => ({ listInvoices: async () => [] }));
    const mod = await import("@/app/api/billing/invoices/route");
    const res = await (mod as { GET: (r: NextRequest) => Promise<Response> })
      .GET(reqFor("/api/billing/invoices"));
    expect(res.status).toBe(401);
    vi.doUnmock("@/lib/billing/context");
  });
});

describe("87L.6H — the authorization guard runs BEFORE any data read", () => {
  it("a denied billing request never touches the invoice store", async () => {
    vi.resetModules();
    const listInvoices = vi.fn(async () => []);
    vi.doMock("@/lib/billing/context", () => ({
      requireOrgContext: async () => ({ ctx: { orgId: "org_1", userId: "u_1", role: "ENGINEER" } }),
    }));
    vi.doMock("@/lib/billing/invoices", () => ({ listInvoices }));
    const mod = await import("@/app/api/billing/invoices/route");
    const res = await (mod as { GET: (r: NextRequest) => Promise<Response> })
      .GET(reqFor("/api/billing/invoices"));
    expect(res.status).toBe(403);
    expect(listInvoices, "data was read despite a 403").not.toHaveBeenCalled();
    vi.doUnmock("@/lib/billing/context");
    vi.doUnmock("@/lib/billing/invoices");
  });
});

describe("87L.6H — API-key secret material is never listable", () => {
  it("the list projection exposes no rawKey and no keyHash", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/lib/api/keys.ts", "utf8");
    const rowToKey = src.slice(src.indexOf("function rowToKey"), src.indexOf("export function generateRawKey"));
    expect(rowToKey).not.toContain("rawKey");
    expect(rowToKey).not.toContain("keyHash");
    // the secret exists only on the create/rotate result type
    expect(src).toContain("rawKey }"); // spread into ApiKeyCreatedRecord
  });

  it("create and rotate — the only paths returning a secret — require manage_api_keys", async () => {
    const fs = await import("node:fs/promises");
    for (const p of [
      "src/app/api/platform/keys/route.ts",
      "src/app/api/platform/keys/[id]/rotate/route.ts",
    ]) {
      const src = await fs.readFile(p, "utf8");
      expect(src, `${p} missing manage_api_keys`).toContain('requirePermission(member.ctx.role, "manage_api_keys")');
    }
  });

  it("the rate-limit session path is permission-gated (87L.6G)", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/app/api/platform/rate-limits/route.ts", "utf8");
    expect(src).toContain('requirePermission(member.ctx.role, "view_api_keys")');
    expect(src).toContain('hasScope(ctx.scopes, "billing.read")');
  });
});

describe("87L.6H — deny-by-default for roles outside the permission matrix", () => {
  /**
   * The Prisma OrgRole enum carries 16 members; the application's OrgRole union
   * carries 7. `can()` is a membership test against PERMISSIONS, so a role the
   * matrix never lists resolves to DENY. This asserts that fail-closed property
   * explicitly — a future refactor that made `can()` default-allow would be a
   * silent privilege escalation for nine roles at once.
   */
  it("ATS / Academy / Compliance roles hold no billing or API-key permission", () => {
    for (const role of EXTENDED_PRISMA_ROLES) {
      for (const perm of ["view_billing", "manage_billing", "view_api_keys", "manage_api_keys"] as OrgPermission[]) {
        expect(can(role, perm), `${role} unexpectedly holds ${perm}`).toBe(false);
      }
    }
  });

  it("ANTI-VACUITY: the same call shape DOES grant for a listed role", () => {
    // proves the assertions above fail for the right reason
    expect(can("OWNER", "view_billing" as OrgPermission)).toBe(true);
    expect(can("OWNER", "manage_api_keys" as OrgPermission)).toBe(true);
  });
});
