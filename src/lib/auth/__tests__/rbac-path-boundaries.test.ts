import { describe, it, expect } from "vitest";
import {
  isProtectedPath,
  isAuthorizedForPath,
  localePathPattern,
  PROTECTED_PATHS,
} from "@/lib/auth/rbac";
import type { Role } from "@/lib/auth/roles";

/**
 * Phase 85 — Protected-route segment-boundary regression suite.
 *
 * The middleware matcher must treat protected route names as COMPLETE path
 * segments. Before this phase, bare prefix regexes made the public
 * /articles/editors-picks match the admin-only /articles/editor.
 *
 * Note on the unauthenticated case: middleware denies any request without a
 * decodable role on every path where isProtectedPath() is true (it redirects
 * to /{locale}/auth/login before isAuthorizedForPath is ever consulted), so
 * `isProtectedPath(p) === true` is the unauthenticated-denial assertion.
 */

const LOCALES = ["fa", "en"] as const;

const ADMIN_ROLES: Role[]     = ["admin", "superadmin"];
const NON_ADMIN_ROLES: Role[] = ["engineer", "customer", "vendor", "viewer", "candidate"];

const EDITORIAL_ROUTES = [
  "/articles/editor",
  "/articles/editorial-board",
  "/articles/review-queue",
  "/articles/submissions",
  "/articles/moderation",
  "/articles/reports",
] as const;

// ── The defect: /articles/editor vs /articles/editors-picks ─────────────────

describe("segment boundary — /articles/editor vs /articles/editors-picks", () => {
  for (const loc of LOCALES) {
    it(`/${loc}/articles/editor and nested children stay protected`, () => {
      expect(isProtectedPath(`/${loc}/articles/editor`)).toBe(true);
      expect(isProtectedPath(`/${loc}/articles/editor/`)).toBe(true);
      expect(isProtectedPath(`/${loc}/articles/editor/anything`)).toBe(true);
      expect(isProtectedPath(`/${loc}/articles/editor/anything/deeper`)).toBe(true);
    });

    it(`/${loc}/articles/editors-picks is NOT protected (public route policy applies)`, () => {
      expect(isProtectedPath(`/${loc}/articles/editors-picks`)).toBe(false);
      expect(isProtectedPath(`/${loc}/articles/editors-picks/`)).toBe(false);
      expect(isProtectedPath(`/${loc}/articles/editors-picks/example`)).toBe(false);
    });
  }

  it("editors-picks no longer inherits the editorial admin gate in isAuthorizedForPath", () => {
    // Public paths fall through every route rule to the permissive default —
    // no role is singled out by the editorial matcher any more.
    for (const role of [...ADMIN_ROLES, ...NON_ADMIN_ROLES]) {
      expect(isAuthorizedForPath(role, "/fa/articles/editors-picks")).toBe(true);
      expect(isAuthorizedForPath(role, "/en/articles/editors-picks/example")).toBe(true);
    }
  });
});

// ── All six editorial routes: full role matrix, both locales ─────────────────

describe("editorial routes — admin/superadmin only, everyone else denied", () => {
  for (const route of EDITORIAL_ROUTES) {
    it(`${route} is protected and admin-gated in fa and en (incl. nested + trailing slash)`, () => {
      for (const loc of LOCALES) {
        for (const path of [`/${loc}${route}`, `/${loc}${route}/`, `/${loc}${route}/item-1`]) {
          expect(isProtectedPath(path)).toBe(true); // unauthenticated → login redirect
          for (const role of ADMIN_ROLES)     expect(isAuthorizedForPath(role, path)).toBe(true);
          for (const role of NON_ADMIN_ROLES) expect(isAuthorizedForPath(role, path)).toBe(false);
        }
      }
    });
  }
});

// ── Article-slug prefix collisions ([slug] pages starting with a protected word)

describe("segment boundary — public article slugs that extend a protected name", () => {
  const publicSlugs = [
    "/articles/writers-guide",        // vs /articles/write
    "/articles/drafts-vs-final",      // vs /articles/drafts
    "/articles/settings-of-a-plc",    // vs /articles/settings
    "/articles/reports-2026",         // vs /articles/reports
    "/articles/saved-by-redundancy",  // vs /articles/saved
    "/articles/submissions-open",     // vs /articles/submissions
    "/articles/moderation-in-forums", // vs /articles/moderation
    "/articles/editorمقاله",          // Unicode slug (Phase 83) vs /articles/editor
  ];
  for (const slug of publicSlugs) {
    it(`${slug} follows the public [slug] route policy`, () => {
      for (const loc of LOCALES) {
        expect(isProtectedPath(`/${loc}${slug}`)).toBe(false);
      }
    });
  }

  it("/articles/editorial-board still matches its own alternative, not just 'editor'", () => {
    for (const loc of LOCALES) {
      expect(isProtectedPath(`/${loc}/articles/editorial-board`)).toBe(true);
      expect(isProtectedPath(`/${loc}/articles/editorial-board/members`)).toBe(true);
      expect(isAuthorizedForPath("engineer", `/${loc}/articles/editorial-board/members`)).toBe(false);
      expect(isAuthorizedForPath("admin", `/${loc}/articles/editorial-board/members`)).toBe(true);
    }
  });
});

// ── /vendor (portal) vs /vendors (public directory) ─────────────────────────

describe("segment boundary — /vendor portal vs /vendors directory", () => {
  for (const loc of LOCALES) {
    it(`/${loc}/vendors and its children stay public`, () => {
      expect(isProtectedPath(`/${loc}/vendors`)).toBe(false);
      expect(isProtectedPath(`/${loc}/vendors/`)).toBe(false);
      expect(isProtectedPath(`/${loc}/vendors/apply`)).toBe(false);
      expect(isProtectedPath(`/${loc}/vendors/some-vendor-id`)).toBe(false);
    });

    it(`/${loc}/vendor stays protected for the vendor role (+ admins)`, () => {
      for (const path of [`/${loc}/vendor`, `/${loc}/vendor/`, `/${loc}/vendor/dashboard`]) {
        expect(isProtectedPath(path)).toBe(true);
        expect(isAuthorizedForPath("vendor", path)).toBe(true);
        expect(isAuthorizedForPath("admin", path)).toBe(true);
        expect(isAuthorizedForPath("superadmin", path)).toBe(true);
        expect(isAuthorizedForPath("customer", path)).toBe(false);
        expect(isAuthorizedForPath("viewer", path)).toBe(false);
      }
    });
  }
});

// ── /candidate with segment-safe /register exclusion ────────────────────────

describe("segment boundary — /candidate/register public carve-out", () => {
  for (const loc of LOCALES) {
    it(`/${loc}/candidate/register (and subtree) stays public`, () => {
      expect(isProtectedPath(`/${loc}/candidate/register`)).toBe(false);
      expect(isProtectedPath(`/${loc}/candidate/register/`)).toBe(false);
      expect(isProtectedPath(`/${loc}/candidate/register/step-2`)).toBe(false);
    });

    it(`/${loc}/candidate and other children stay protected for candidate (+ admins)`, () => {
      for (const path of [`/${loc}/candidate`, `/${loc}/candidate/`, `/${loc}/candidate/applications`]) {
        expect(isProtectedPath(path)).toBe(true);
        expect(isAuthorizedForPath("candidate", path)).toBe(true);
        expect(isAuthorizedForPath("admin", path)).toBe(true);
        expect(isAuthorizedForPath("customer", path)).toBe(false);
      }
    });
  }

  it("the carve-out is itself segment-safe: /candidate/registered is protected", () => {
    // Only the complete "register" segment is public — a hypothetical
    // "registered" sibling must not slip through the exclusion.
    expect(isProtectedPath("/fa/candidate/registered")).toBe(true);
    expect(isProtectedPath("/en/candidate/registered-users")).toBe(true);
  });
});

// ── Other real and hypothetical prefix collisions ────────────────────────────

describe("segment boundary — similar-looking public paths never match", () => {
  const publicPaths = [
    "/privacy",             // vs /privacy-center (real public page)
    "/academy",             // vs /academy/admin  (real public page)
    "/academy/course",      // real public page under a partially-guarded section
    "/knowledge",           // parent of the two protected studios
    "/admins",              // vs /admin
    "/administration",      // vs /admin
    "/engineering-blog",    // vs /engineering
    "/customers",           // vs /customer
    "/assets-viewer",       // vs /assets
    "/documentspublic",     // vs /documents
    "/crm-tools",           // vs /crm
    "/erp2",                // vs /erp
    "/compliance-report",   // vs /compliance
    "/knowledge/studios",   // vs /knowledge/studio
    "/knowledge/case-studios", // vs /knowledge/case-studio
    "/intelligence/unknowns",  // vs /intelligence/unknown
    "/academy/administration", // vs /academy/admin
  ];
  for (const p of publicPaths) {
    it(`${p} is not captured by any protected matcher`, () => {
      for (const loc of LOCALES) {
        expect(isProtectedPath(`/${loc}${p}`)).toBe(false);
      }
    });
  }
});

// ── No weakening: every protected section still matches (root, child, slash) ─

describe("no regression — every protected route still matches in fa and en", () => {
  const stillProtected = [
    "/engineering",
    "/admin",
    "/knowledge/case-studio",
    "/knowledge/studio",
    "/intelligence/unknown",
    "/candidate",
    "/academy/admin",
    "/compliance",
    "/privacy-center",
    "/vendor",
    "/customer",
    "/crm",
    "/automation",
    "/erp",
    "/documents",
    "/cmms",
    "/assets",
    "/articles/write",
    "/articles/drafts",
    "/articles/saved",
    "/articles/following",
    "/articles/my-articles",
    "/articles/settings",
    ...EDITORIAL_ROUTES,
  ];
  for (const route of stillProtected) {
    it(`${route} — exact, trailing slash, and nested child are protected`, () => {
      for (const loc of LOCALES) {
        expect(isProtectedPath(`/${loc}${route}`)).toBe(true);
        expect(isProtectedPath(`/${loc}${route}/`)).toBe(true);
        expect(isProtectedPath(`/${loc}${route}/nested`)).toBe(true);
      }
    });
  }
});

describe("no regression — role policies are unchanged", () => {
  it("engineering: engineer/admin/superadmin only", () => {
    for (const loc of LOCALES) {
      for (const role of ["engineer", "admin", "superadmin"] as Role[]) {
        expect(isAuthorizedForPath(role, `/${loc}/engineering`)).toBe(true);
      }
      for (const role of ["customer", "vendor", "viewer", "candidate"] as Role[]) {
        expect(isAuthorizedForPath(role, `/${loc}/engineering`)).toBe(false);
      }
    }
  });

  // PHASE 87L.4 AMENDMENT (owner-resolved): the ops sections split in two. The
  // engineering modules admit engineer; the commercial modules (CRM/ERP) do
  // not. This supersedes the previous single "all six admit engineer" contract,
  // which contradicted the admin-only layout guards those routes shipped with.
  it("engineering sections (automation/documents/cmms/assets): admin/superadmin/engineer", () => {
    for (const section of ["/automation", "/documents", "/cmms", "/assets"]) {
      for (const loc of LOCALES) {
        for (const role of ["admin", "superadmin", "engineer"] as Role[]) {
          expect(isAuthorizedForPath(role, `/${loc}${section}`), `${role} ${section}`).toBe(true);
        }
        for (const role of ["customer", "vendor", "viewer", "candidate"] as Role[]) {
          expect(isAuthorizedForPath(role, `/${loc}${section}`), `${role} ${section}`).toBe(false);
        }
      }
    }
  });

  it("commercial sections (crm/erp): admin/superadmin only — engineer denied", () => {
    for (const section of ["/crm", "/erp"]) {
      for (const loc of LOCALES) {
        for (const role of ["admin", "superadmin"] as Role[]) {
          expect(isAuthorizedForPath(role, `/${loc}${section}`), `${role} ${section}`).toBe(true);
        }
        for (const role of ["engineer", "customer", "vendor", "viewer", "candidate"] as Role[]) {
          expect(isAuthorizedForPath(role, `/${loc}${section}`), `${role} ${section}`).toBe(false);
        }
      }
    }
  });

  it("admin + compliance + academy/admin: admin/superadmin only", () => {
    for (const section of ["/admin", "/compliance", "/academy/admin"]) {
      for (const loc of LOCALES) {
        for (const role of ADMIN_ROLES)     expect(isAuthorizedForPath(role, `/${loc}${section}`)).toBe(true);
        for (const role of NON_ADMIN_ROLES) expect(isAuthorizedForPath(role, `/${loc}${section}`)).toBe(false);
      }
    }
  });

  it("customer portal: customer/engineer/admin/superadmin; privacy-center: any authenticated", () => {
    for (const loc of LOCALES) {
      for (const role of ["customer", "engineer", "admin", "superadmin"] as Role[]) {
        expect(isAuthorizedForPath(role, `/${loc}/customer`)).toBe(true);
      }
      expect(isAuthorizedForPath("vendor", `/${loc}/customer`)).toBe(false);
      for (const role of [...ADMIN_ROLES, ...NON_ADMIN_ROLES]) {
        expect(isAuthorizedForPath(role, `/${loc}/privacy-center`)).toBe(true);
      }
    }
  });

  it("authenticated journal tools (write/drafts/saved/following/my-articles/settings) stay open to every logged-in role", () => {
    for (const route of ["/articles/write", "/articles/drafts", "/articles/saved", "/articles/following", "/articles/my-articles", "/articles/settings"]) {
      for (const loc of LOCALES) {
        for (const role of [...ADMIN_ROLES, ...NON_ADMIN_ROLES]) {
          expect(isAuthorizedForPath(role, `/${loc}${route}`)).toBe(true);
        }
      }
    }
  });
});

// ── The matcher builder itself ────────────────────────────────────────────────

describe("localePathPattern — builder semantics", () => {
  it("matches only at segment boundaries (end of path or '/')", () => {
    const p = localePathPattern("articles/editor");
    expect(p.test("/fa/articles/editor")).toBe(true);
    expect(p.test("/fa/articles/editor/")).toBe(true);
    expect(p.test("/fa/articles/editor/x")).toBe(true);
    expect(p.test("/fa/articles/editors-picks")).toBe(false);
    expect(p.test("/fa/articles/editorial-board")).toBe(false);
  });

  it("requires the locale segment", () => {
    const p = localePathPattern("admin");
    expect(p.test("/fa/admin")).toBe(true);
    expect(p.test("/en/admin")).toBe(true);
    expect(p.test("/admin")).toBe(false); // locale-less URLs are redirected by next-intl first
  });

  it("alternation groups backtrack to the correct alternative", () => {
    const p = localePathPattern("articles/(editor|editorial-board)");
    expect(p.test("/fa/articles/editor")).toBe(true);
    expect(p.test("/fa/articles/editorial-board")).toBe(true);
    expect(p.test("/fa/articles/editors-picks")).toBe(false);
  });

  it("publicChildren excludes whole segments only", () => {
    const p = localePathPattern("candidate", ["register"]);
    expect(p.test("/fa/candidate")).toBe(true);
    expect(p.test("/fa/candidate/register")).toBe(false);
    expect(p.test("/fa/candidate/register/step")).toBe(false);
    expect(p.test("/fa/candidate/registered")).toBe(true);
  });

  it("every PROTECTED_PATHS entry ends at a segment boundary (no bare prefixes)", () => {
    for (const pattern of PROTECTED_PATHS) {
      // RegExp.source re-escapes "/" as "\/"
      expect(pattern.source).toContain("(?=\\/|$)");
    }
  });
});
