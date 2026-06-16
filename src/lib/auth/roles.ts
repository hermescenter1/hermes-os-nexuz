/**
 * Roles + access policy (Phase 12A).
 *
 * Three roles with a simple capability model:
 *   - admin:    full access (everything an engineer can do, plus admin)
 *   - engineer: studios + unknown center (authoring/triage)
 *   - viewer:   read-only public access
 *
 * Public pages require no role. Authoring surfaces require engineer or admin.
 */

export type Role = "admin" | "engineer" | "viewer";

export const ROLES: Role[] = ["admin", "engineer", "viewer"];

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as string[]).includes(v);
}

/** Capabilities gate-checked by protected routes. */
export type Capability = "authoring" | "admin";

const ROLE_CAPS: Record<Role, Capability[]> = {
  admin: ["authoring", "admin"],
  engineer: ["authoring"],
  viewer: [],
};

export function can(role: Role | null | undefined, cap: Capability): boolean {
  if (!role) return false;
  return ROLE_CAPS[role]?.includes(cap) ?? false;
}
