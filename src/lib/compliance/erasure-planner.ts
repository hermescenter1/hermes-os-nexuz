/**
 * Phase 97 Part H — deterministic subject-erasure plan builder (pure, I/O-free).
 *
 * Given already-collected target records (ids + classification inputs only — never
 * raw content), active legal holds and approved retention policies, this produces a
 * DETERMINISTIC plan snapshot and a SHA-256 planHash over its canonical content. The
 * classification precedence is fixed and fail-closed:
 *   ownership → legal hold → retention → dependency → anonymise → delete → manual.
 * An active legal hold ALWAYS wins over DELETE/ANONYMISE. Missing/unapproved
 * retention configuration is CONFIGURATION_REQUIRED and is NEVER read as permission
 * to delete. The plan stores identifiers, closed classifications and reason codes
 * only — no email, free text, IP, UA, token, credential or record body.
 */
import { createHash } from "node:crypto";
import { stableStringify } from "./export-package";
import { classifyRetentionPolicy, holdCovers, type HoldLike, type RetentionPolicyLike } from "./retention-engine";
import type { ErasureClassification, ErasureTargetDefinition, ErasureTargetRecord, ExecutionStrategy } from "./erasure-targets";
import { ERASURE_CLASSIFICATIONS, ERASURE_REGISTRY_VERSION } from "./erasure-targets";

export const ERASURE_PLAN_SCHEMA_VERSION = "1.0";

export interface ErasureRetentionPolicyLike extends RetentionPolicyLike {
  id:             string;
  organizationId: string;
  dataClass:      string;
  targetResource: string;
}

export interface ErasurePlanItem {
  target:                    string;
  recordId:                  string;
  classification:            ErasureClassification;
  plannedAction:             ExecutionStrategy;      // DELETE | ANONYMISE | NONE
  reasonCodes:               string[];
  dependencyClassifications: string[];
  retentionPolicyId:         string | null;
  legalHoldId:               string | null;
}

// ── Governed manual-review resolution (closed, conservative) ──────────────────
//
// A MANUAL_REVIEW_REQUIRED item may be resolved ONLY through an explicit,
// server-authoritative review decision drawn from this closed set. DELETE_ALLOWED
// is deliberately ABSENT: an ordinary tenant review can never grant deletion of
// the global User identity row (GLOBAL_USER_DELETION_BY_SINGLE_TENANT=0).
export type ManualResolutionCode =
  | "NO_ACTION_REQUIRED"
  | "RETENTION_REQUIRED"
  | "ANONYMISE_REQUIRED"
  | "GLOBAL_PLATFORM_REVIEW_REQUIRED";
export const MANUAL_RESOLUTION_CODES: ManualResolutionCode[] = [
  "NO_ACTION_REQUIRED", "RETENTION_REQUIRED", "ANONYMISE_REQUIRED", "GLOBAL_PLATFORM_REVIEW_REQUIRED",
];
export function isManualResolutionCode(v: unknown): v is ManualResolutionCode {
  return typeof v === "string" && (MANUAL_RESOLUTION_CODES as string[]).includes(v);
}

/** A versioned, server-attributed review decision bound to the exact reviewed plan. */
export interface ManualReviewResolution {
  jobId:             string;
  sourcePlanHash:    string;
  sourcePlanVersion: number;
  target:            string;
  recordId:          string;
  resolution:        ManualResolutionCode;
  resolvedBy:        string;
  resolvedAt:        string;   // ISO timestamp
  authority:         string;   // authority boundary, e.g. TENANT_OWNER
}

export interface ErasurePlan {
  schemaVersion:    string;
  registryVersion:  string;
  planVersion:      number;
  jobId:            string;
  privacyRequestId: string | null;
  organizationId:   string | null;
  subjectClass:     string;
  subjectId:        string | null;
  generatedAt:      string;                          // time-bound — excluded from planHash
  items:            ErasurePlanItem[];
  counts:           Record<ErasureClassification, number>;
}

export interface BuildErasurePlanInput {
  jobId:            string;
  privacyRequestId: string | null;
  organizationId:   string | null;
  subjectClass:     string;
  subjectId:        string | null;
  planVersion:      number;
  now:              Date;
  collected:        Array<{ target: ErasureTargetDefinition; records: ErasureTargetRecord[] }>;
  holds:            HoldLike[];
  policies:         ErasureRetentionPolicyLike[];
  /** Governed manual-review decisions (server-recorded; never client-injected). */
  resolutions?:     ManualReviewResolution[];
}

const PRESERVE_ACTIONS = new Set(["ARCHIVE", "NO_AUTOMATED_ACTION", "REVIEW_REQUIRED"]);

/** ALL matching policies for a target — never a silent first-by-id pick. Zero or
 *  more than one match is a fail-closed condition decided by the caller. */
function findMatchingPolicies(target: ErasureTargetDefinition, policies: ErasureRetentionPolicyLike[], org: string | null): ErasureRetentionPolicyLike[] {
  if (!target.retentionLookup || !org) return [];
  return policies.filter((p) => p.organizationId === org && p.dataClass === target.retentionLookup!.dataClass && p.targetResource === target.retentionLookup!.targetResource);
}

function findMatchingHold(record: ErasureTargetRecord, org: string | null, holds: HoldLike[]): HoldLike & { id?: string } | null {
  if (!org) return null;
  const target = {
    organizationId: org,
    subjectId: record.holdInputs.subjectId ?? null,
    resourceType: record.holdInputs.resourceType ?? null,
    resourceId: record.holdInputs.resourceId ?? null,
    timestamp: record.holdInputs.timestamp ?? null,
  };
  return (holds.find((h) => holdCovers(h, target)) as (HoldLike & { id?: string })) ?? null;
}

function addDays(base: Date, days: number): Date { const d = new Date(base.getTime()); d.setUTCDate(d.getUTCDate() + days); return d; }

/** Clamp a would-be destructive action to the target's allowed strategy; a mismatch
 *  is unsafe and downgrades to MANUAL_REVIEW_REQUIRED. */
function actionFor(classification: ErasureClassification, strategy: ExecutionStrategy): ExecutionStrategy {
  if (classification === "DELETE_ALLOWED") return strategy === "DELETE" ? "DELETE" : "NONE";
  if (classification === "ANONYMISE_REQUIRED") return strategy === "ANONYMISE" ? "ANONYMISE" : "NONE";
  return "NONE";
}

function classifyRecord(
  target: ErasureTargetDefinition,
  record: ErasureTargetRecord,
  subjectId: string | null,
  org: string | null,
  holds: HoldLike[],
  policies: ErasureRetentionPolicyLike[],
  resolutions: ManualReviewResolution[],
  now: Date,
): ErasurePlanItem {
  const dependencyClassifications = [...record.dependency.codes].sort();
  let legalHoldId: string | null = null;
  let retentionPolicyId: string | null = null;
  const item = (classification: ErasureClassification, plannedAction: ExecutionStrategy, reasonCodes: string[]): ErasurePlanItem =>
    ({ target: target.name, recordId: record.recordId, classification, plannedAction, reasonCodes, dependencyClassifications, retentionPolicyId, legalHoldId });

  // 1. Authoritative ownership — a record not attributable to the subject under the
  //    registry's explicit rules is NOT_SUBJECT_DATA (examined but not the subject's).
  const ownedBySubject = !!subjectId && record.ownedByUserId === subjectId;
  const ownedInScope = record.ownedByOrganizationId === null || (org !== null && record.ownedByOrganizationId === org);
  if (!ownedBySubject || !ownedInScope) {
    return item("NOT_SUBJECT_DATA", "NONE", ["OWNERSHIP_NOT_SUBJECT"]);
  }

  // 2. Active LegalHold ALWAYS wins over deletion/anonymisation.
  const hold = findMatchingHold(record, org, holds);
  if (hold) {
    legalHoldId = hold.id ?? null;
    return item("LEGAL_HOLD", "NONE", ["ACTIVE_LEGAL_HOLD"]);
  }

  // 3. Retention — FAIL-CLOSED. Preservation-sensitive targets are always
  //    RETENTION_REQUIRED. For every other target that declares a retentionLookup:
  //      - ZERO matching policies      → RETENTION_REQUIRED / CONFIGURATION_REQUIRED
  //        (a missing policy is NEVER permission to delete);
  //      - MULTIPLE matching policies  → RETENTION_REQUIRED / AMBIGUOUS_RETENTION_POLICY
  //        (never silently pick one — the live-selection unique index and governance
  //        must reduce it to exactly one);
  //      - EXACTLY ONE                 → it must be enabled=true, APPROVED and fully
  //        configured before due-ness is even evaluated.
  if (target.defaultClassification === "RETENTION_REQUIRED") {
    return item("RETENTION_REQUIRED", "NONE", ["PRESERVATION_SENSITIVE"]);
  }
  if (target.retentionLookup) {
    const matches = findMatchingPolicies(target, policies, org);
    if (matches.length === 0) {
      return item("RETENTION_REQUIRED", "NONE", ["CONFIGURATION_REQUIRED", "NO_RETENTION_POLICY"]);
    }
    if (matches.length > 1) {
      return item("RETENTION_REQUIRED", "NONE", ["AMBIGUOUS_RETENTION_POLICY"]);
    }
    const policy = matches[0];
    retentionPolicyId = policy.id;
    const cfg = classifyRetentionPolicy(policy);
    if (cfg.status === "CONFIGURATION_REQUIRED" || policy.enabled !== true) {
      // Disabled, rejected, pending or incomplete configuration never grants deletion.
      return item("RETENTION_REQUIRED", "NONE", ["CONFIGURATION_REQUIRED"]);
    }
    const preserves = PRESERVE_ACTIONS.has(policy.action);
    const triggerAt = record.holdInputs.timestamp ?? null;
    const notYetDue = policy.retentionDays != null && triggerAt != null && now.getTime() < addDays(triggerAt, policy.retentionDays).getTime();
    if (preserves || notYetDue) {
      return item("RETENTION_REQUIRED", "NONE", [preserves ? "POLICY_PRESERVES" : "RETENTION_NOT_DUE"]);
    }
  }

  // 4. Required relational/operational dependency.
  if (record.dependency.blocked) {
    return item("DEPENDENCY_BLOCKED", "NONE", dependencyClassifications.length ? dependencyClassifications : ["DEPENDENCY"]);
  }

  // 5/6. Anonymisation, then deletion — clamped to the target's allowed strategy.
  if (target.defaultClassification === "ANONYMISE_REQUIRED") {
    const action = actionFor("ANONYMISE_REQUIRED", target.allowedExecutionStrategy);
    if (action === "ANONYMISE") return item("ANONYMISE_REQUIRED", "ANONYMISE", ["ANONYMISE_STRATEGY"]);
  }
  if (target.defaultClassification === "DELETE_ALLOWED") {
    const action = actionFor("DELETE_ALLOWED", target.allowedExecutionStrategy);
    if (action === "DELETE") return item("DELETE_ALLOWED", "DELETE", ["NO_KNOWN_BLOCKER"]);
  }

  // 7. Manual review — the system cannot safely determine an action. A GOVERNED,
  //    server-recorded resolution (closed codes only; DELETE never obtainable) may
  //    conservatively re-classify the item; GLOBAL_PLATFORM_REVIEW_REQUIRED keeps
  //    it blocking. A client can never inject a classification directly.
  const resolution = resolutions.find((r) => r.target === target.name && r.recordId === record.recordId && isManualResolutionCode(r.resolution));
  if (resolution) {
    switch (resolution.resolution) {
      case "NO_ACTION_REQUIRED":
        return item("RETENTION_REQUIRED", "NONE", ["MANUAL_RESOLUTION", "RESOLVED_NO_ACTION_REQUIRED"]);
      case "RETENTION_REQUIRED":
        return item("RETENTION_REQUIRED", "NONE", ["MANUAL_RESOLUTION", "RESOLVED_RETENTION_REQUIRED"]);
      case "ANONYMISE_REQUIRED":
        if (target.allowedExecutionStrategy === "ANONYMISE") {
          return item("ANONYMISE_REQUIRED", "ANONYMISE", ["MANUAL_RESOLUTION", "RESOLVED_ANONYMISE_REQUIRED"]);
        }
        return item("MANUAL_REVIEW_REQUIRED", "NONE", ["RESOLUTION_STRATEGY_UNSUPPORTED"]);
      case "GLOBAL_PLATFORM_REVIEW_REQUIRED":
        return item("MANUAL_REVIEW_REQUIRED", "NONE", ["GLOBAL_PLATFORM_REVIEW_REQUIRED"]);
    }
  }
  return item("MANUAL_REVIEW_REQUIRED", "NONE", ["INDETERMINATE"]);
}

function emptyCounts(): Record<ErasureClassification, number> {
  return Object.fromEntries(ERASURE_CLASSIFICATIONS.map((c) => [c, 0])) as Record<ErasureClassification, number>;
}

/** Build the deterministic plan + planHash. Items are sorted by (target, recordId)
 *  so database return order can never change the hash; generatedAt and planVersion
 *  are excluded from the hash so identical authoritative input yields an identical
 *  planHash. */
export function buildErasurePlan(input: BuildErasurePlanInput): { plan: ErasurePlan; planHash: string } {
  const items: ErasurePlanItem[] = [];
  const resolutions = input.resolutions ?? [];
  for (const { target, records } of input.collected) {
    for (const record of records) {
      items.push(classifyRecord(target, record, input.subjectId, input.organizationId, input.holds, input.policies, resolutions, input.now));
    }
  }
  items.sort((a, b) => (a.target === b.target ? a.recordId.localeCompare(b.recordId) : a.target.localeCompare(b.target)));

  const counts = emptyCounts();
  for (const it of items) counts[it.classification] += 1;

  const plan: ErasurePlan = {
    schemaVersion:    ERASURE_PLAN_SCHEMA_VERSION,
    registryVersion:  ERASURE_REGISTRY_VERSION,
    planVersion:      input.planVersion,
    jobId:            input.jobId,
    privacyRequestId: input.privacyRequestId,
    organizationId:   input.organizationId,
    subjectClass:     input.subjectClass,
    subjectId:        input.subjectId,
    generatedAt:      input.now.toISOString(),
    items,
    counts,
  };
  return { plan, planHash: computeErasurePlanHash(plan) };
}

/** SHA-256 over the canonical plan CONTENT — excludes generatedAt and planVersion so
 *  the hash is stable for identical authoritative input and changes iff a material
 *  field (binding, item, classification, action, reason) changes. */
export function computeErasurePlanHash(plan: ErasurePlan): string {
  const content = {
    schemaVersion:    plan.schemaVersion,
    registryVersion:  plan.registryVersion,
    jobId:            plan.jobId,
    privacyRequestId: plan.privacyRequestId,
    organizationId:   plan.organizationId,
    subjectClass:     plan.subjectClass,
    subjectId:        plan.subjectId,
    items: [...plan.items]
      .sort((a, b) => (a.target === b.target ? a.recordId.localeCompare(b.recordId) : a.target.localeCompare(b.target)))
      .map((it) => ({
        target: it.target,
        recordId: it.recordId,
        classification: it.classification,
        plannedAction: it.plannedAction,
        reasonCodes: [...it.reasonCodes].sort(),
        dependencyClassifications: [...it.dependencyClassifications].sort(),
        retentionPolicyId: it.retentionPolicyId,
        legalHoldId: it.legalHoldId,
      })),
  };
  return createHash("sha256").update(stableStringify(content)).digest("hex");
}

export interface ApprovalBlocker { target: string; recordId: string; reason: string }

/** Whether a plan may be APPROVED. A plan with MANUAL_REVIEW_REQUIRED, a
 *  CONFIGURATION_REQUIRED reason, an unknown classification, or a destructive action
 *  on a non-destructive classification cannot be approved. LEGAL_HOLD /
 *  RETENTION_REQUIRED / DEPENDENCY_BLOCKED / NOT_SUBJECT_DATA may be approved as an
 *  evidence plan, but MUST remain non-destructive (plannedAction NONE). */
export function canApproveErasurePlan(plan: ErasurePlan): { ok: boolean; blockers: ApprovalBlocker[] } {
  const blockers: ApprovalBlocker[] = [];
  const NON_DESTRUCTIVE = new Set<ErasureClassification>(["RETENTION_REQUIRED", "LEGAL_HOLD", "DEPENDENCY_BLOCKED", "NOT_SUBJECT_DATA"]);
  for (const it of plan.items) {
    if (!(ERASURE_CLASSIFICATIONS as string[]).includes(it.classification)) { blockers.push({ target: it.target, recordId: it.recordId, reason: "UNKNOWN_CLASSIFICATION" }); continue; }
    if (it.classification === "MANUAL_REVIEW_REQUIRED") { blockers.push({ target: it.target, recordId: it.recordId, reason: "MANUAL_REVIEW_REQUIRED" }); continue; }
    if (it.reasonCodes.includes("CONFIGURATION_REQUIRED")) { blockers.push({ target: it.target, recordId: it.recordId, reason: "CONFIGURATION_REQUIRED" }); continue; }
    if (NON_DESTRUCTIVE.has(it.classification) && it.plannedAction !== "NONE") { blockers.push({ target: it.target, recordId: it.recordId, reason: "NON_DESTRUCTIVE_MUST_NOT_ACT" }); continue; }
    if (it.classification === "DELETE_ALLOWED" && it.plannedAction !== "DELETE") { blockers.push({ target: it.target, recordId: it.recordId, reason: "ACTION_MISMATCH" }); continue; }
    if (it.classification === "ANONYMISE_REQUIRED" && it.plannedAction !== "ANONYMISE") { blockers.push({ target: it.target, recordId: it.recordId, reason: "ACTION_MISMATCH" }); continue; }
  }
  return { ok: blockers.length === 0, blockers };
}
