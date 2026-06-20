/**
 * Site Isolation types — Phase 43.
 *
 * OWNER/ADMIN access model (confirmed rule):
 *   OrgRole OWNER and ADMIN have IMPLICIT access to all active sites in their
 *   org. Resolved dynamically at runtime. NO UserSite rows are created for them.
 *   UserSite rows are exclusively for explicit site assignments.
 */

export type SiteRole = "SITE_ADMIN" | "SITE_MANAGER" | "SITE_ENGINEER" | "SITE_OPERATOR" | "SITE_VIEWER";
export type SiteMemberStatus = "ACTIVE" | "SUSPENDED";

// Every permission a SiteRole can hold
export type SitePermission =
  | "view_site"
  | "manage_site"
  | "view_assets"
  | "manage_assets"
  | "view_telemetry"
  | "view_kpis"
  | "view_predictive"
  | "view_knowledge"
  | "manage_knowledge"
  | "view_multi_site"
  | "view_failures";

/** Resolved context for an authenticated user acting on a specific site. */
export interface SiteActorContext {
  userId:   string;
  orgId:    string;
  siteId:   string;
  role:     SiteRole;
  /** true when access derived from OWNER/ADMIN org role — no UserSite row exists */
  implicit: boolean;
}

/** UserSite row as returned by service functions. */
export interface UserSiteRecord {
  id:             string;
  userId:         string;
  siteId:         string;
  organizationId: string;
  role:           SiteRole;
  status:         SiteMemberStatus;
  grantedById:    string | null;
  createdAt:      string;
  updatedAt:      string;
}
