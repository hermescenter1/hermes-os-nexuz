/**
 * Site-level RBAC — Phase 43.
 * Deterministic permission lookup — no wildcards, no inheritance chains.
 */

import type { SiteRole, SitePermission } from "./types";

const SITE_PERMISSIONS: Record<SitePermission, SiteRole[]> = {
  view_site:        ["SITE_ADMIN", "SITE_MANAGER", "SITE_ENGINEER", "SITE_OPERATOR", "SITE_VIEWER"],
  manage_site:      ["SITE_ADMIN", "SITE_MANAGER"],
  view_assets:      ["SITE_ADMIN", "SITE_MANAGER", "SITE_ENGINEER", "SITE_OPERATOR", "SITE_VIEWER"],
  manage_assets:    ["SITE_ADMIN", "SITE_MANAGER"],
  view_telemetry:   ["SITE_ADMIN", "SITE_MANAGER", "SITE_ENGINEER", "SITE_OPERATOR", "SITE_VIEWER"],
  view_kpis:        ["SITE_ADMIN", "SITE_MANAGER", "SITE_ENGINEER", "SITE_VIEWER"],
  view_predictive:  ["SITE_ADMIN", "SITE_MANAGER", "SITE_ENGINEER"],
  view_knowledge:   ["SITE_ADMIN", "SITE_MANAGER", "SITE_ENGINEER", "SITE_OPERATOR", "SITE_VIEWER"],
  manage_knowledge: ["SITE_ADMIN", "SITE_MANAGER", "SITE_ENGINEER"],
  view_multi_site:  ["SITE_ADMIN", "SITE_MANAGER", "SITE_ENGINEER", "SITE_VIEWER"],
  view_failures:    ["SITE_ADMIN", "SITE_MANAGER", "SITE_ENGINEER", "SITE_OPERATOR", "SITE_VIEWER"],
};

export function canOnSite(role: SiteRole, permission: SitePermission): boolean {
  return (SITE_PERMISSIONS[permission] as SiteRole[]).includes(role);
}

export function requireSitePermission(
  role:       SiteRole,
  permission: SitePermission,
): { ok: true } | { ok: false; error: string; status: number } {
  if (!canOnSite(role, permission)) {
    return { ok: false, error: "Insufficient site permissions", status: 403 };
  }
  return { ok: true };
}
