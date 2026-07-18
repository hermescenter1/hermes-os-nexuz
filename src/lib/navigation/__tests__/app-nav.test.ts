import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  APP_NAV_GROUPS,
  isAppNavItemVisible,
  visibleAppNavGroups,
  activeAppNavHref,
  isItemActive,
  breadcrumbsFor,
} from "@/lib/navigation/app-nav";
import { isAuthorizedForPath, isProtectedPath } from "@/lib/auth/rbac";
import { can, type Role } from "@/lib/auth/roles";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";

/**
 * PHASE 87C — app-shell navigation registry invariants (mirrors the Phase 84
 * site-nav.test.ts contract):
 *
 *   1. visible(role, item) ⇒ middleware-authorized (visibility NEVER exceeds
 *      authorization, both locales);
 *   2. hidden ⇒ denied for protected routes (no capability drift);
 *   3. unknown / null role fails safe (nothing protected visible);
 *   4. every href is a real route file (nothing invented);
 *   5. every label key exists in en + fa + de catalogs;
 *   6. client-side hiding does not replace route protection (protected paths
 *      stay protected regardless of nav data).
 */

const ALL_ROLES: Role[] = ["superadmin", "admin", "engineer", "customer", "viewer", "candidate", "vendor"];
const LOCALES = ["en", "fa"] as const;
const ALL_ITEMS = APP_NAV_GROUPS.flatMap((g) => g.items.map((it) => ({ ...it, groupKey: g.groupKey })));

function pageFileFor(route: string): string {
  return join(process.cwd(), "src", "app", "[locale]", route.replace(/^\//, ""), "page.tsx");
}

describe("app-nav — structure", () => {
  it("exposes the six IA groups in the approved order", () => {
    expect(APP_NAV_GROUPS.map((g) => g.groupKey)).toEqual([
      "intelligence",
      "operations",
      "engineering",
      "knowledge",
      "business",
      "administration",
    ]);
  });

  it("every href is locale-agnostic and points at a real route file", () => {
    for (const item of ALL_ITEMS) {
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.href).not.toMatch(/^\/(en|fa|de)(\/|$)/);
      expect(existsSync(pageFileFor(item.href)), `missing page for ${item.href}`).toBe(true);
    }
  });

  it("hrefs are unique across the registry", () => {
    const hrefs = ALL_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("every group and item label key exists in en, fa and de catalogs", () => {
    type Catalog = { appShell: { nav: { groups: Record<string, string>; items: Record<string, string> } } };
    for (const [name, cat] of [["en", en], ["fa", fa], ["de", de]] as const) {
      const nav = (cat as unknown as Catalog).appShell.nav;
      for (const g of APP_NAV_GROUPS) {
        expect(nav.groups[g.groupKey], `${name}: missing group label ${g.groupKey}`).toBeTruthy();
      }
      for (const item of ALL_ITEMS) {
        expect(nav.items[item.labelKey], `${name}: missing item label ${item.labelKey}`).toBeTruthy();
      }
    }
  });
});

describe("app-nav — visibility never exceeds EFFECTIVE authorization (87C amendment)", () => {
  it("visible ⇒ middleware-authorized AND page-guard-authorized; hidden ⇒ one of them denies", () => {
    for (const role of ALL_ROLES) {
      for (const item of ALL_ITEMS) {
        const visible = isAppNavItemVisible(role, item);
        const pageAllows = !item.pageCapability || can(role, item.pageCapability);
        for (const loc of LOCALES) {
          const path = `/${loc}${item.href}`;
          const middlewareAllows = isAuthorizedForPath(role, path);
          if (visible) {
            expect(middlewareAllows, `${role} sees ${item.href} but middleware denies ${path}`).toBe(true);
            expect(pageAllows, `${role} sees ${item.href} but its page guard (${item.pageCapability}) denies`).toBe(true);
          } else if (isProtectedPath(path)) {
            // Hidden: at least one existing enforcement layer must deny —
            // visibility is exactly the intersection, never an under-show of a
            // destination the user could actually open.
            expect(
              middlewareAllows && pageAllows,
              `${role} is denied ${item.href} in nav but both middleware and page guard allow it`,
            ).toBe(false);
          }
        }
      }
    }
  });

  // PHASE 87L.4 AMENDMENT (owner-resolved): the former six-way mismatch is gone.
  // Engineering modules admit engineer at every layer; commercial modules
  // (CRM/ERP) are admin-only at every layer.
  it("engineer sees the engineering modules, and every layer agrees", () => {
    const ENGINEERING = ["/assets", "/automation", "/cmms", "/documents"];
    const engineerHrefs = visibleAppNavGroups("engineer").flatMap((g) => g.items.map((i) => i.href));
    for (const href of ENGINEERING) {
      expect(engineerHrefs, `engineer must see ${href}`).toContain(href);
      expect(isAuthorizedForPath("engineer", `/en${href}`), `middleware ${href}`).toBe(true);
      expect(ALL_ITEMS.find((i) => i.href === href)?.pageCapability).toBe("authoring");
    }
  });

  it("engineer does NOT see the commercial modules, and middleware denies them too", () => {
    const COMMERCIAL = ["/crm", "/erp"];
    const engineerHrefs = visibleAppNavGroups("engineer").flatMap((g) => g.items.map((i) => i.href));
    for (const href of COMMERCIAL) {
      expect(engineerHrefs, `engineer must not see ${href}`).not.toContain(href);
      // presentation and enforcement now agree — no mismatch to present around
      expect(isAuthorizedForPath("engineer", `/en${href}`), `middleware ${href}`).toBe(false);
      expect(ALL_ITEMS.find((i) => i.href === href)?.pageCapability).toBe("admin");
    }
  });

  it("admin and superadmin retain all six module links", () => {
    const ALL_SIX = ["/assets", "/automation", "/cmms", "/crm", "/documents", "/erp"];
    for (const role of ["admin", "superadmin"] as Role[]) {
      const hrefs = visibleAppNavGroups(role).flatMap((g) => g.items.map((i) => i.href));
      for (const href of ALL_SIX) expect(hrefs, `${role} must keep ${href}`).toContain(href);
    }
  });

  it("customer and vendor visibility is unchanged by the amendment", () => {
    // Their portals carry a "dashboard" page guard consistent with middleware:
    // customer sees /customer, vendor sees /vendor; neither ever saw the six
    // admin-guarded modules (middleware already denied those).
    const customerHrefs = visibleAppNavGroups("customer").flatMap((g) => g.items.map((i) => i.href));
    expect(customerHrefs).toContain("/customer");
    expect(customerHrefs).not.toContain("/vendor");
    expect(customerHrefs).not.toContain("/crm");
    const vendorHrefs = visibleAppNavGroups("vendor").flatMap((g) => g.items.map((i) => i.href));
    expect(vendorHrefs).toContain("/vendor");
    expect(vendorHrefs).not.toContain("/cmms");
  });

  it("items authorized by BOTH layers stay visible (engineer keeps its effective set)", () => {
    const engineerHrefs = visibleAppNavGroups("engineer").flatMap((g) => g.items.map((i) => i.href));
    for (const href of ["/dashboard", "/engineering", "/dashboard/industrial/telemetry", "/library", "/customer"]) {
      expect(engineerHrefs, `engineer should keep ${href}`).toContain(href);
    }
  });

  it("no role is presented an empty navigation group", () => {
    for (const role of ALL_ROLES) {
      for (const group of visibleAppNavGroups(role)) {
        expect(group.items.length, `${role}: group ${group.groupKey} rendered empty`).toBeGreaterThan(0);
      }
    }
  });

  it("null / undefined role sees no items at all (fail-safe before role resolution)", () => {
    expect(visibleAppNavGroups(null)).toEqual([]);
    expect(visibleAppNavGroups(undefined)).toEqual([]);
  });

  it("an unknown role string fails safe (nothing visible)", () => {
    expect(visibleAppNavGroups("intruder" as Role)).toEqual([]);
    expect(isAppNavItemVisible("bogus" as Role, { href: "/dashboard" })).toBe(false);
  });

  it("candidate and viewer see no dashboard-capability destinations", () => {
    for (const role of ["candidate", "viewer"] as Role[]) {
      const hrefs = visibleAppNavGroups(role).flatMap((g) => g.items.map((i) => i.href));
      expect(hrefs).not.toContain("/dashboard");
      expect(hrefs).not.toContain("/admin");
    }
  });

  it("admin-only destinations are hidden from engineer/customer/vendor", () => {
    for (const role of ["engineer", "customer", "vendor"] as Role[]) {
      const hrefs = visibleAppNavGroups(role).flatMap((g) => g.items.map((i) => i.href));
      expect(hrefs).not.toContain("/admin");
    }
    expect(visibleAppNavGroups("admin").flatMap((g) => g.items.map((i) => i.href))).toContain("/admin");
  });

  it("client-side hiding does not replace route protection — registry routes stay middleware-protected", () => {
    // Every dashboard-tree destination must remain protected server-side no
    // matter what the nav renders.
    for (const item of ALL_ITEMS.filter((i) => i.href.startsWith("/dashboard"))) {
      for (const loc of LOCALES) {
        expect(isProtectedPath(`/${loc}${item.href}`)).toBe(true);
      }
    }
  });
});

describe("app-nav — active matching and breadcrumbs", () => {
  it("prefix items match their subtree; exact items match only themselves", () => {
    expect(isItemActive("/cmms/work-orders", { href: "/cmms" })).toBe(true);
    expect(isItemActive("/dashboard", { href: "/dashboard", match: "exact" })).toBe(true);
    expect(isItemActive("/dashboard/billing", { href: "/dashboard", match: "exact" })).toBe(false);
  });

  it("longest-prefix wins: /dashboard/knowledge/cases activates cases, not knowledgeBase", () => {
    expect(activeAppNavHref("/dashboard/knowledge/cases")).toBe("/dashboard/knowledge/cases");
    expect(activeAppNavHref("/dashboard/knowledge")).toBe("/dashboard/knowledge");
    expect(activeAppNavHref("/dashboard/organization/members")).toBe("/dashboard/organization/members");
  });

  it("unregistered paths yield no active item and no crumbs", () => {
    expect(activeAppNavHref("/totally/unknown")).toBeNull();
    expect(breadcrumbsFor("/totally/unknown")).toEqual([]);
  });

  it("breadcrumbs derive Group / Item with the item marked current", () => {
    const crumbs = breadcrumbsFor("/dashboard");
    expect(crumbs).toHaveLength(2);
    expect(crumbs[0]).toMatchObject({ kind: "group", labelKey: "intelligence", current: false });
    expect(crumbs[1]).toMatchObject({ kind: "item", labelKey: "dashboard", href: "/dashboard", current: true });
  });
});
