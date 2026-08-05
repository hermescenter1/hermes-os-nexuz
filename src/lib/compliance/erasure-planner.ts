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
}

const PRESERVE_ACTIONS = new Set(["ARCHIVE", "NO_AUTOMATED_ACTION", "REVIEW_REQUIRED"]);

function findMatchingPolicy(target: ErasureTargetDefinition, policies: ErasureRetentionPolicyLike[], org: string | null): ErasureRetentionPolicyLike | null {
  if (!target.retentionLookup || !org) return null;
  const matches = policies
    .filter((p) => p.organizationId === org && p.dataClass === target.retentionLookup!.dataClass && p.targetResource === target.retentionLookup!.targetResource)
    .sort((a, b) => a.id.localeCompare(b.id));
  return matches[0] ?? null;
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
  now: Date,
): ErasurePlanItem {
  const dependencyClassifications = [...record.dependency.codes].sort();
  let legalHoldId: string | null = null;
  let retentionPolicyId: string | null = null;

  // 1. Authoritative ownership — a record not attributable to the subject under the
  //    registry's explicit rules is NOT_SUBJECT_DATA (examined but not the subject's).
  const ownedBySubject = !!subjectId && record.ownedByUserId === subjectId;
  const ownedInScope = record.ownedByOrganizationId === null || (org !== null && record.ownedByOrganizationId === org);
  if (!ownedBySubject || !ownedInScope) {
    return { target: target.name, recordId: record.recordId, classification: "NOT_SUBJECT_DATA", plannedAction: "NONE", reasonCodes: ["OWNERSHIP_NOT_SUBJECT"], dependencyClassifications, retentionPolicyId: null, legalHoldId: null };
  }

  // 2. Active LegalHold ALWAYS wins over deletion/anonymisation.
  const hold = findMatchingHold(record, org, holds);
  if (hold) {
    legalHoldId = hold.id ?? null;
    return { target: target.name, recordId: record.recordId, classification: "LEGAL_HOLD", plannedAction: "NONE", reasonCodes: ["ACTIVE_LEGAL_HOLD"], dependencyClassifications, retentionPolicyId: null, legalHoldId };
  }

  // 3. Retention. Preservation-sensitive targets always RETENTION_REQUIRED. For a
  //    deletable target, a matching policy that is unapproved/unconfigured is
  //    CONFIGURATION_REQUIRED and is NEVER read as permission to delete.
  const policy = findMatchingPolicy(target, policies, org);
  if (policy) retentionPolicyId = policy.id;
  if (target.defaultClassification === "RETENTION_REQUIRED") {
    return { target: target.name, recordId: record.recordId, classification: "RETENTION_REQUIRED", plannedAction: "NONE", reasonCodes: ["PRESERVATION_SENSITIVE"], dependencyClassifications, retentionPolicyId, legalHoldId };
  }
  if (policy) {
    const cfg = classifyRetentionPolicy(policy);
    if (cfg.status === "CONFIGURATION_REQUIRED") {
      // Fail-closed: missing/unapproved retention config never grants deletion.
      return { target: target.name, recordId: record.recordId, classification: "RETENTION_REQUIRED", plannedAction: "NONE", reasonCodes: ["CONFIGURATION_REQUIRED"], dependencyClassifications, retentionPolicyId, legalHoldId };
    }
    const preserves = PRESERVE_ACTIONS.has(policy.action);
    const triggerAt = record.holdInputs.timestamp ?? null;
    const notYetDue = policy.retentionDays != null && triggerAt != null && now.getTime() < addDays(triggerAt, policy.retentionDays).getTime();
    if (preserves || notYetDue) {
      return { target: target.name, recordId: record.recordId, classification: "RETENTION_REQUIRED", plannedAction: "NONE", reasonCodes: [preserves ? "POLICY_PRESERVES" : "RETENTION_NOT_DUE"], dependencyClassifications, retentionPolicyId, legalHoldId };
    }
  }

  // 4. Required relational/operational dependency.
  if (record.dependency.blocked) {
    return { target: target.name, recordId: record.recordId, classification: "DEPENDENCY_BLOCKED", plannedAction: "NONE", reasonCodes: dependencyClassifications.length ? dependencyClassifications : ["DEPENDENCY"], dependencyClassifications, retentionPolicyId, legalHoldId };
  }

  // 5/6. Anonymisation, then deletion — clamped to the target's allowed strategy.
  if (target.defaultClassification === "ANONYMISE_REQUIRED") {
    const action = actionFor("ANONYMISE_REQUIRED", target.allowedExecutionStrategy);
    if (action === "ANONYMISE") return { target: target.name, recordId: record.recordId, classification: "ANONYMISE_REQUIRED", plannedAction: "ANONYMISE", reasonCodes: ["ANONYMISE_STRATEGY"], dependencyClassifications, retentionPolicyId, legalHoldId };
  }
  if (target.defaultClassification === "DELETE_ALLOWED") {
    const action = actionFor("DELETE_ALLOWED", target.allowedExecutionStrategy);
    if (action === "DELETE") return { target: target.name, recordId: record.recordId, classification: "DELETE_ALLOWED", plannedAction: "DELETE", reasonCodes: ["NO_KNOWN_BLOCKER"], dependencyClassifications, retentionPolicyId, legalHoldId };
  }

  // 7. Manual-review fallback — the system cannot safely determine an action.
  return { target: target.name, recordId: record.recordId, classification: "MANUAL_REVIEW_REQUIRED", plannedAction: "NONE", reasonCodes: ["INDETERMINATE"], dependencyClassifications, retentionPolicyId, legalHoldId };
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
  for (const { target, records } of input.collected) {
    for (const record of records) {
      items.push(classifyRecord(target, record, input.subjectId, input.organizationId, input.holds, input.policies, input.now));
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
