import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  SITE_NAV_GROUPS,
  visibleSiteNavGroups,
  isNavItemVisible,
} from "@/lib/navigation/site-nav";
import { CONTROL_CENTER } from "@/lib/navigation/control-center";
import { isAuthorizedForPath, isProtectedPath } from "@/lib/auth/rbac";
import { can, type Role } from "@/lib/auth/roles";

/**
 * Phase 84 (cont.) — global SiteNav RBAC visibility + editorial/contributor policy.
 *
 * SiteNav previously showed /admin and /admin/documents to every visitor. These
 * tests lock: admin links are hidden from unauthenticated + non-admin roles,
 * shown to admin/superadmin, SiteNav and the Control Center agree on the
 * capability for shared admin destinations, and no admin link appears before
 * the role resolves (role === null). They also verify the six editorial routes
 * stay admin-only while contributor/account article tools stay open to
 * authenticated customer/vendor.
 */

const ALL_ROLES: Role[] = ["superadmin", "admin", "engineer", "customer", "viewer", "candidate", "vendor"];
const NON_ADMIN_ROLES: Role[] = ["engineer", "customer", "vendor", "viewer", "candidate"];
const LOCALES = ["en", "fa"] as const;

const ALL_ITEMS   = SITE_NAV_GROUPS.flatMap((g) => g.items);
const ADMIN_ITEMS = ALL_ITEMS.filter((i) => i.capability === "admin");
const ADMIN_HREFS = ADMIN_ITEMS.map((i) => i.href);

const EDITORIAL_ROUTES = [
  "/articles/editor", "/articles/review-queue", "/articles/submissions",
  "/articles/moderation", "/articles/reports", "/articles/editorial-board",
];
const CONTRIBUTOR_ROUTES = [
  "/articles/write", "/articles/my-articles", "/articles/drafts",
  "/articles/saved", "/articles/following", "/articles/settings",
];

function visibleHrefs(role: Role | null): string[] {
  return visibleSiteNavGroups(role).flatMap((g) => g.items.map((i) => i.href));
}
function pageFileFor(route: string): string {
  return join(process.cwd(), "src", "app", "[locale]", route.replace(/^\//, ""), "page.tsx");
}

// ── SiteNav admin-link visibility ────────────────────────────────────────────

describe("SiteNav — admin link visibility", () => {
  it("there is at least one admin-gated link to protect", () => {
    expect(ADMIN_HREFS).toEqual(
      expect.arrayContaining(["/admin", "/admin/documents", "/admin/documents/search"]),
    );
  });

  it("unauthenticated visitors (role null) see no admin links, but do see public links", () => {
    const hrefs = visibleHrefs(null);
    for (const h of ADMIN_HREFS) expect(hrefs).not.toContain(h);
    expect(hrefs).toContain("/articles"); // public journal feed still present
    expect(hrefs).toContain("/");
  });

  for (const role of NON_ADMIN_ROLES) {
    it(`${role} sees no admin links`, () => {
      const hrefs = visibleHrefs(role);
      for (const h of ADMIN_HREFS) expect(hrefs).not.toContain(h);
    });
  }

  it("admin sees every admin link", () => {
    const hrefs = visibleHrefs("admin");
    for (const h of ADMIN_HREFS) expect(hrefs).toContain(h);
  });

  it("superadmin sees every admin link", () => {
    const hrefs = visibleHrefs("superadmin");
    for (const h of ADMIN_HREFS) expect(hrefs).toContain(h);
  });

  it("no admin link is present while the role is unresolved (null) — no pre-resolution flash", () => {
    expect(visibleHrefs(null).some((h) => ADMIN_HREFS.includes(h))).toBe(false);
  });

  it("all SiteNav hrefs are locale-agnostic (no hardcoded /en or /fa)", () => {
    for (const item of ALL_ITEMS) {
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.href).not.toMatch(/^\/(en|fa)(\/|$)/);
    }
  });
});

// ── Visibility never exceeds authorization (SiteNav admin links) ─────────────

describe("SiteNav — visibility matches middleware authorization", () => {
  it("visible admin link ⇒ middleware-authorized; non-admins denied (both locales)", () => {
    for (const role of ALL_ROLES) {
      for (const item of ADMIN_ITEMS) {
        const visible = isNavItemVisible(role, item);
        for (const loc of LOCALES) {
          const authorized = isAuthorizedForPath(role, `/${loc}${item.href}`);
          if (visible) expect(authorized).toBe(true);
          else expect(authorized).toBe(false);
        }
      }
    }
  });
});

// ── /compliance classification (Phase 84 verification) ──────────────────────

describe("SiteNav — /compliance access classification", () => {
  it("/compliance is admin-only by its real route policy (middleware), so its nav item carries the admin capability", () => {
    // The /compliance page itself renders without a page-level guard; its
    // enforcement is middleware-only (PROTECTED_PATHS + isAuthorizedForPath →
    // admin/superadmin). The nav tag mirrors that real policy — it was NOT
    // tagged merely for sitting in the same group as /admin links.
    const item = ALL_ITEMS.find((i) => i.href === "/compliance");
    expect(item).toBeDefined();
    expect(item!.capability).toBe("admin");
    for (const loc of LOCALES) {
      expect(isProtectedPath(`/${loc}/compliance`)).toBe(true);
      expect(isAuthorizedForPath("admin", `/${loc}/compliance`)).toBe(true);
      expect(isAuthorizedForPath("superadmin", `/${loc}/compliance`)).toBe(true);
      for (const role of NON_ADMIN_ROLES) {
        expect(isAuthorizedForPath(role, `/${loc}/compliance`)).toBe(false);
      }
    }
  });

  it("/compliance nav visibility matches its real policy: shown to admin/superadmin, hidden from everyone else (incl. unauthenticated)", () => {
    const item = ALL_ITEMS.find((i) => i.href === "/compliance")!;
    // Only admin/superadmin may SEE the /compliance link.
    expect(isNavItemVisible("admin", item)).toBe(true);
    expect(isNavItemVisible("superadmin", item)).toBe(true);
    for (const role of NON_ADMIN_ROLES) expect(isNavItemVisible(role, item)).toBe(false);
    expect(isNavItemVisible(null, item)).toBe(false);
    // visible ⇒ authorized (and hidden ⇒ denied) for /compliance across roles.
    for (const role of [...ALL_ROLES, null]) {
      const visible = isNavItemVisible(role, item);
      for (const loc of LOCALES) {
        const authorized = role !== null && isAuthorizedForPath(role, `/${loc}/compliance`);
        expect(visible).toBe(authorized);
      }
    }
  });
});

// ── SiteNav ↔ Control Center agreement ───────────────────────────────────────

describe("SiteNav and Control Center agree on shared admin destinations", () => {
  it("shared admin hrefs use the same capability in both surfaces", () => {
    const registryItems = CONTROL_CENTER.flatMap((g) => g.items);
    let shared = 0;
    for (const navItem of ADMIN_ITEMS) {
      const match = registryItems.find((r) => r.href === navItem.href);
      if (match) {
        shared++;
        expect(match.capability).toBe(navItem.capability);
      }
    }
    expect(shared).toBeGreaterThan(0); // /admin, /admin/documents, /admin/documents/search
  });
});

// ── Editorial route protection matrix ────────────────────────────────────────

describe("editorial routes remain admin-only", () => {
  for (const route of EDITORIAL_ROUTES) {
    it(`${route} exists, is protected, and is admin/superadmin-only`, () => {
      expect(existsSync(pageFileFor(route))).toBe(true);
      for (const loc of LOCALES) {
        expect(isProtectedPath(`/${loc}${route}`)).toBe(true);
        expect(isAuthorizedForPath("admin", `/${loc}${route}`)).toBe(true);
        expect(isAuthorizedForPath("superadmin", `/${loc}${route}`)).toBe(true);
        for (const role of NON_ADMIN_ROLES) {
          expect(isAuthorizedForPath(role, `/${loc}${route}`)).toBe(false);
        }
      }
    });
  }
});

// ── Contributor vs platform-authoring policy ─────────────────────────────────

describe("contributor/account tools vs editorial administration", () => {
  it("contributor article tools stay open to authenticated customer & vendor (both locales)", () => {
    for (const role of ["customer", "vendor", "engineer", "admin", "superadmin"] as Role[]) {
      for (const route of CONTRIBUTOR_ROUTES) {
        for (const loc of LOCALES) {
          expect(isAuthorizedForPath(role, `/${loc}${route}`)).toBe(true);
        }
      }
    }
  });

  it("customer & vendor cannot access editorial/moderation routes", () => {
    for (const role of ["customer", "vendor"] as Role[]) {
      for (const route of EDITORIAL_ROUTES) {
        expect(isAuthorizedForPath(role, `/en${route}`)).toBe(false);
      }
    }
  });

  it("contributor tools are NOT platform authoring: customer has dashboard, not authoring", () => {
    // The platform "authoring" capability is reserved for engineering/knowledge
    // surfaces; contributor article tools use the authenticated/dashboard policy.
    expect(can("customer", "dashboard")).toBe(true);
    expect(can("customer", "authoring")).toBe(false);
    expect(can("vendor", "authoring")).toBe(false);
    // editorial nav requires admin, which customer/vendor never hold
    expect(can("customer", "admin")).toBe(false);
    expect(can("vendor", "admin")).toBe(false);
  });
});
