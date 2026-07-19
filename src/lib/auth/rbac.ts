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

/** Synchronous quick-decode (does NOT verify signature — middleware pre-check only). */
export function getRoleFromRequestSync(request: NextRequest): Role | null {
  const at = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!at) return null;
  try {
    const parts = at.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString()
    ) as Record<string, unknown>;
    // Reject expired tokens even in sync decode
    const exp = typeof payload.exp === "number" ? payload.exp : 0;
    if (exp > 0 && exp < Math.floor(Date.now() / 1000)) return null;
    const role = String(payload.role ?? "");
    return isRole(role) ? role : null;
  } catch {
    return null;
  }
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
