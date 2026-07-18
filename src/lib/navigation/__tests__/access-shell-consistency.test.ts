import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isAuthorizedForPath, isProtectedPath } from "@/lib/auth/rbac";
import { can, type Role } from "@/lib/auth/roles";
import {
  visibleAppNavGroups, activeAppNavHref, isItemActive, APP_NAV_GROUPS,
} from "@/lib/navigation/app-nav";

/**
 * PHASE 87L.4 — access, shell and navigation consistency.
 *
 * These tests pin the CURRENT, unchanged authorization behaviour plus the
 * documented conflict between layers, so the policy can never drift silently
 * while the owner decides it. No guard is weakened here.
 */

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const LOCALES = ["en", "fa"] as const;
/** Owner-approved 87L.4 amendment matrix. */
const ENGINEERING_MODULES = ["assets", "cmms", "automation", "documents"] as const;
const COMMERCIAL_MODULES  = ["crm", "erp"] as const;

describe("owner-approved access matrix — every layer agrees", () => {
  it("middleware: engineer passes the engineering modules and fails the commercial ones", () => {
    for (const loc of LOCALES) {
      for (const m of ENGINEERING_MODULES) {
        expect(isAuthorizedForPath("engineer", `/${loc}/${m}`), `engineer ${loc}/${m}`).toBe(true);
      }
      for (const m of COMMERCIAL_MODULES) {
        expect(isAuthorizedForPath("engineer", `/${loc}/${m}`), `engineer ${loc}/${m}`).toBe(false);
      }
      // admin and superadmin keep all six
      for (const role of ["admin", "superadmin"] as Role[]) {
        for (const m of [...ENGINEERING_MODULES, ...COMMERCIAL_MODULES]) {
          expect(isAuthorizedForPath(role, `/${loc}/${m}`), `${role} ${loc}/${m}`).toBe(true);
        }
      }
    }
  });

  it("layouts agree with middleware, and engineer never gains the global admin capability", () => {
    expect(can("engineer", "admin")).toBe(false);
    expect(can("engineer", "authoring")).toBe(true);
    for (const m of ENGINEERING_MODULES) {
      expect(read(`src/app/[locale]/${m}/layout.tsx`), m).toContain('capability="authoring"');
    }
    for (const m of COMMERCIAL_MODULES) {
      expect(read(`src/app/[locale]/${m}/layout.tsx`), m).toContain('capability="admin"');
    }
  });

  it("API guards agree: engineering keeps `authoring`, commercial is admin-only", () => {
    for (const rel of [
      "src/app/api/assets/dashboard/route.ts",
      "src/app/api/cmms/dashboard/route.ts",
    ]) {
      expect(read(rel), rel).toContain('can(user.role, "authoring")');
    }
    // no CRM or ERP route may admit `authoring` any more
    for (const rel of [
      "src/app/api/crm/accounts/route.ts",
      "src/app/api/crm/dashboard/route.ts",
      "src/app/api/erp/projects/route.ts",
      "src/app/api/erp/overview/route.ts",
    ]) {
      expect(read(rel), rel).not.toContain('can(user.role, "authoring")');
      expect(read(rel), rel).toContain('can(user.role, "admin")');
    }
  });

  it("navigation mirrors the matrix exactly for every role", () => {
    const hrefsFor = (role: Role) => visibleAppNavGroups(role).flatMap((g) => g.items.map((i) => i.href));
    const engineerHrefs = hrefsFor("engineer");
    for (const m of ENGINEERING_MODULES) expect(engineerHrefs, `engineer → /${m}`).toContain(`/${m}`);
    for (const m of COMMERCIAL_MODULES) expect(engineerHrefs, `engineer → /${m}`).not.toContain(`/${m}`);

    for (const role of ["admin", "superadmin"] as Role[]) {
      const hrefs = hrefsFor(role);
      for (const m of [...ENGINEERING_MODULES, ...COMMERCIAL_MODULES]) {
        expect(hrefs, `${role} → /${m}`).toContain(`/${m}`);
      }
    }
    // roles outside the matrix gain nothing from the amendment
    for (const role of ["customer", "vendor", "viewer", "candidate"] as Role[]) {
      const hrefs = hrefsFor(role);
      for (const m of [...ENGINEERING_MODULES, ...COMMERCIAL_MODULES]) {
        expect(hrefs, `${role} → /${m}`).not.toContain(`/${m}`);
      }
    }
  });

  it("an engineer who reaches an ops route server-renders a denial, never protected content", () => {
    const guard = read("src/components/auth/RequireCapability.tsx");
    expect(guard).toContain("if (!can(user.role, capability))");
    expect(guard).toContain("deniedTitle");
    // the denial is server-rendered — no client redirect, so no protected flash
    // and no redirect loop is possible from the guard itself
    expect(guard).not.toMatch(/useEffect|router\.(push|replace)|redirect\(/);
  });

  it("admin-only routes stay admin-only — no guard was weakened", () => {
    for (const section of ["/admin", "/compliance", "/academy/admin"]) {
      for (const loc of LOCALES) {
        expect(isAuthorizedForPath("engineer", `/${loc}${section}`)).toBe(false);
        expect(isAuthorizedForPath("admin", `/${loc}${section}`)).toBe(true);
      }
    }
  });
});

describe("navigation visibility follows the access contract", () => {
  it("anonymous users get no authenticated workspace navigation", () => {
    expect(visibleAppNavGroups(null).flatMap((g) => g.items)).toHaveLength(0);
  });

  it("every item a role can see is a destination that role can actually open", () => {
    // the contract is reachability, not protection: a few registry entries are
    // PUBLIC content pages (/industrial-brain, /library, /articles root — only
    // its authoring/editorial sub-paths are protected), so a capability-less
    // `viewer` legitimately sees those and nothing else.
    for (const role of ["viewer", "candidate", "engineer", "customer", "vendor", "admin", "superadmin"] as Role[]) {
      for (const item of visibleAppNavGroups(role).flatMap((g) => g.items)) {
        expect(isAuthorizedForPath(role, `/en${item.href}`), `${role} → ${item.href}`).toBe(true);
      }
    }
  });

  it("capability-less roles are offered public destinations only — never a protected module", () => {
    for (const role of ["viewer", "candidate"] as Role[]) {
      for (const item of visibleAppNavGroups(role).flatMap((g) => g.items)) {
        expect(isProtectedPath(`/en${item.href}`), `${role} → ${item.href}`).toBe(false);
      }
    }
  });

  it("no navigation href is locale-prefixed and no API path is registered", () => {
    for (const item of APP_NAV_GROUPS.flatMap((g) => g.items)) {
      expect(item.href, item.href).not.toMatch(/^\/(en|fa|de)\//);
      expect(item.href, item.href).not.toMatch(/^\/api\//);
      expect(item.href.startsWith("/"), item.href).toBe(true);
    }
  });
});

describe("desktop and mobile parity — one source, one contract", () => {
  it("AppShell computes the group list once server-side and hands the SAME array to every consumer", () => {
    const shell = read("src/components/app-shell/AppShell.tsx");
    expect(shell).toContain("visibleAppNavGroups(user?.role ?? null)");
    // exactly one derivation — no per-surface recomputation, no client role fetch
    expect(shell.match(/visibleAppNavGroups\(/g)!).toHaveLength(1);
    for (const consumer of ["<AppSidebar groups={groups}", "groups={groups}"]) {
      expect(shell).toContain(consumer);
    }
  });

  it("both navigations resolve the active item through the same shared helper", () => {
    for (const rel of [
      "src/components/app-shell/AppSidebar.tsx",
      "src/components/app-shell/AppMobileNav.tsx",
    ]) {
      const src = read(rel);
      expect(src, rel).toContain("activeAppNavHref(pathname, groups)");
      // locale-preserving Link + locale-stripped pathname, from the i18n layer
      expect(src, rel).toContain('from "@/i18n/navigation"');
      expect(src, rel).toContain('aria-current={active ? "page" : undefined}');
      // neither re-implements filtering or role logic locally
      expect(src, rel).not.toMatch(/ROLE_CAPS|can\(|pageCapability/);
    }
  });
});

describe("active-state matching respects route boundaries", () => {
  it("a sibling route with a shared prefix never activates its neighbour", () => {
    // /assets must not be activated by a hypothetical /assets-archive
    expect(isItemActive("/assets-archive", { href: "/assets", match: "prefix" })).toBe(false);
    expect(isItemActive("/assets", { href: "/assets", match: "prefix" })).toBe(true);
    expect(isItemActive("/assets/PMP-204", { href: "/assets", match: "prefix" })).toBe(true);
  });

  it('"exact" hubs do not stay active on their deeper siblings', () => {
    expect(isItemActive("/dashboard", { href: "/dashboard", match: "exact" })).toBe(true);
    expect(isItemActive("/dashboard/crm", { href: "/dashboard", match: "exact" })).toBe(false);
  });

  it("nested routes activate the deepest registered item (longest-prefix wins)", () => {
    expect(activeAppNavHref("/dashboard/knowledge/cases")).not.toBe("/dashboard");
    expect(activeAppNavHref("/documents/approvals")).toBe("/documents");
    expect(activeAppNavHref("/nothing/registered/here")).toBeNull();
  });

  it("matching is locale-agnostic — FA and EN behave identically", () => {
    // usePathname() from @/i18n/navigation strips the locale before matching,
    // so a locale-prefixed pathname must NOT match a registry href
    for (const loc of LOCALES) {
      expect(activeAppNavHref(`/${loc}/documents`)).toBeNull();
    }
    expect(activeAppNavHref("/documents")).toBe("/documents");
  });
});

describe("public shell separation and polling", () => {
  it("the public header never renders the authenticated AppShell", () => {
    const header = read("src/components/public-site/PublicHeader.tsx");
    expect(header).not.toContain("AppShell");
    expect(header).not.toContain("visibleAppNavGroups");
  });

  it("an anonymous visitor on a public page starts no polling loop and no SSE channel", () => {
    const src = read("src/components/NotificationCenter.tsx");
    // /api/notifications/unread-count answers 200 {count:0} for anonymous
    // callers (verified in the browser), so it cannot be the auth signal —
    // /api/auth reports `user: null` explicitly and is used instead.
    expect(src).toContain('fetch("/api/auth")');
    expect(src).toContain("setSignedIn(Boolean(data.user))");
    // both the 60s poll and the realtime channel start ONLY once a session is
    // confirmed — `!== true` also covers the pre-signal window, so an
    // anonymous page issues no notification request at all
    expect(src.match(/if \(signedIn !== true\) return;/g)!).toHaveLength(2);
    // …and both re-run once that signal arrives
    expect(src).toContain("[fetchUnreadCount, signedIn]");
    expect(src).toContain("}, [signedIn]);");
  });

  it("a session expiring mid-visit stops the loop, but a transient 5xx does not", () => {
    const src = read("src/components/NotificationCenter.tsx");
    expect(src).toContain("res.status === 401 || res.status === 403");
    expect(src).toContain("unauthenticatedRef.current = true");
    // the generic !res.ok branch returns WITHOUT latching the flag
    expect(src.slice(src.indexOf("if (!res.ok) return;"), src.indexOf("if (!res.ok) return;") + 90))
      .not.toContain("unauthenticatedRef");
  });
});
