import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isAuthorizedForPath, isProtectedPath } from "@/lib/auth/rbac";
import { can, type Role } from "@/lib/auth/roles";
import { SITE_NAV_GROUPS, isNavItemVisible } from "@/lib/navigation/site-nav";
import { CONTROL_CENTER } from "@/lib/navigation/control-center";

/**
 * F-2 — the organization document pages under /admin/documents.
 *
 * Middleware proves only a WORKSPACE platform role ("dashboard" capability);
 * the page proves the tenant (ACTIVE membership + view_documents) and the API
 * re-proves both on every request. Everything else under /admin stays
 * platform-admin only — this carve-out must not widen by a single path.
 */

const LOCALES = ["fa", "en", "de"] as const;
const ROLES: Role[] = ["superadmin", "admin", "engineer", "customer", "vendor", "viewer", "candidate"];
const DOC_PATHS = ["/admin/documents", "/admin/documents/search"];

describe("F-2 — middleware authorization for the document pages", () => {
  it.each(LOCALES)("%s: both pages stay protected and follow the dashboard capability", (loc) => {
    for (const path of DOC_PATHS) {
      expect(isProtectedPath(`/${loc}${path}`), path).toBe(true);
      for (const role of ROLES) {
        expect(isAuthorizedForPath(role, `/${loc}${path}`), `${role} on ${path}`).toBe(can(role, "dashboard"));
      }
    }
  });

  it("viewer and candidate are denied; workspace roles are admitted to the page gate", () => {
    for (const role of ["viewer", "candidate"] as Role[]) {
      expect(isAuthorizedForPath(role, "/en/admin/documents")).toBe(false);
    }
    for (const role of ["engineer", "customer", "vendor"] as Role[]) {
      expect(isAuthorizedForPath(role, "/en/admin/documents")).toBe(true);
    }
  });

  it.each(LOCALES)("%s: the rest of /admin is still platform-admin only", (loc) => {
    for (const path of ["/admin", "/admin/customers", "/admin/leads", "/admin/documentsx", "/admin/analytics"]) {
      for (const role of ["engineer", "customer", "vendor", "viewer", "candidate"] as Role[]) {
        expect(isAuthorizedForPath(role, `/${loc}${path}`), `${role} on ${path}`).toBe(false);
      }
      for (const role of ["admin", "superadmin"] as Role[]) {
        expect(isAuthorizedForPath(role, `/${loc}${path}`), `${role} on ${path}`).toBe(true);
      }
    }
  });
});

describe("F-2 — navigation never exceeds authorization for the document links", () => {
  const navItems = SITE_NAV_GROUPS.flatMap((g) => g.items).filter((i) => DOC_PATHS.includes(i.href));
  const ccItems = CONTROL_CENTER.flatMap((g) => g.items).filter((i) => DOC_PATHS.includes(i.href));

  it("both surfaces list both pages with the dashboard capability", () => {
    expect(navItems.map((i) => [i.href, i.capability])).toEqual([
      ["/admin/documents", "dashboard"],
      ["/admin/documents/search", "dashboard"],
    ]);
    expect(ccItems.map((i) => [i.href, i.capability])).toEqual([
      ["/admin/documents", "dashboard"],
      ["/admin/documents/search", "dashboard"],
    ]);
  });

  it("visible ⇔ middleware-authorized, for every role", () => {
    for (const role of ROLES) {
      for (const item of navItems) {
        for (const loc of LOCALES) {
          expect(isNavItemVisible(role, item), `${role} ${item.href}`).toBe(
            isAuthorizedForPath(role, `/${loc}${item.href}`)
          );
        }
      }
    }
    for (const item of navItems) expect(isNavItemVisible(null, item)).toBe(false);
  });
});

describe("F-2 — the pages gate on the organization, not on a platform role", () => {
  for (const route of DOC_PATHS) {
    it(`${route} requires the dashboard capability AND the organization permission`, () => {
      const src = readFileSync(join(process.cwd(), "src", "app", "[locale]", ...route.slice(1).split("/"), "page.tsx"), "utf8");
      expect(src).toContain('capability="dashboard"');
      expect(src).not.toContain('capability="admin"');
      expect(src).toContain("resolveDocumentPageAccess(await cookies())");
      expect(src).toContain("<DataUnavailableNotice code={access.code} />");
      expect(src).toContain("organizationId={access.organizationId}");
      expect(src).not.toMatch(/role\s*===\s*["'](admin|superadmin)["']/);
    });
  }
});
