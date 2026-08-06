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
  // PHASE 87L.6H.1 — the API platform is split into THREE permissions so an
  // engineer can monitor consumption without seeing the key inventory.
  // Previously one `view_api_keys` covered both, which forced a choice between
  // "no operational visibility" and "sees every key's name, prefix and scopes".
  | "manage_api_keys"    // create / rotate / revoke keys
  | "view_api_keys"      // key INVENTORY: names, prefixes, last4, scopes
  | "view_api_usage"     // AGGREGATE consumption only — never key identity
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
  | "view_multi_site"         // read cross-site benchmarks, risk rankings, KPI comparisons
  // PHASE 94 — OT Edge & automation engineering.
  //
  // Deliberately SEPARATE from `view_industrial` / `manage_industrial`, which
  // govern the existing site/gateway/asset registry. These cover the imported
  // ENGINEERING record — project metadata, tags, alarms, network nodes and the
  // deterministic findings derived from them — which is a different sensitivity
  // class: a tag/alarm export describes how a plant is controlled.
  //
  // Import and analysis are separated from read because both are expensive and
  // both create durable, audited records; finding review is separated again
  // because accepting a safety-related finding is an engineering judgement.
  | "view_ot_gateway"          // read edge-gateway profiles and their state
  | "manage_ot_gateway"        // register / update / change gateway lifecycle
  | "view_ot_device"           // read OT device profiles
  | "manage_ot_device"         // create / update OT device profiles
  | "view_engineering_project" // read projects, tags, alarms, network nodes, findings
  | "create_engineering_import"// submit a canonical engineering manifest
  | "run_engineering_analysis" // execute the deterministic rule engine
  | "review_engineering_finding" // transition a finding's workflow state
  // PHASE 97 — Compliance, Privacy & Legal readiness (org axis).
  //
  // `view_compliance` is the read gate for the tenant compliance operations
  // center (processing inventory, and — in later Phase 97 slices — privacy
  // requests, legal documents, retention, holds, incidents and evidence packs).
  // `manage_processing_activities` is the write gate for the Article 30 Record of
  // Processing Activities registry. Platform-global actions (e.g. assigning an
  // unassigned public request to a tenant) are NOT org permissions — they go
  // through `requirePlatformSuperadmin`, never a role in this map.
  | "view_compliance"              // read the compliance operations center
  | "manage_processing_activities" // create / update / approve RoPA entries
  | "manage_privacy_requests"      // triage/transition a data-subject request
  | "manage_retention"             // author/approve retention policies (dry-run)
  | "manage_legal_hold"            // create/activate/release legal holds
  // PHASE 97 Part D — legal-document lifecycle. Approval and publication are
  // DELIBERATELY separate permissions so the two accountable actions cannot be
  // performed by the same authority by default.
  | "view_legal_documents"         // read the tenant legal-document register
  | "manage_legal_documents"       // create/edit drafts, submit for review, schedule, withdraw, archive
  | "approve_legal_documents"      // transition IN_REVIEW → APPROVED
  | "publish_legal_documents"      // transition APPROVED/SCHEDULED → PUBLISHED (transactional supersession)
  // PHASE 97 Part G — governed subject data export. Approval is separate from
  // management so authorising a subject-data export is a distinct accountable act.
  | "view_exports"                 // read the tenant export-job register
  | "manage_exports"               // create/cancel/revoke export jobs, issue tokens
  | "approve_exports"              // authorise an export job (REQUESTED → AUTHORISED)
  // PHASE 97 Part H — governed subject data erasure. Approval is stricter than
  // management, and execution is additionally gated behind a default-false flag.
  | "view_erasures"                // read the tenant erasure-job register + plan
  | "manage_erasures"              // create/plan/cancel/send-back erasure jobs
  | "approve_erasures"             // approve/reject an erasure plan (binds to planHash)
  | "execute_erasures"             // arm/execute an approved plan (behind the disabled gate)
  // PHASE 97 Part I — subprocessor & data-transfer governance. Approval is a
  // distinct accountable act reserved for the highest organization authority.
  | "view_transfer_governance"     // read the subprocessor + transfer registers
  | "manage_transfer_governance"   // create/edit/review draft + under-review records
  | "approve_transfer_governance"  // approve/activate governed records (gated)
  // PHASE 97 — governed compliance-incident management. Recording a high-authority
  // legal / external-notification decision and closing/reopening an incident are
  // DELIBERATELY separate, OWNER-only accountable acts, distinct from day-to-day
  // triage/investigation (manage).
  | "view_compliance_incidents"    // read the incident register + append-only timeline
  | "manage_compliance_incidents"  // create/triage/investigate/resolve, adjust blockers, progress assessment
  | "decide_compliance_incidents"  // record a legal / external-notification decision (evidence only)
  | "close_compliance_incidents";  // close or reopen an incident

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
  // PHASE 87L.6H.1 (owner decision). ENGINEER was removed from view_api_keys:
  // an engineer must not be able to enumerate the organization's key inventory
  // (names, prefixes, last4, scopes). It gains view_api_usage instead, which
  // carries aggregate consumption only. MANAGER and BILLING_ADMIN keep exactly
  // the access they already had — no role gains anything here.
  manage_api_keys:      ["OWNER", "ADMIN", "MANAGER"],
  view_api_keys:        ["OWNER", "ADMIN", "MANAGER", "BILLING_ADMIN"],
  view_api_usage:       ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "BILLING_ADMIN"],
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
  // PHASE 94 — OT Edge & automation engineering.
  //
  // READ mirrors `view_industrial` so an existing viewer keeps parity with the
  // rest of the industrial surface. WRITE is narrower than the industrial
  // registry: an ENGINEER may import and analyse (their day job) but may NOT
  // administer gateway or device lifecycle, and BILLING_ADMIN — a finance role
  // — gets no engineering write capability at all.
  view_ot_gateway:            ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"],
  manage_ot_gateway:          ["OWNER", "ADMIN", "MANAGER"],
  view_ot_device:             ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"],
  manage_ot_device:           ["OWNER", "ADMIN", "MANAGER"],
  view_engineering_project:   ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"],
  create_engineering_import:  ["OWNER", "ADMIN", "MANAGER", "ENGINEER"],
  run_engineering_analysis:   ["OWNER", "ADMIN", "MANAGER", "ENGINEER"],
  // Reviewing a finding records an engineering judgement about a safety- or
  // production-relevant condition, so it stays with the accountable roles.
  review_engineering_finding: ["OWNER", "ADMIN", "MANAGER"],
  // PHASE 97 — Compliance. READ is limited to the accountable oversight roles
  // (compliance records describe how personal data is processed); ENGINEER /
  // VIEWER / BILLING_ADMIN are default-denied. WRITE to the RoPA registry is
  // narrower still — the org administrators who own the compliance record.
  view_compliance:                ["OWNER", "ADMIN", "MANAGER"],
  manage_processing_activities:   ["OWNER", "ADMIN"],
  manage_privacy_requests:        ["OWNER", "ADMIN"],
  manage_retention:               ["OWNER", "ADMIN"],
  manage_legal_hold:              ["OWNER", "ADMIN"],
  // Legal documents: read for the oversight roles; authoring for org admins.
  // Approval and publication are the OWNER's by default (separable, accountable
  // acts) — an ADMIN authors and submits but does not self-approve or publish.
  view_legal_documents:           ["OWNER", "ADMIN", "MANAGER"],
  manage_legal_documents:         ["OWNER", "ADMIN"],
  approve_legal_documents:        ["OWNER"],
  publish_legal_documents:        ["OWNER"],
  // Export: read for oversight roles; management for org admins; approval (which
  // releases a subject's personal data for packaging) reserved to the OWNER.
  view_exports:                   ["OWNER", "ADMIN", "MANAGER"],
  manage_exports:                 ["OWNER", "ADMIN"],
  approve_exports:                ["OWNER"],
  view_erasures:                  ["OWNER", "ADMIN", "MANAGER"],
  manage_erasures:                ["OWNER", "ADMIN"],
  approve_erasures:               ["OWNER"],
  execute_erasures:               ["OWNER"],
  view_transfer_governance:       ["OWNER", "ADMIN", "MANAGER"],
  manage_transfer_governance:     ["OWNER", "ADMIN"],
  approve_transfer_governance:    ["OWNER"],
  // Compliance incidents: read for the oversight roles; triage/investigation for org
  // admins; recording a legal/external-notification decision and closing/reopening
  // are reserved to the OWNER (the highest accountable authority).
  view_compliance_incidents:      ["OWNER", "ADMIN", "MANAGER"],
  manage_compliance_incidents:    ["OWNER", "ADMIN"],
  decide_compliance_incidents:    ["OWNER"],
  close_compliance_incidents:     ["OWNER"],
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
