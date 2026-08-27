/**
 * RBAC helpers (Phase 28).
 *
 * This file is edge-safe: only imports `jose`-based JWT and config.
 * It is safe to import from Next.js middleware.
 *
 * For server-side API route protection (with node:crypto), use withAuth()
 * from rbac-server.ts instead.
 */

import { verifyAccessToken }       from "./jwt";
import { ACCESS_TOKEN_COOKIE }     from "./config";
import { can, canAccessEngineering, isRole, type Role } from "./roles";
import type { NextRequest }        from "next/server";

// ── Edge-safe: decode JWT from request cookies ────────────────────────────────

/** Extract role from the JWT access token cookie (edge-safe, async). */
export async function getRoleFromRequest(request: NextRequest): Promise<Role | null> {
  const at = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!at) return null;
  const payload = await verifyAccessToken(at);
  if (payload && isRole(payload.role)) return payload.role;
  return null;
}

// ── Segment-safe route matching (Phase 85) ────────────────────────────────────
//
// A protected route prefix may only match COMPLETE path segments: the route
// must be followed by "/" or the end of the pathname. Bare prefix regexes
// treated /fa/articles/editors-picks (public) as the admin-only
// /fa/articles/editor because nothing terminated the segment.

/** Boundary: the matched route must be followed by "/" or the end of the path. */
const SEGMENT_END = "(?=/|$)";

/**
 * Build a locale-aware (`/fa/…`, `/en/…`) matcher for `route` that only
 * matches complete path segments.
 *
 * @param route          Locale-less route without a leading slash, e.g.
 *                       "admin" or "knowledge/case-studio". Trusted regex
 *                       fragments such as "articles/(editor|reports)" are
 *                       allowed; every alternative terminates at a segment
 *                       boundary (backtracking tries the longer alternatives).
 * @param publicChildren Direct child segments of `route` that stay public,
 *                       e.g. ["register"] excludes "<route>/register" and its
 *                       subtree — but only as a whole segment, so
 *                       "<route>/registered" is still protected.
 */
export function localePathPattern(
  route: string,
  publicChildren: readonly string[] = []
): RegExp {
  const exclusions = publicChildren
    .map((child) => `(?!/${child}(?:/|$))`)
    .join("");
  return new RegExp(`^/[a-z]{2}/(?:${route})${SEGMENT_END}${exclusions}`);
}

// Shared by isProtectedPath() and isAuthorizedForPath() so the protection
// check and the role check can never drift apart.
const ENGINEERING           = localePathPattern("engineering");
const ADMIN                 = localePathPattern("admin");
const KNOWLEDGE_CASE_STUDIO = localePathPattern("knowledge/case-studio");
const KNOWLEDGE_STUDIO      = localePathPattern("knowledge/studio");
const INTELLIGENCE_UNKNOWN  = localePathPattern("intelligence/unknown");
// /candidate/register is a PUBLIC signup page — exclude it (and its subtree)
// from protection. All other /candidate/* paths (dashboard, applications,
// profile) are protected.
const CANDIDATE             = localePathPattern("candidate", ["register"]);
// Phase 60: Academy admin panel (admin only; main /academy remains public)
const ACADEMY_ADMIN         = localePathPattern("academy/admin");
// Phase 61: Compliance dashboard (admin only); privacy-center (any authenticated user)
const COMPLIANCE            = localePathPattern("compliance");
const PRIVACY_CENTER        = localePathPattern("privacy-center");
// Phase 64: Vendor portal (singular /vendor) — protected. The public /vendors
// directory is excluded by the segment boundary itself (no lookahead hack).
const VENDOR                = localePathPattern("vendor");
// Phase 65: Customer portal — all /customer/* paths require authentication
const CUSTOMER              = localePathPattern("customer");
// Phase 66: CRM — admin/engineer only
const CRM                   = localePathPattern("crm");
// Phase 67: Automation — admin/engineer only
const AUTOMATION            = localePathPattern("automation");
// Phase 68: ERP — admin/engineer only
const ERP                   = localePathPattern("erp");
// Phase 69: EDMS — admin/engineer only
const DOCUMENTS             = localePathPattern("documents");
// Phase 70: CMMS — admin/engineer only
const CMMS                  = localePathPattern("cmms");
// Phase 72: Asset Registry — admin/engineer only
const ASSETS                = localePathPattern("assets");
// Phase 72.5: Journal — authenticated-only sub-paths; public article routes
// (feed, editors-picks, latest, [slug], …) match neither group.
const ARTICLES_EDITORIAL     = localePathPattern("articles/(moderation|review-queue|reports|editorial-board|editor|submissions)");
const ARTICLES_AUTHENTICATED = localePathPattern("articles/(write|drafts|saved|following|my-articles|settings)");
// Phase 86C4B2B1D-SECURITY-4: Dashboard workspace — /dashboard was never
// registered here, so anonymous requests rendered the whole dashboard shell.
// Authorization follows the pre-existing "dashboard" capability in ROLE_CAPS
// (roles.ts): superadmin/admin/engineer/customer/vendor; viewer and candidate
// are denied.
const DASHBOARD              = localePathPattern("dashboard");

// PHASE 87L.6G: three administration surfaces that live UNDER /dashboard but
// are NOT ordinary workspace pages. They previously inherited the generic
// "dashboard" capability, which engineer holds — so engineers could reach
// billing, organization administration and API-key management. The accepted
// PHASE 87L.4 contract denies all three. These patterns are matched BEFORE the
// generic DASHBOARD branch in isAuthorizedForPath (order is load-bearing).
const BILLING_ADMIN          = localePathPattern("dashboard/billing");
const ORGANIZATION_ADMIN     = localePathPattern("dashboard/organization");
const API_PLATFORM_ADMIN     = localePathPattern("dashboard/api");

// ── PHASE 102: the public Video Hub ───────────────────────────────────────────
//
// /{locale}/videos and /{locale}/videos/[slug] are ANONYMOUS-READABLE by design.
// They serve only assets the repository has already gated to
// PUBLISHED + PUBLIC + READY (src/lib/media/db.ts), so there is nothing on them
// that requires a session — a login wall here would hide public marketing and
// training content from the visitors it exists for.
//
// Being public in this file means exactly one thing: NOT appearing in
// PROTECTED_PATHS. This constant does not add a rule, it records an intent and
// makes it testable. `isPublicAnonymousPath` exists so a regression — someone
// later registering a protected matcher whose segment happens to capture
// /videos — fails a test instead of silently 302-ing anonymous traffic to
// /auth/login. The route's own authorization stays where it belongs: in the
// repository query and in the byte-serving route, neither of which trusts this
// file.
//
// Editorial media surfaces (upload, review, moderation) are NOT under /videos —
// they live under /dashboard, which is already protected above.
const VIDEOS_PUBLIC          = localePathPattern("videos");

// ── Middleware guard ──────────────────────────────────────────────────────────

/** Paths that require authentication (locale-aware). */
export const PROTECTED_PATHS = [
  ENGINEERING,
  ADMIN,
  KNOWLEDGE_CASE_STUDIO,
  KNOWLEDGE_STUDIO,
  INTELLIGENCE_UNKNOWN,
  CANDIDATE,
  ACADEMY_ADMIN,
  COMPLIANCE,
  PRIVACY_CENTER,
  VENDOR,
  CUSTOMER,
  CRM,
  AUTOMATION,
  ERP,
  DOCUMENTS,
  CMMS,
  ASSETS,
  ARTICLES_EDITORIAL,
  ARTICLES_AUTHENTICATED,
  BILLING_ADMIN,
  ORGANIZATION_ADMIN,
  API_PLATFORM_ADMIN,
  DASHBOARD,
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((p) => p.test(pathname));
}

/**
 * DISCOVERY-2A — the same protected surface, expressed as plain path prefixes.
 *
 * WHY THIS IS A SEPARATE EXPORT AND NOT A REFACTOR
 * ------------------------------------------------
 * `robots.txt` and the sitemap guard both need to know which locale-prefixed
 * paths are private. Before this phase `robots.ts` carried its OWN hand-written
 * list of six prefixes while this file protected twenty-three, so fourteen
 * authenticated route families were advertised as crawlable and every unnamed
 * crawler was free to walk them.
 *
 * The obvious fix — deriving `PROTECTED_PATHS` from this array — would rewrite
 * the regexes that gate every authenticated request in the product. That is a
 * change to the authorization layer to fix an indexing bug, so it is not made
 * here. Instead this array restates the SAME literals that are passed to
 * `localePathPattern()` above, and
 * `src/lib/auth/__tests__/protected-prefix-contract.test.ts` proves the two
 * agree in BOTH directions: every prefix here is matched by some pattern, and
 * every pattern matches some prefix here. Adding a protected route without
 * adding it here fails that test.
 *
 * Each entry is locale-RELATIVE and carries no leading or trailing slash;
 * consumers expand it across locales themselves.
 *
 * `dashboard` deliberately covers `dashboard/billing`, `dashboard/organization`
 * and `dashboard/api`: those exist as separate patterns only to express a
 * stricter ROLE requirement, not a wider path.
 */
export const PROTECTED_ROUTE_PREFIXES: readonly string[] = [
  "engineering",
  "admin",
  "knowledge/case-studio",
  "knowledge/studio",
  "intelligence/unknown",
  "candidate",
  "academy/admin",
  "compliance",
  "privacy-center",
  "vendor",
  "customer",
  "crm",
  "automation",
  "erp",
  "documents",
  "cmms",
  "assets",
  "articles/moderation",
  "articles/review-queue",
  "articles/reports",
  "articles/editorial-board",
  "articles/editor",
  "articles/submissions",
  "articles/write",
  "articles/drafts",
  "articles/saved",
  "articles/following",
  "articles/my-articles",
  "articles/settings",
  "dashboard",
] as const;

/**
 * Locale-relative paths that stay PUBLIC even though a protected prefix above
 * captures their parent. Mirrors the `publicChildren` argument given to
 * `localePathPattern()` — today only the candidate signup page.
 *
 * A crawl policy that expands `PROTECTED_ROUTE_PREFIXES` must re-allow these, or
 * it will block a page anonymous visitors are meant to reach.
 */
export const PROTECTED_ROUTE_PUBLIC_CHILDREN: readonly string[] = [
  "candidate/register",
] as const;

/**
 * Routes that are PUBLIC by an explicit decision rather than by omission
 * (PHASE 102). Registering one here asserts nothing about authorization — the
 * middleware still consults `isProtectedPath` alone — it declares the intent so
 * that a later protected matcher accidentally capturing the same segment is
 * caught by `src/app/[locale]/videos/__tests__` instead of in production.
 */
export const PUBLIC_ANONYMOUS_PATHS = [
  VIDEOS_PUBLIC,
] as const;

/** True when `pathname` is a route Phase 102+ registered as anonymous-readable. */
export function isPublicAnonymousPath(pathname: string): boolean {
  return PUBLIC_ANONYMOUS_PATHS.some((p) => p.test(pathname));
}

export function isAuthorizedForPath(
  role:     Role,
  pathname: string
): boolean {
  if (ENGINEERING.test(pathname)) {
    return canAccessEngineering(role);
  }
  if (ADMIN.test(pathname)) {
    return role === "admin" || role === "superadmin";
  }
  if (CANDIDATE.test(pathname)) {
    return role === "candidate" || role === "admin" || role === "superadmin";
  }
  if (ACADEMY_ADMIN.test(pathname)) {
    return role === "admin" || role === "superadmin";
  }
  if (COMPLIANCE.test(pathname)) {
    return role === "admin" || role === "superadmin";
  }
  // privacy-center: any authenticated user
  if (PRIVACY_CENTER.test(pathname)) {
    return true; // all authenticated roles
  }
  // vendor portal: vendor role + admin/superadmin
  if (VENDOR.test(pathname)) {
    return role === "vendor" || role === "admin" || role === "superadmin";
  }
  // customer portal: customer role + admin/superadmin/engineer
  if (CUSTOMER.test(pathname)) {
    return role === "customer" || role === "admin" || role === "superadmin" || role === "engineer";
  }
  // CRM: admin/superadmin only.
  // PHASE 87L.4 AMENDMENT (owner-resolved): CRM holds customer pipeline and
  // commercial data, so engineer is denied here even though it retains access
  // to the engineering modules below. This supersedes the earlier
  // "admin/engineer" contract, which contradicted the admin-only layout guard.
  if (CRM.test(pathname)) {
    return role === "admin" || role === "superadmin";
  }
  // Automation: admin/superadmin/engineer (87L.4 amendment — engineering module)
  if (AUTOMATION.test(pathname)) {
    return role === "admin" || role === "superadmin" || role === "engineer";
  }
  // ERP: admin/superadmin only.
  // PHASE 87L.4 AMENDMENT (owner-resolved): ERP holds financial and business
  // operations data — engineer is denied, matching CRM above.
  if (ERP.test(pathname)) {
    return role === "admin" || role === "superadmin";
  }
  // EDMS: admin/superadmin/engineer (87L.4 amendment — engineering module)
  if (DOCUMENTS.test(pathname)) {
    return role === "admin" || role === "superadmin" || role === "engineer";
  }
  // CMMS: admin/superadmin/engineer (87L.4 amendment — engineering module)
  if (CMMS.test(pathname)) {
    return role === "admin" || role === "superadmin" || role === "engineer";
  }
  // Asset Registry: admin/superadmin/engineer (87L.4 amendment — engineering module)
  if (ASSETS.test(pathname)) {
    return role === "admin" || role === "superadmin" || role === "engineer";
  }
  // Journal editorial (moderation/review-queue/reports/editorial-board/editor/submissions): admin only
  if (ARTICLES_EDITORIAL.test(pathname)) {
    return role === "admin" || role === "superadmin";
  }
  // Journal authenticated (write/drafts/saved/following/my-articles/settings): any logged-in user
  if (ARTICLES_AUTHENTICATED.test(pathname)) {
    return true;
  }
  // PHASE 87L.6G — the three administration surfaces under /dashboard.
  // These MUST be tested before the generic DASHBOARD branch below, otherwise
  // the broader pattern would match first and grant engineer access again.
  if (BILLING_ADMIN.test(pathname)) {
    return can(role, "billing_admin");
  }
  if (ORGANIZATION_ADMIN.test(pathname)) {
    return can(role, "org_admin");
  }
  if (API_PLATFORM_ADMIN.test(pathname)) {
    return can(role, "api_admin");
  }
  // Dashboard workspace: gated by the "dashboard" capability (ROLE_CAPS) —
  // superadmin/admin/engineer/customer/vendor; viewer and candidate denied.
  if (DASHBOARD.test(pathname)) {
    return can(role, "dashboard");
  }
  return true;
}
