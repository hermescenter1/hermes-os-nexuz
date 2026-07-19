import { describe, it, expect } from "vitest";
import { can, type Capability } from "@/lib/auth/roles";
import type { Role } from "@/lib/auth/roles";
import { isAuthorizedForPath, isProtectedPath } from "@/lib/auth/rbac";
import { APP_NAV_GROUPS, isAppNavItemVisible, visibleAppNavGroups } from "@/lib/navigation/app-nav";

/**
 * PHASE 87L.6G — the accepted final access contract.
 *
 * Engineer ALLOWED : Dashboard, Industrial Brain, Copilot, Predictive, Assets,
 *                    CMMS, Automation, Documents/EDMS.
 * Engineer DENIED  : CRM, ERP, Billing, Organization administration,
 *                    API Platform administration, Admin routes.
 * Admin/Superadmin : unchanged.
 *
 * This file is the single place the contract is stated for the three surfaces
 * closed in 87L.6G, and it deliberately asserts BOTH directions so a policy
 * that accidentally denies everything cannot pass.
 */

const LOCALES = ["fa", "en", "de"] as const;

const ADMIN_ONLY: { path: string; capability: Capability }[] = [
  { path: "/dashboard/billing", capability: "billing_admin" },
  { path: "/dashboard/organization", capability: "org_admin" },
  { path: "/dashboard/organization/members", capability: "org_admin" },
  { path: "/dashboard/organization/invitations", capability: "org_admin" },
  { path: "/dashboard/organization/settings", capability: "org_admin" },
  { path: "/dashboard/organization/departments", capability: "org_admin" },
  { path: "/dashboard/api", capability: "api_admin" },
];

/** Engineer must keep every one of these. */
const ENGINEER_ALLOWED = [
  "/dashboard",
  "/dashboard/operations",
  "/dashboard/copilot",
  "/dashboard/predictive",
  "/dashboard/industrial/assets",
  "/assets",
  "/cmms",
  "/automation",
  "/documents",
  "/industrial-brain",
];

/** Already denied before this phase — must stay denied. */
const ENGINEER_DENIED_BEFORE = ["/crm", "/erp", "/admin"];

describe("87L.6G — capability matrix", () => {
  it("grants the three administration capabilities to admin and superadmin only", () => {
    for (const cap of ["billing_admin", "org_admin", "api_admin"] as Capability[]) {
      expect(can("superadmin", cap), `superadmin lacks ${cap}`).toBe(true);
      expect(can("admin", cap), `admin lacks ${cap}`).toBe(true);
      for (const role of ["engineer", "customer", "vendor", "viewer", "candidate"] as Role[]) {
        expect(can(role, cap), `${role} unexpectedly has ${cap}`).toBe(false);
      }
      expect(can(null, cap), `anonymous has ${cap}`).toBe(false);
    }
  });

  it("does not change any unrelated engineer permission", () => {
    expect(can("engineer", "authoring")).toBe(true);
    expect(can("engineer", "dashboard")).toBe(true);
    expect(can("engineer", "admin")).toBe(false);
    expect(can("engineer", "superadmin")).toBe(false);
  });

  it("does not escalate any role (customer/vendor/viewer/candidate unchanged)", () => {
    expect(can("customer", "dashboard")).toBe(true);
    expect(can("vendor", "dashboard")).toBe(true);
    expect(can("viewer", "dashboard")).toBe(false);
    expect(can("candidate", "dashboard")).toBe(false);
    for (const role of ["customer", "vendor", "viewer", "candidate"] as Role[]) {
      expect(can(role, "authoring"), `${role} gained authoring`).toBe(false);
      expect(can(role, "admin"), `${role} gained admin`).toBe(false);
    }
  });
});

describe("87L.6G — route enforcement (server-side, all three locales)", () => {
  it.each(LOCALES)("%s: the administration surfaces are protected paths", (loc) => {
    for (const { path } of ADMIN_ONLY) {
      expect(isProtectedPath(`/${loc}${path}`), `${path} not protected`).toBe(true);
      expect(isProtectedPath(`/${loc}${path}/`), `${path}/ not protected`).toBe(true);
    }
  });

  it.each(LOCALES)("%s: engineer is denied every administration surface", (loc) => {
    for (const { path } of ADMIN_ONLY) {
      expect(isAuthorizedForPath("engineer", `/${loc}${path}`), `engineer on ${path}`).toBe(false);
    }
  });

  it.each(LOCALES)("%s: admin and superadmin keep access", (loc) => {
    for (const { path } of ADMIN_ONLY) {
      for (const role of ["admin", "superadmin"] as Role[]) {
        expect(isAuthorizedForPath(role, `/${loc}${path}`), `${role} on ${path}`).toBe(true);
      }
    }
  });

  it.each(LOCALES)("%s: non-administrative roles are denied too", (loc) => {
    for (const { path } of ADMIN_ONLY) {
      for (const role of ["customer", "vendor", "viewer", "candidate"] as Role[]) {
        expect(isAuthorizedForPath(role, `/${loc}${path}`), `${role} on ${path}`).toBe(false);
      }
    }
  });

  it.each(LOCALES)("%s: engineer keeps every allowed workspace route", (loc) => {
    for (const path of ENGINEER_ALLOWED) {
      expect(isAuthorizedForPath("engineer", `/${loc}${path}`), `engineer on ${path}`).toBe(true);
    }
  });

  it.each(LOCALES)("%s: previously denied routes stay denied for engineer", (loc) => {
    for (const path of ENGINEER_DENIED_BEFORE) {
      expect(isAuthorizedForPath("engineer", `/${loc}${path}`), `engineer on ${path}`).toBe(false);
    }
  });

  it("route matching is anchored — no sibling route is caught by accident", () => {
    for (const path of ["/de/dashboard/apikeys", "/de/dashboard/organizations", "/de/dashboard/billings"]) {
      expect(isAuthorizedForPath("engineer", path), `engineer wrongly denied ${path}`).toBe(true);
    }
  });

  it("a locale prefix cannot be used to bypass the gate", () => {
    // any two-letter prefix is matched by localePathPattern; an unknown locale
    // must not open a hole.
    for (const loc of ["fa", "en", "de", "xx", "zz"]) {
      expect(isAuthorizedForPath("engineer", `/${loc}/dashboard/billing`), loc).toBe(false);
      expect(isProtectedPath(`/${loc}/dashboard/billing`), loc).toBe(true);
    }
  });
});

describe("87L.6G — navigation derives from the same policy", () => {
  it("every administration nav item declares its domain capability", () => {
    const items = APP_NAV_GROUPS.flatMap((g) => g.items);
    for (const { path, capability } of ADMIN_ONLY) {
      const item = items.find((i) => i.href === path);
      if (!item) continue; // departments has no nav entry
      expect(item.pageCapability, `${path} capability`).toBe(capability);
    }
  });

  it("engineer sees no link to any denied surface", () => {
    const hrefs = visibleAppNavGroups("engineer").flatMap((g) => g.items.map((i) => i.href));
    for (const denied of ["/dashboard/billing", "/dashboard/organization", "/dashboard/api", "/crm", "/erp", "/admin"]) {
      expect(hrefs, `engineer can see ${denied}`).not.toContain(denied);
    }
  });

  it("engineer still sees its allowed links", () => {
    const hrefs = visibleAppNavGroups("engineer").flatMap((g) => g.items.map((i) => i.href));
    for (const allowed of ["/dashboard", "/assets", "/cmms", "/automation", "/documents"]) {
      expect(hrefs, `engineer lost ${allowed}`).toContain(allowed);
    }
  });

  it("admin and superadmin still see the administration links", () => {
    for (const role of ["admin", "superadmin"] as Role[]) {
      const hrefs = visibleAppNavGroups(role).flatMap((g) => g.items.map((i) => i.href));
      for (const href of ["/dashboard/billing", "/dashboard/organization", "/dashboard/api", "/admin"]) {
        expect(hrefs, `${role} lost ${href}`).toContain(href);
      }
    }
  });

  it("nav visibility is exactly middleware policy ∩ capability — no parallel logic", () => {
    const roles = ["superadmin", "admin", "engineer", "customer", "viewer", "vendor", "candidate"] as const;
    let denials = 0;
    for (const item of APP_NAV_GROUPS.flatMap((g) => g.items)) {
      for (const role of roles) {
        const expected =
          isAuthorizedForPath(role, `/en${item.href}`) &&
          (!item.pageCapability || can(role, item.pageCapability));
        expect(isAppNavItemVisible(role, item), `${item.href} for ${role}`).toBe(expected);
        if (!expected) denials++;
      }
    }
    expect(denials, "matrix collapsed to all-visible").toBeGreaterThan(0);
  });

  it("signed-out users see nothing", () => {
    expect(visibleAppNavGroups(null)).toEqual([]);
    expect(visibleAppNavGroups(undefined)).toEqual([]);
  });
});

describe("87L.6G — no scattered role checks replace the shared policy", () => {
  it("the administration pages use RequireCapability, not a role literal", async () => {
    const fs = await import("node:fs/promises");
    const pages = [
      "src/app/[locale]/dashboard/billing/page.tsx",
      "src/app/[locale]/dashboard/api/page.tsx",
      "src/app/[locale]/dashboard/organization/page.tsx",
      "src/app/[locale]/dashboard/organization/members/page.tsx",
      "src/app/[locale]/dashboard/organization/invitations/page.tsx",
      "src/app/[locale]/dashboard/organization/settings/page.tsx",
      "src/app/[locale]/dashboard/organization/departments/page.tsx",
    ];
    for (const p of pages) {
      const src = await fs.readFile(p, "utf8");
      expect(src, `${p} missing RequireCapability`).toContain("RequireCapability");
      expect(/role\s*===\s*["'](admin|superadmin)["']/.test(src), `${p} hard-codes a role`).toBe(false);
    }
  });
});
