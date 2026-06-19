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

export type Role = "superadmin" | "admin" | "engineer" | "customer" | "viewer";

export const ROLES: Role[] = ["superadmin", "admin", "engineer", "customer", "viewer"];

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as string[]).includes(v);
}

/** Capabilities gate-checked by protected routes. */
export type Capability = "authoring" | "admin" | "superadmin" | "dashboard";

const ROLE_CAPS: Record<Role, Capability[]> = {
  superadmin: ["authoring", "admin", "superadmin", "dashboard"],
  admin:      ["authoring", "admin", "dashboard"],
  engineer:   ["authoring", "dashboard"],
  customer:   ["dashboard"],
  viewer:     [],
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
