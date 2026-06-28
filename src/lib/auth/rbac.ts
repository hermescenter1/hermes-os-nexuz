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
import { canAccessEngineering, isRole, type Role } from "./roles";
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

// ── Middleware guard ──────────────────────────────────────────────────────────

/** Paths that require authentication (locale-aware). */
export const PROTECTED_PATHS = [
  /^\/[a-z]{2}\/engineering/,
  /^\/[a-z]{2}\/admin/,
  /^\/[a-z]{2}\/knowledge\/case-studio/,
  /^\/[a-z]{2}\/knowledge\/studio/,
  /^\/[a-z]{2}\/intelligence\/unknown/,
  // /candidate/register is a PUBLIC signup page — exclude it from protection.
  // All other /candidate/* paths (dashboard, applications, profile) are protected.
  /^\/[a-z]{2}\/candidate(?!\/register)/,
  // Phase 60: Academy admin panel (admin only; main /academy remains public)
  /^\/[a-z]{2}\/academy\/admin/,
  // Phase 61: Compliance dashboard (admin only); privacy-center (any authenticated user)
  /^\/[a-z]{2}\/compliance/,
  /^\/[a-z]{2}\/privacy-center/,
  // Phase 64: Vendor portal (singular /vendor) — protected; /vendors directory is public
  /^\/[a-z]{2}\/vendor(?!s)/,
  // Phase 65: Customer portal — all /customer/* paths require authentication
  /^\/[a-z]{2}\/customer/,
  // Phase 66: CRM — admin/engineer only
  /^\/[a-z]{2}\/crm/,
  // Phase 67: Automation — admin/engineer only
  /^\/[a-z]{2}\/automation/,
  // Phase 68: ERP — admin/engineer only
  /^\/[a-z]{2}\/erp/,
  // Phase 69: EDMS — admin/engineer only
  /^\/[a-z]{2}\/documents/,
  // Phase 70: CMMS — admin/engineer only
  /^\/[a-z]{2}\/cmms/,
  // Phase 72: Asset Registry — admin/engineer only
  /^\/[a-z]{2}\/assets/,
  // Phase 72.5: Journal — authenticated-only sub-paths (public paths remain open)
  /^\/[a-z]{2}\/articles\/(write|drafts|saved|following|my-articles|editor|submissions|settings|moderation|review-queue|reports|editorial-board)/,
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((p) => p.test(pathname));
}

export function isAuthorizedForPath(
  role:     Role,
  pathname: string
): boolean {
  if (/^\/[a-z]{2}\/engineering/.test(pathname)) {
    return canAccessEngineering(role);
  }
  if (/^\/[a-z]{2}\/admin/.test(pathname)) {
    return role === "admin" || role === "superadmin";
  }
  if (/^\/[a-z]{2}\/candidate(?!\/register)/.test(pathname)) {
    return role === "candidate" || role === "admin" || role === "superadmin";
  }
  if (/^\/[a-z]{2}\/academy\/admin/.test(pathname)) {
    return role === "admin" || role === "superadmin";
  }
  if (/^\/[a-z]{2}\/compliance/.test(pathname)) {
    return role === "admin" || role === "superadmin";
  }
  // privacy-center: any authenticated user
  if (/^\/[a-z]{2}\/privacy-center/.test(pathname)) {
    return true; // all authenticated roles
  }
  // vendor portal: vendor role + admin/superadmin
  if (/^\/[a-z]{2}\/vendor(?!s)/.test(pathname)) {
    return role === "vendor" || role === "admin" || role === "superadmin";
  }
  // customer portal: customer role + admin/superadmin/engineer
  if (/^\/[a-z]{2}\/customer/.test(pathname)) {
    return role === "customer" || role === "admin" || role === "superadmin" || role === "engineer";
  }
  // CRM: admin/superadmin/engineer only
  if (/^\/[a-z]{2}\/crm/.test(pathname)) {
    return role === "admin" || role === "superadmin" || role === "engineer";
  }
  // Automation: admin/superadmin/engineer only
  if (/^\/[a-z]{2}\/automation/.test(pathname)) {
    return role === "admin" || role === "superadmin" || role === "engineer";
  }
  // ERP: admin/superadmin/engineer only
  if (/^\/[a-z]{2}\/erp/.test(pathname)) {
    return role === "admin" || role === "superadmin" || role === "engineer";
  }
  // EDMS: admin/superadmin/engineer only
  if (/^\/[a-z]{2}\/documents/.test(pathname)) {
    return role === "admin" || role === "superadmin" || role === "engineer";
  }
  // CMMS: admin/superadmin/engineer only
  if (/^\/[a-z]{2}\/cmms/.test(pathname)) {
    return role === "admin" || role === "superadmin" || role === "engineer";
  }
  // Asset Registry: admin/superadmin/engineer only
  if (/^\/[a-z]{2}\/assets/.test(pathname)) {
    return role === "admin" || role === "superadmin" || role === "engineer";
  }
  // Journal editorial (moderation/review-queue/reports/editorial-board/editor/submissions): admin only
  if (/^\/[a-z]{2}\/articles\/(moderation|review-queue|reports|editorial-board|editor|submissions)/.test(pathname)) {
    return role === "admin" || role === "superadmin";
  }
  // Journal authenticated (write/drafts/saved/following/my-articles/settings): any logged-in user
  if (/^\/[a-z]{2}\/articles\/(write|drafts|saved|following|my-articles|settings)/.test(pathname)) {
    return true;
  }
  return true;
}
