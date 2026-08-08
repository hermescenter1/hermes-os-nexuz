/**
 * Hermes OS — Phase 98 RPO / RTO contract.
 *
 * RPO is derived from the ACTUAL backup schedule + authoritative source of each
 * durable component; the system RPO is the worst durable component. RTO separates
 * MECHANISM_RTO (proven by the disposable rehearsal) from the PRODUCTION_RTO_TARGET
 * (an owner policy) and PRODUCTION_RTO_VERIFICATION_STATUS. CI-measured timings are
 * rehearsal evidence, NEVER a claim of Production timing.
 *
 * These values encode the existing Phase 93 accepted objectives plus the Phase 98
 * additions (uploads, configuration). Schedules marked owner-activated are NOT
 * asserted as running in Production by CI — CI can only prove the mechanism and the
 * schedule↔RPO relationship, not wall-clock cron execution.
 */

export const RPO_COMPONENTS = [
  {
    component: "PostgreSQL",
    authoritativeSource: "postgres_data volume",
    method: "Encrypted pg_dump (.hbk) via scripts/backup-postgres.sh",
    scheduleHours: 24, // owner-activated host cron; default daily per Phase 93
    worstCaseDataLossWindowHours: 24,
    owner: "Database recovery owner",
    scheduleActivation: "OWNER_ACTIVATED",
  },
  {
    component: "Uploads",
    authoritativeSource: "uploads_data + documents_data volumes",
    method: "Encrypted uploads archive (.hbk) via scripts/dr/backup-uploads.mjs",
    scheduleHours: 24,
    worstCaseDataLossWindowHours: 24,
    owner: "Upload recovery owner",
    scheduleActivation: "OWNER_ACTIVATED",
  },
  {
    component: "Configuration",
    authoritativeSource: "Git + external secret store",
    method: "Repository-managed + secret store (no data-loss window for repo config)",
    scheduleHours: 0,
    worstCaseDataLossWindowHours: 0,
    owner: "Configuration recovery owner",
    scheduleActivation: "CONTINUOUS",
  },
  {
    component: "Application source/image",
    authoritativeSource: "Git origin/main (pinned SHA) + rebuilt image",
    method: "Rebuild from pinned SHA",
    scheduleHours: 0,
    worstCaseDataLossWindowHours: 0,
    owner: "Application/release owner",
    scheduleActivation: "CONTINUOUS",
  },
  {
    component: "Redis",
    authoritativeSource: "N/A — REBUILD_FROM_AUTHORITATIVE_STATE",
    method: "Fresh instance; not part of RPO",
    scheduleHours: 0,
    worstCaseDataLossWindowHours: 0,
    owner: "Platform/SRE",
    scheduleActivation: "NOT_IN_RPO",
  },
  {
    component: "OpenBao",
    authoritativeSource: "OpenBao DR contract (Phase 94/95)",
    method: "Raft snapshot per ops/openbao runbooks (owner-operated)",
    scheduleHours: 24,
    worstCaseDataLossWindowHours: 24,
    owner: "OpenBao recovery owner",
    scheduleActivation: "OWNER_ACTIVATED",
  },
];

/** System RPO = worst durable component's data-loss window. */
export function deriveSystemRpoHours(components = RPO_COMPONENTS) {
  return components.reduce((max, c) => Math.max(max, c.worstCaseDataLossWindowHours || 0), 0);
}

/** The ordered recovery steps whose durations the rehearsal measures. */
export const RTO_STEPS = [
  "encrypted backup decryption",
  "PostgreSQL restore",
  "uploads restore",
  "configuration reconstruction",
  "application start/readiness",
];

export const RTO_CONTRACT = {
  // Owner policy target for full-system recovery. Sourced from the Phase 93 RTO
  // contract as historical input; an explicit owner policy decision is recorded
  // here rather than silently inventing a business SLA.
  productionRtoTargetHours: 4,
  productionRtoVerificationStatus: "MECHANISM_VERIFIED_IN_REHEARSAL",
  note: "CI rehearsal timings are mechanism evidence on a small disposable dataset, NOT Production timing.",
};

/**
 * @param {ReturnType<typeof deriveSystemRpoHours>} systemRpoHours
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateRpoRto(systemRpoHours = deriveSystemRpoHours()) {
  const errors = [];
  if (!Number.isFinite(systemRpoHours) || systemRpoHours <= 0) errors.push("RPO_UNMEASURED: system RPO not derived");
  for (const c of RPO_COMPONENTS) {
    if (!c.method) errors.push(`RPO component ${c.component} has no method`);
    if (!c.owner || c.owner === "UNKNOWN") errors.push(`RPO component ${c.component} has no owner`);
  }
  if (!RTO_CONTRACT.productionRtoTargetHours) errors.push("RTO_UNMEASURED: no target");
  if (RTO_STEPS.length < 3) errors.push("RTO steps incomplete");
  return { ok: errors.length === 0, errors };
}
