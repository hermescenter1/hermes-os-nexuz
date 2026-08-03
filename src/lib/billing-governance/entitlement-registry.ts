// PHASE 96 — canonical entitlement registry.
//
// Maps every commercially relevant entitlement to a per-plan grant. Pure data +
// lookups; no I/O.
//
// TWO kinds of value live here:
//   1. FEATURE AVAILABILITY per plan — a STRUCTURAL commercial decision (which
//      tier unlocks which capability). These are sensible owner-adjustable
//      defaults, documented in docs/billing/plan-and-entitlement-registry.md.
//   2. NUMERIC LIMITS (members, sites, gateways, assets, documents, storage,
//      AI/API usage) — DELIBERATELY unresolved (owner decision pending). They are
//      NEVER invented; every metered grant is CONFIGURATION_REQUIRED so the
//      resolver fails closed until the owner configures a real ceiling.
//
// Unknown entitlement keys and unknown plans resolve to null here → the resolver
// denies. Nothing in this file is authoritative on the client.

import {
  ENTITLEMENT_KEYS,
  type EntitlementDefinition,
  type EntitlementGrant,
  type EntitlementKey,
  type EntitlementKind,
  type LimitType,
  type PlanKey,
  isEntitlementKey,
  isPlanKey,
} from "./types";

/* ── Entitlement definitions (plan-independent) ──────────────────────────── */

type Def = Omit<EntitlementDefinition, "entitlementKey">;

const FEATURE = (displayName: string, paid: boolean): Def => ({ kind: "FEATURE", displayName, paid });
const METERED = (displayName: string, paid: boolean): Def => ({ kind: "METERED", displayName, paid });

/** `paid: true` means "must fail closed without an explicit grant" — i.e. a
 *  paid-tier capability, not a free baseline that Community includes. */
const ENTITLEMENT_DEFS: Readonly<Record<EntitlementKey, Def>> = Object.freeze({
  // Community baseline features (paid: false).
  library: FEATURE("Knowledge Library", false),
  journal: FEATURE("Engineering Journal", false),
  engineering_cases: FEATURE("Engineering Cases", false),
  analytics: FEATURE("Analytics", false),
  public_profiles: FEATURE("Public Profiles", false),
  // Paid-tier features (paid: true).
  industrial_brain: FEATURE("Industrial Brain", true),
  external_ai: FEATURE("External AI Providers", true),
  copilot: FEATURE("Copilot", true),
  knowledge_graph: FEATURE("Knowledge Graph", true),
  video_hub: FEATURE("Video Hub", true),
  automation_studio: FEATURE("Automation Studio", true),
  ot_gateway: FEATURE("OT Gateway", true),
  gateway_enrollment: FEATURE("Gateway Enrollment", true),
  scada_plc_connectivity: FEATURE("SCADA / PLC Connectivity", true),
  evidence_pack: FEATURE("Evidence Pack", true),
  editorial_workflow: FEATURE("Editorial Workflow", true),
  api_access: FEATURE("API Access", true),
  data_export: FEATURE("Data Export", true),
  audit_retention: FEATURE("Extended Audit Retention", true),
  // Metered resources / usage. Baseline resources (members/sites/assets/
  // documents/storage) are paid: false; usage that depends on a paid feature is
  // paid: true.
  members: METERED("Members", false),
  sites: METERED("Sites", false),
  assets: METERED("Assets", false),
  documents: METERED("Documents", false),
  storage_bytes: METERED("Storage", false),
  gateways: METERED("Gateways", true),
  ai_executions: METERED("AI Executions", true),
  api_requests: METERED("API Requests", true),
});

export function getEntitlementDefinition(entitlementKey: unknown): EntitlementDefinition | null {
  if (!isEntitlementKey(entitlementKey)) return null;
  return { entitlementKey, ...ENTITLEMENT_DEFS[entitlementKey] };
}

export function allEntitlementDefinitions(): EntitlementDefinition[] {
  return ENTITLEMENT_KEYS.map((k) => ({ entitlementKey: k, ...ENTITLEMENT_DEFS[k] }));
}

/* ── Per-plan feature availability (structural, owner-adjustable default) ──── */

/** Which FEATURE entitlements each plan unlocks. Tiers are additive: higher
 *  tiers include everything below. Owner-adjustable — see docs. */
const FEATURE_AVAILABILITY: Readonly<Record<PlanKey, ReadonlySet<EntitlementKey>>> = Object.freeze({
  COMMUNITY: new Set<EntitlementKey>(["library", "journal", "engineering_cases", "analytics", "public_profiles"]),
  PROFESSIONAL: new Set<EntitlementKey>([
    "library",
    "journal",
    "engineering_cases",
    "analytics",
    "public_profiles",
    "industrial_brain",
    "copilot",
    "knowledge_graph",
    "video_hub",
    "data_export",
    "api_access",
  ]),
  TEAM: new Set<EntitlementKey>([
    "library",
    "journal",
    "engineering_cases",
    "analytics",
    "public_profiles",
    "industrial_brain",
    "copilot",
    "knowledge_graph",
    "video_hub",
    "data_export",
    "api_access",
    "external_ai",
    "automation_studio",
    "ot_gateway",
    "gateway_enrollment",
    "scada_plc_connectivity",
    "evidence_pack",
    "editorial_workflow",
    "audit_retention",
  ]),
  // Enterprise: every feature available (limits still owner/override-driven).
  ENTERPRISE: new Set<EntitlementKey>(ENTITLEMENT_KEYS.filter((k) => ENTITLEMENT_DEFS[k].kind === "FEATURE")),
});

/** Metered resources that depend on a gating FEATURE. If the plan lacks the
 *  gating feature, the metered resource is FEATURE_DISABLED for that plan. */
const METERED_GATING_FEATURE: Readonly<Partial<Record<EntitlementKey, EntitlementKey>>> = Object.freeze({
  gateways: "ot_gateway",
  ai_executions: "industrial_brain",
  api_requests: "api_access",
});

/* ── Grant resolution ────────────────────────────────────────────────────── */

function featureGrant(planKey: PlanKey, key: EntitlementKey): EntitlementGrant {
  const enabled = FEATURE_AVAILABILITY[planKey].has(key);
  const limitType: LimitType = enabled ? "UNLIMITED" : "FEATURE_DISABLED";
  return { entitlementKey: key, kind: "FEATURE", limitType, limit: null };
}

function meteredGrant(planKey: PlanKey, key: EntitlementKey): EntitlementGrant {
  const gating = METERED_GATING_FEATURE[key];
  if (gating && !FEATURE_AVAILABILITY[planKey].has(gating)) {
    // The resource depends on a feature this plan does not include.
    return { entitlementKey: key, kind: "METERED", limitType: "FEATURE_DISABLED", limit: null };
  }
  // Ceiling is owner-decision-pending for EVERY plan (no invented numbers).
  // The resolver treats CONFIGURATION_REQUIRED as fail-closed for creation.
  return { entitlementKey: key, kind: "METERED", limitType: "CONFIGURATION_REQUIRED", limit: null };
}

/**
 * The authoritative per-plan grant for one entitlement. Returns null when the
 * plan or entitlement key is unknown (caller fails closed). Never throws.
 */
export function getPlanEntitlementGrant(planKey: unknown, entitlementKey: unknown): EntitlementGrant | null {
  if (!isPlanKey(planKey) || !isEntitlementKey(entitlementKey)) return null;
  const kind: EntitlementKind = ENTITLEMENT_DEFS[entitlementKey].kind;
  return kind === "FEATURE" ? featureGrant(planKey, entitlementKey) : meteredGrant(planKey, entitlementKey);
}

/** Full grant table for a plan (all entitlements). Used by the UI (server-side)
 *  and documentation generation. Null for unknown plan. */
export function getPlanEntitlements(planKey: unknown): EntitlementGrant[] | null {
  if (!isPlanKey(planKey)) return null;
  return ENTITLEMENT_KEYS.map((k) => getPlanEntitlementGrant(planKey, k)!);
}

/** Whether a plan structurally includes a FEATURE entitlement (ignores limits).
 *  For metered keys, reflects the gating feature (or true when ungated). */
export function planIncludesEntitlement(planKey: PlanKey, entitlementKey: EntitlementKey): boolean {
  const grant = getPlanEntitlementGrant(planKey, entitlementKey);
  return grant !== null && grant.limitType !== "FEATURE_DISABLED";
}
