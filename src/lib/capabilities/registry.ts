/**
 * Public capability registry — R2 (gap-closure roadmap, not a new feature).
 *
 * Pure data/logic, no i18n and no JSX, so it is trivially unit-testable and
 * reusable from both the new /services/<slug> pages and /architecture's
 * "delivered" section.
 *
 * Every entry here corresponds to a capability that is ALREADY implemented in
 * this repository (real routes, real API, real Prisma models). This registry
 * does not create new backend surface — it only gives the existing backend
 * surface a stable public URL and a place in the capability graph. The
 * `evidence` field exists so any future audit can re-verify the claim without
 * re-deriving it from scratch.
 */

export type CapabilityKey =
  | "digitalTwin"
  | "predictiveMaintenance"
  | "cmms"
  | "multiSite"
  | "edms"
  | "erp"
  | "otEdge"
  | "crm";

export const CAPABILITY_KEYS: readonly CapabilityKey[] = [
  "digitalTwin",
  "predictiveMaintenance",
  "cmms",
  "multiSite",
  "edms",
  "erp",
  "otEdge",
  "crm",
] as const;

/** Locale-agnostic URL slug under /services/<slug>. */
export const CAPABILITY_SLUG: Record<CapabilityKey, string> = {
  digitalTwin: "digital-twin",
  predictiveMaintenance: "predictive-maintenance",
  cmms: "cmms",
  multiSite: "multi-site",
  edms: "edms",
  erp: "erp",
  otEdge: "ot-edge",
  crm: "crm",
};

/** Locale-agnostic public route for a capability (Link/href adds the locale prefix). */
export const CAPABILITY_HREF: Record<CapabilityKey, string> = Object.fromEntries(
  CAPABILITY_KEYS.map((key) => [key, `/services/${CAPABILITY_SLUG[key]}`]),
) as Record<CapabilityKey, string>;

/**
 * Repository evidence backing each capability — the authenticated workspace
 * routes, API routes and Prisma models the public page describes. Kept here
 * (not in the page) so it is checked once, in one place, against the real
 * repository rather than re-typed per page.
 */
export const CAPABILITY_EVIDENCE: Record<CapabilityKey, {
  workspaceRoute: string;
  apiPrefix: string;
  models: readonly string[];
}> = {
  digitalTwin: {
    workspaceRoute: "/dashboard/digital-twin",
    apiPrefix: "/api/digital-twin",
    models: ["DigitalTwinNode", "DigitalTwinLayout", "DigitalTwinRelation"],
  },
  predictiveMaintenance: {
    workspaceRoute: "/dashboard/predictive",
    apiPrefix: "/api/predictive",
    models: ["RULSnapshot", "AssetRiskScore", "AssetBaseline"],
  },
  cmms: {
    workspaceRoute: "/cmms",
    apiPrefix: "/api/cmms",
    models: ["MaintenanceWorkCenter", "MaintenanceSchedule", "MaintenancePlan", "MaintenanceSparePart", "MaintenanceCost"],
  },
  multiSite: {
    workspaceRoute: "/dashboard/multi-site",
    apiPrefix: "/api/multi-site",
    models: ["MultiSiteBenchmark", "SiteKPIComparison", "SiteRiskSnapshot", "CrossSiteFailurePattern"],
  },
  edms: {
    workspaceRoute: "/documents",
    apiPrefix: "/api/edms",
    models: ["EdmsDocument", "EdmsApproval", "EdmsRevision", "EdmsRetentionPolicy", "EdmsAudit"],
  },
  erp: {
    workspaceRoute: "/erp",
    apiPrefix: "/api/erp",
    models: ["ErpProject", "ErpTask", "ErpInventoryItem", "ErpApprovalRequest", "ErpOperationalKpi"],
  },
  otEdge: {
    workspaceRoute: "/dashboard/ot",
    apiPrefix: "/api/ot",
    models: ["IndustrialGateway", "OtDeviceProfile", "GatewayEnvelopeNonce"],
  },
  crm: {
    workspaceRoute: "/crm",
    apiPrefix: "/api/crm",
    models: ["CrmLead", "CrmDeal", "CrmOpportunity", "CrmAccount"],
  },
};

/** A related node in the human-facing capability graph: another capability, or
 *  an existing public Hermes OS page that is not one of the eight new pages. */
export type RelatedTarget = CapabilityKey | "industrialBrain" | "platform" | "library" | "architecture";

const EXTERNAL_HREF: Record<Exclude<RelatedTarget, CapabilityKey>, string> = {
  industrialBrain: "/industrial-brain",
  platform: "/platform",
  library: "/library",
  architecture: "/architecture",
};

/** Resolve any related-graph target (capability or external page) to its href. */
export function relatedHref(target: RelatedTarget): string {
  return (CAPABILITY_KEYS as readonly string[]).includes(target)
    ? CAPABILITY_HREF[target as CapabilityKey]
    : EXTERNAL_HREF[target as Exclude<RelatedTarget, CapabilityKey>];
}

/**
 * The human capability graph — three real edges per capability so the site
 * never presents a capability page as an isolated landing page. Every edge is
 * grounded in an actual data or reasoning relationship documented in the
 * corresponding i18n `connects.items[].desc` copy (asset↔document/maintenance
 * links, telemetry↔risk scoring, cross-site aggregation, evidence pipelines).
 */
export const CAPABILITY_CONNECTIONS: Record<CapabilityKey, readonly RelatedTarget[]> = {
  digitalTwin: ["predictiveMaintenance", "cmms", "industrialBrain"],
  predictiveMaintenance: ["digitalTwin", "cmms", "multiSite"],
  cmms: ["predictiveMaintenance", "edms", "multiSite"],
  multiSite: ["cmms", "predictiveMaintenance", "industrialBrain"],
  edms: ["cmms", "erp", "industrialBrain"],
  erp: ["crm", "edms", "multiSite"],
  otEdge: ["digitalTwin", "predictiveMaintenance", "industrialBrain"],
  crm: ["erp", "edms", "platform"],
};
