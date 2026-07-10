import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTROL_CENTER,
  controlCenterFor,
  isControlCenterItemVisible,
  type ControlCenterItem,
} from "@/lib/navigation/control-center";
import { isAuthorizedForPath, isProtectedPath } from "@/lib/auth/rbac";
import { can, type Role } from "@/lib/auth/roles";

/**
 * Phase 84 — Admin Control Center navigation / RBAC visibility regression suite.
 *
 * Locks the capability-driven visibility policy and, crucially, ties navigation
 * visibility to the REAL middleware authorization (isAuthorizedForPath) and the
 * actual page files on disk — so a link can never appear for a role that the
 * server would block, and never point at a route that does not exist.
 */

const ALL_ROLES: Role[] = ["superadmin", "admin", "engineer", "customer", "viewer", "candidate", "vendor"];
const ALL_ITEMS: ControlCenterItem[] = CONTROL_CENTER.flatMap((g) => g.items);

function groupKeys(role: Role): string[] {
  return controlCenterFor(role).map((g) => g.key);
}
function pageFileFor(href: string): string {
  // /admin/vendors -> src/app/[locale]/admin/vendors/page.tsx
  return join(process.cwd(), "src", "app", "[locale]", href.replace(/^\//, ""), "page.tsx");
}

// ── Role → visible groups matrix ─────────────────────────────────────────────

describe("control center — role visibility matrix", () => {
  it("superadmin sees administration, editorial and contributor tools", () => {
    expect(groupKeys("superadmin")).toEqual(["administration", "editorial", "contributor"]);
  });

  it("admin sees administration, editorial and contributor tools (not superadmin-only)", () => {
    expect(groupKeys("admin")).toEqual(["administration", "editorial", "contributor"]);
  });

  it("engineer sees contributor tools only — no administration or editorial", () => {
    expect(groupKeys("engineer")).toEqual(["contributor"]);
  });

  it("customer sees contributor tools but no administration or editorial", () => {
    expect(groupKeys("customer")).toEqual(["contributor"]);
  });

  it("vendor sees contributor tools but gains no admin/editorial access", () => {
    expect(groupKeys("vendor")).toEqual(["contributor"]);
  });

  it("viewer and candidate receive no contributor, admin or editorial items", () => {
    expect(groupKeys("viewer")).toEqual([]);
    expect(groupKeys("candidate")).toEqual([]);
  });

  it("a null/unauthenticated role sees nothing", () => {
    expect(controlCenterFor(null)).toEqual([]);
    expect(controlCenterFor(undefined)).toEqual([]);
  });
});

// ── Defect 1 regression: two distinct editorial routes ───────────────────────

describe("control center — editorial dashboard vs editorial board", () => {
  it("surfaces /articles/editor and /articles/editorial-board as distinct entries", () => {
    const editorial = CONTROL_CENTER.find((g) => g.key === "editorial")!;
    const dashboard = editorial.items.find((i) => i.key === "editorialDashboard");
    const board     = editorial.items.find((i) => i.key === "editorialBoard");
    expect(dashboard?.href).toBe("/articles/editor");
    expect(board?.href).toBe("/articles/editorial-board");
    // Neither replaces the other: distinct keys AND distinct hrefs, both admin.
    expect(dashboard!.key).not.toBe(board!.key);
    expect(dashboard!.href).not.toBe(board!.href);
    expect(dashboard!.capability).toBe("admin");
    expect(board!.capability).toBe("admin");
  });

  it("both editorial routes are admin/superadmin-only in middleware and hidden from non-admins", () => {
    for (const href of ["/articles/editor", "/articles/editorial-board"]) {
      for (const loc of ["en", "fa"]) {
        expect(isProtectedPath(`/${loc}${href}`)).toBe(true);
        expect(isAuthorizedForPath("admin", `/${loc}${href}`)).toBe(true);
        expect(isAuthorizedForPath("superadmin", `/${loc}${href}`)).toBe(true);
      }
      for (const role of ["engineer", "customer", "vendor", "viewer", "candidate"] as Role[]) {
        expect(isAuthorizedForPath(role, `/en${href}`)).toBe(false);
      }
    }
  });
});

// ── Defect 2 regression: contributor tools capability + terminology ──────────

describe("control center — contributor tools policy", () => {
  const contributor = CONTROL_CENTER.find((g) => g.key === "contributor")!;

  it("the contributor group exists with contributor (not authoring) terminology", () => {
    expect(contributor).toBeDefined();
    expect(contributor.labelEn).toBe("Contributor Tools");
    expect(CONTROL_CENTER.some((g) => g.key === "authoring")).toBe(false);
  });

  it("write + my-articles use the dashboard capability, matching their real guards", () => {
    const hrefs = contributor.items.map((i) => i.href);
    expect(hrefs).toEqual(expect.arrayContaining(["/articles/write", "/articles/my-articles"]));
    for (const item of contributor.items) expect(item.capability).toBe("dashboard");
  });

  it("customer and vendor satisfy the contributor capability but not admin", () => {
    for (const role of ["customer", "vendor"] as Role[]) {
      for (const item of contributor.items) {
        expect(isControlCenterItemVisible(role, item)).toBe(true);
      }
      expect(can(role, "dashboard")).toBe(true);
      expect(can(role, "admin")).toBe(false);
      expect(can(role, "authoring")).toBe(false);
    }
  });

  it("customer and vendor remain blocked from every editorial route", () => {
    const editorialHrefs = CONTROL_CENTER.find((g) => g.key === "editorial")!.items.map((i) => i.href);
    for (const role of ["customer", "vendor"] as Role[]) {
      for (const href of editorialHrefs) {
        expect(isAuthorizedForPath(role, `/en${href}`)).toBe(false);
        expect(isAuthorizedForPath(role, `/fa${href}`)).toBe(false);
      }
    }
  });

  it("the Admin Console host page remains inaccessible to non-admin roles", () => {
    for (const role of ["engineer", "customer", "vendor", "viewer", "candidate"] as Role[]) {
      expect(isAuthorizedForPath(role, "/en/admin")).toBe(false);
      expect(isAuthorizedForPath(role, "/fa/admin")).toBe(false);
    }
  });
});

// ── superadmin-only distinction ──────────────────────────────────────────────

describe("control center — superadmin-only gate", () => {
  it("a superadmin-only item is hidden from admin but shown to superadmin", () => {
    const superOnly = { capability: "admin", superadminOnly: true } as const;
    expect(isControlCenterItemVisible("admin", superOnly)).toBe(false);
    expect(isControlCenterItemVisible("superadmin", superOnly)).toBe(true);
  });

  it("admin does see a normal (non-superadmin-only) admin item", () => {
    expect(isControlCenterItemVisible("admin", { capability: "admin" })).toBe(true);
  });
});

// ── Registry integrity ───────────────────────────────────────────────────────

describe("control center — registry integrity", () => {
  it("has no duplicate item keys", () => {
    const keys = ALL_ITEMS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has no duplicate resolved paths", () => {
    const hrefs = ALL_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("every href is locale-agnostic (no hardcoded /en or /fa prefix)", () => {
    for (const it of ALL_ITEMS) {
      expect(it.href.startsWith("/")).toBe(true);
      expect(it.href).not.toMatch(/^\/(en|fa)(\/|$)/);
    }
  });

  it("carries no stale legacy /journal links; article links use /articles/*", () => {
    for (const it of ALL_ITEMS) {
      expect(it.href).not.toMatch(/^\/journal(\/|$)/);
    }
  });
});

// ── Every link points at a real page file ────────────────────────────────────

describe("control center — links resolve to real routes", () => {
  for (const item of ALL_ITEMS) {
    it(`${item.key} → ${item.href} has a page file`, () => {
      expect(existsSync(pageFileFor(item.href))).toBe(true);
    });
  }
});

// ── Navigation capability matches the route guard ────────────────────────────

describe("control center — admin/editorial links are admin-guarded", () => {
  for (const item of ALL_ITEMS.filter((i) => i.capability === "admin")) {
    it(`${item.key} page enforces capability="admin"`, () => {
      const file = pageFileFor(item.href);
      // /academy/admin guards via an explicit role check + middleware rather
      // than <RequireCapability>; assert its equivalent admin/superadmin gate.
      const src = readFileSync(file, "utf8");
      const guarded =
        src.includes('capability="admin"') ||
        (src.includes('role !== "admin"') && src.includes('"superadmin"'));
      expect(guarded).toBe(true);
    });
  }
});

describe("control center — contributor links are dashboard-guarded", () => {
  for (const item of ALL_ITEMS.filter((i) => i.capability === "dashboard")) {
    it(`${item.key} page enforces capability="dashboard"`, () => {
      const src = readFileSync(pageFileFor(item.href), "utf8");
      expect(src.includes('capability="dashboard"')).toBe(true);
      // Contributor tools must never carry the admin gate — customer/vendor
      // stay authorized for their own article workflow.
      expect(src.includes('capability="admin"')).toBe(false);
    });
  }
});

// ── Security invariant: visible ⇒ authorized by the real middleware ──────────

describe("control center — visibility never exceeds authorization", () => {
  it("every protected item route is actually protected by middleware", () => {
    for (const it of ALL_ITEMS) {
      expect(isProtectedPath(`/en${it.href}`)).toBe(true);
      expect(isProtectedPath(`/fa${it.href}`)).toBe(true);
    }
  });

  it("any role that can SEE an item can ACCESS its route (both locales)", () => {
    for (const role of ALL_ROLES) {
      for (const it of ALL_ITEMS) {
        if (!isControlCenterItemVisible(role, it)) continue;
        expect(isAuthorizedForPath(role, `/en${it.href}`)).toBe(true);
        expect(isAuthorizedForPath(role, `/fa${it.href}`)).toBe(true);
      }
    }
  });

  it("non-admin roles are never authorized for an admin-capability route they cannot see", () => {
    const adminItems = ALL_ITEMS.filter((i) => i.capability === "admin");
    for (const role of ["engineer", "customer", "vendor", "viewer", "candidate"] as Role[]) {
      for (const it of adminItems) {
        expect(isControlCenterItemVisible(role, it)).toBe(false);
        expect(isAuthorizedForPath(role, `/en${it.href}`)).toBe(false);
      }
    }
  });
});
