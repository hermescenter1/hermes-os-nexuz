/**
 * Roles + access policy (Phase 12A / Phase 28).
 *
 * Five roles with a capability model:
 *   - superadmin: full platform access (system-level)
 *   - admin:      full content + user management access
 *   - engineer:   studios + unknown center (authoring/triage)
 *   - customer:   authenticated read access to their tenant data
 *   - viewer:     read-only public access (legacy / unauthenticated)
 */

export type Role = "superadmin" | "admin" | "engineer" | "customer" | "viewer" | "candidate" | "vendor";

export const ROLES: Role[] = ["superadmin", "admin", "engineer", "customer", "viewer", "candidate", "vendor"];

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as string[]).includes(v);
}

/**
 * Capabilities gate-checked by protected routes.
 *
 * PHASE 87L.6G — the three administration capabilities below are DOMAIN-named,
 * not route-named, so the policy reads the same wherever it is applied and a
 * future route rename cannot silently change who is allowed in. They are
 * distinct from the broad `admin` capability so the commercial/administration
 * surfaces can diverge later (e.g. a dedicated billing administrator app role)
 * without touching every `admin` consumer. Today they resolve to exactly the
 * same roles as `admin`, so Admin and Superadmin behaviour is unchanged and no
 * role gains anything it did not already have.
 */
export type Capability =
  | "authoring"
  | "admin"
  | "superadmin"
  | "dashboard"
  /** Subscription, invoices, plan changes and usage administration. */
  | "billing_admin"
  /** Organization membership, invitations, departments and org settings. */
  | "org_admin"
  /** API key lifecycle, scopes and platform rate-limit administration. */
  | "api_admin";

const ROLE_CAPS: Record<Role, Capability[]> = {
  superadmin: ["authoring", "admin", "superadmin", "dashboard", "billing_admin", "org_admin", "api_admin"],
  admin:      ["authoring", "admin", "dashboard", "billing_admin", "org_admin", "api_admin"],
  // PHASE 87L.6G: engineer keeps authoring + dashboard. It is deliberately
  // absent from the three administration capabilities — the accepted PHASE
  // 87L.4 contract denies Billing, Organization administration and the API
  // Platform to engineers, alongside CRM, ERP and /admin.
  engineer:   ["authoring", "dashboard"],
  customer:   ["dashboard"],
  viewer:     [],
  candidate:  [],
  vendor:     ["dashboard"],
};

export function can(role: Role | null | undefined, cap: Capability): boolean {
  if (!role) return false;
  return ROLE_CAPS[role]?.includes(cap) ?? false;
}

/** Roles that are allowed to access the engineering dashboard. */
export const ENGINEERING_ROLES: Role[] = ["superadmin", "admin", "engineer"];

export function canAccessEngineering(role: Role | null | undefined): boolean {
  if (!role) return false;
  return ENGINEERING_ROLES.includes(role);
}
