// Phase 69 — EDMS permission engine

export type EdmsRole = "owner" | "editor" | "reviewer" | "reader" | "administrator";

export const ROLE_HIERARCHY: Record<EdmsRole, number> = {
  administrator: 5,
  owner:         4,
  editor:        3,
  reviewer:      2,
  reader:        1,
};

export const ROLE_CAPABILITIES: Record<EdmsRole, string[]> = {
  administrator: ["view","download","upload","edit","delete","approve","share","checkout","audit","manage"],
  owner:         ["view","download","upload","edit","delete","approve","share","checkout"],
  editor:        ["view","download","upload","edit","checkout"],
  reviewer:      ["view","download","comment","approve"],
  reader:        ["view","download"],
};

export function canPerform(role: EdmsRole, action: string): boolean {
  return ROLE_CAPABILITIES[role]?.includes(action) ?? false;
}

export function systemRoleToEdmsRole(systemRole: string): EdmsRole {
  switch (systemRole) {
    case "superadmin": return "administrator";
    case "admin":      return "administrator";
    case "engineer":   return "editor";
    case "vendor":     return "reader";
    case "customer":   return "reader";
    default:           return "reader";
  }
}

export function canApprove(systemRole: string): boolean {
  const edmsRole = systemRoleToEdmsRole(systemRole);
  return canPerform(edmsRole, "approve");
}

export function canEdit(systemRole: string): boolean {
  const edmsRole = systemRoleToEdmsRole(systemRole);
  return canPerform(edmsRole, "edit");
}

export function canDelete(systemRole: string): boolean {
  const edmsRole = systemRoleToEdmsRole(systemRole);
  return canPerform(edmsRole, "delete");
}

export function canManage(systemRole: string): boolean {
  const edmsRole = systemRoleToEdmsRole(systemRole);
  return canPerform(edmsRole, "manage");
}
