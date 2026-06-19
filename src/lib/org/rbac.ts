/**
 * Organization-level RBAC (Phase 32).
 * Defines what each OrgRole can do within an organization.
 */

import type { OrgRole } from "./types";

export type OrgPermission =
  | "update_org"
  | "delete_org"
  | "invite_member"
  | "remove_member"
  | "change_role"
  | "change_status"
  | "transfer_ownership"
  | "manage_departments"
  | "view_billing"
  | "view_members"
  | "view_departments"
  | "revoke_invitation";

const PERMISSIONS: Record<OrgPermission, OrgRole[]> = {
  update_org:           ["OWNER", "ADMIN"],
  delete_org:           ["OWNER"],
  invite_member:        ["OWNER", "ADMIN", "MANAGER"],
  remove_member:        ["OWNER", "ADMIN"],
  change_role:          ["OWNER", "ADMIN"],
  change_status:        ["OWNER", "ADMIN", "MANAGER"],
  transfer_ownership:   ["OWNER"],
  manage_departments:   ["OWNER", "ADMIN", "MANAGER"],
  view_billing:         ["OWNER", "ADMIN", "BILLING_ADMIN"],
  view_members:         ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"],
  view_departments:     ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"],
  revoke_invitation:    ["OWNER", "ADMIN", "MANAGER"],
};

export function can(role: OrgRole, permission: OrgPermission): boolean {
  return (PERMISSIONS[permission] as OrgRole[]).includes(role);
}

export function requirePermission(
  role: OrgRole,
  permission: OrgPermission,
): { ok: true } | { ok: false; error: string; status: number } {
  if (!can(role, permission)) {
    return { ok: false, error: "Insufficient organization permissions", status: 403 };
  }
  return { ok: true };
}

/** Roles that can be assigned by the given actor role. OWNER can assign any; ADMIN cannot assign OWNER. */
export function assignableRoles(actorRole: OrgRole): OrgRole[] {
  if (actorRole === "OWNER") return ["ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"];
  if (actorRole === "ADMIN") return ["MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"];
  return [];
}
