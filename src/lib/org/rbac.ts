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
  // Phase 86C4B2B1D-SECURITY-8 AMENDMENT: financial-mutation privilege,
  // separated from read-only "view_billing" (record payments, checkout,
  // portal, subscription create/change/cancel, usage writes).
  | "manage_billing"
  | "view_members"
  | "view_departments"
  | "revoke_invitation"
  // Phase 33: API Platform
  | "manage_api_keys"    // create / revoke / rotate keys
  | "view_api_keys"      // list keys and usage stats
  // Phase 35: Industrial
  | "manage_industrial"   // create/update sites, gateways, assets, connectors
  | "view_industrial"     // read industrial resources and telemetry
  // Phase 36: Digital Twin
  | "manage_digital_twin" // create/update twin nodes, relations, layouts, asset tags
  | "view_digital_twin"   // read twin graph, health scores, topology
  // Phase 37/38: Analytics + Copilot
  | "view_analytics"      // read time-series analytics, KPIs, trends, alarms
  | "view_copilot"        // use Industrial Copilot (query, conversations, insights)
  // Phase 39: Predictive Maintenance
  | "view_predictive"    // read risk scores, RUL, recommendations, degradation analysis
  // Phase 40: Industrial Knowledge Engine
  | "view_knowledge"        // read articles, failure modes, procedures, cases, search
  | "manage_knowledge"      // create/update articles, failure modes, procedures, cases
  // Phase 41: Industrial Knowledge Graph
  | "view_knowledge_graph"    // read graph queries, paths, reasoning
  | "manage_knowledge_graph"  // rebuild graph (expensive, org-wide)
  // Phase 42: Multi-Site Industrial Intelligence
  | "view_multi_site";        // read cross-site benchmarks, risk rankings, KPI comparisons

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
  // Financial mutations: the dedicated billing-admin role plus org admins.
  // Default-deny for MANAGER / ENGINEER / VIEWER / MEMBER.
  manage_billing:       ["OWNER", "ADMIN", "BILLING_ADMIN"],
  view_members:         ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"],
  view_departments:     ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"],
  revoke_invitation:    ["OWNER", "ADMIN", "MANAGER"],
  // Phase 33 — VIEWER and ENGINEER cannot touch API keys
  manage_api_keys:      ["OWNER", "ADMIN", "MANAGER"],
  view_api_keys:        ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "BILLING_ADMIN"],
  // Phase 35 — Industrial Edge Gateway
  manage_industrial:    ["OWNER", "ADMIN", "MANAGER"],
  view_industrial:      ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"],
  // Phase 36 — Digital Twin
  manage_digital_twin:  ["OWNER", "ADMIN", "MANAGER"],
  view_digital_twin:    ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"],
  // Phase 37/38 — Analytics + Copilot (same role matrix as view_industrial)
  view_analytics:       ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"],
  view_copilot:         ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"],
  // Phase 39 — Predictive Maintenance (read-only; same role matrix as analytics)
  view_predictive:      ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"],
  // Phase 40 — Industrial Knowledge Engine
  view_knowledge:       ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"],
  manage_knowledge:     ["OWNER", "ADMIN", "MANAGER", "ENGINEER"],
  // Phase 41 — Industrial Knowledge Graph
  view_knowledge_graph:   ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"],
  manage_knowledge_graph: ["OWNER", "ADMIN", "MANAGER"],  // rebuild is expensive + org-wide
  // Phase 42 — Multi-Site Industrial Intelligence (same role matrix as view_industrial)
  view_multi_site:        ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"],
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
