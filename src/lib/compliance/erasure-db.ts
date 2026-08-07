/**
 * Phase 97 Part H — governed erasure persistence (tenant + subject scoped).
 *
 * Every read/write predicate carries the authoritative organizationId and, where
 * applicable, the subject identity — never a foreign-key match alone. The child job
 * never broadens the parent PrivacyRequest's subject or org. Plan generation,
 * approval and execution-arming all take a REAL PostgreSQL row lock on the
 * authoritative job (SELECT ... FOR UPDATE) FIRST, then re-read and validate under
 * the lock, so concurrent plan/approval operations linearize (mirrors the hardened
 * export delivery design).
 */
import { getPrisma } from "@/lib/db/prisma";
import { randomUUID } from "node:crypto";
import type { DbDataDeletionRequest, DbLegalHold, DbRetentionPolicy } from "./types";
import {
  canApproveErasurePlan, isManualResolutionCode, isAllowedResolutionAuthority,
  validatePersistedErasurePlan, normalizeStoredResolutions, activeResolutionsForPlan,
  resolutionAffectedResultItem, buildErasurePlan,
  type ErasurePlan, type ManualReviewResolution, type ManualResolutionCode,
  type ErasureRetentionPolicyLike, type ResolutionStatus,
} from "./erasure-planner";
import { getErasureTarget, collectErasureTargets, type ErasurePrisma } from "./erasure-targets";
import type { HoldLike } from "./retention-engine";

type AnyModel = Record<string, (...args: unknown[]) => Promise<unknown>>;
type TxRaw = Record<string, AnyModel> & {
  $queryRawUnsafe: <T = unknown>(sql: string, ...values: unknown[]) => Promise<T>;
};
type TxClient = { $transaction: <T>(fn: (tx: TxRaw) => Promise<T>) => Promise<T> };

async function xm() {
  const db = await getPrisma();
  if (!db) return null;
  const d = db as Record<string, unknown>;
  return { erasure: d.dataDeletionRequest as AnyModel };
}

/**
 * Acquire a REAL PostgreSQL row lock on the authoritative erasure job for the rest of
 * the surrounding interactive transaction. Identifiers are BOUND ($1/$2) — never
 * interpolated. Returns whether the row exists (was locked).
 */
async function lockErasureJobRow(tx: TxRaw, id: string, organizationId: string | null): Promise<boolean> {
  if (!organizationId) return false;
  const rows = (await tx.$queryRawUnsafe<Array<{ id: string }>>(
    'SELECT "id" FROM "DataDeletionRequest" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE',
    id,
    organizationId,
  )) ?? [];
  return Array.isArray(rows) && rows.length === 1;
}

export async function listErasureJobsForOrg(organizationId: string, take = 200): Promise<DbDataDeletionRequest[]> {
  const db = await xm();
  if (!db) return [];
  try {
    return (await db.erasure.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take } as unknown)) as DbDataDeletionRequest[];
  } catch { return []; }
}

export async function getErasureJobForOrg(id: string, organizationId: string): Promise<DbDataDeletionRequest | null> {
  const db = await xm();
  if (!db) return null;
  try {
    return (await db.erasure.findFirst({ where: { id, organizationId } } as unknown)) as DbDataDeletionRequest | null;
  } catch { return null; }
}

export async function getActiveErasureJobForParent(privacyRequestId: string, organizationId: string): Promise<DbDataDeletionRequest | null> {
  const db = await xm();
  if (!db) return null;
  try {
    return (await db.erasure.findFirst({
      where: { privacyRequestId, organizationId, lifecycle: { in: ["REQUESTED", "PLANNING", "PLAN_READY", "IN_REVIEW", "APPROVED", "EXECUTION_PENDING", "EXECUTING"] } },
    } as unknown)) as DbDataDeletionRequest | null;
  } catch { return null; }
}

/**
 * Create a child erasure job bound to an approved parent PrivacyRequest. Subject +
 * org come from the SERVER-validated parent, never the client. Idempotent: a P2002 on
 * the active-parent partial-unique index means a concurrent request already created
 * the active job — the caller re-reads and returns it.
 */
export async function createErasureJobForParent(params: {
  parent: { id: string; organizationId: string; userId: string | null; email: string; locale: string };
  actorId: string;
}): Promise<{ ok: true; job: DbDataDeletionRequest } | { ok: false; reason: "DUPLICATE" | "ERROR" }> {
  const db = await xm();
  if (!db) return { ok: false, reason: "ERROR" };
  try {
    const job = (await db.erasure.create({
      data: {
        id:               randomUUID(),
        privacyRequestId: params.parent.id,
        organizationId:   params.parent.organizationId,
        userId:           params.parent.userId,
        candidateId:      null,                 // governed jobs are USER-only
        email:            params.parent.email,
        locale:           params.parent.locale,
        subjectClass:     "USER",
        status:           "PENDING",            // legacy column retained
        lifecycle:        "REQUESTED",
        idempotencyKey:   params.parent.id,     // one active job per parent
        metadata:         {},
        updatedAt:        new Date(),
      },
    } as unknown)) as DbDataDeletionRequest;
    return { ok: true, job };
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") return { ok: false, reason: "DUPLICATE" };
    return { ok: false, reason: "ERROR" };
  }
}

class PlanError extends Error { constructor(public reason: PlanReason) { super(reason); this.name = "PlanError"; } }
type PlanReason = "NOT_FOUND" | "INVALID_STATE";
class ApproveError extends Error { constructor(public reason: ApproveReason, public blockerCount = 0) { super(reason); this.name = "ApproveError"; } }
type ApproveReason = "NOT_FOUND" | "NOT_IN_REVIEW" | "PLAN_HASH_MISMATCH" | "PLAN_VERSION_MISMATCH" | "PLAN_INVALID" | "PLAN_NOT_APPROVABLE" | "CONFLICT";
class ArmError extends Error { constructor(public reason: ArmReason) { super(reason); this.name = "ArmError"; } }
type ArmReason = "NOT_FOUND" | "NOT_APPROVED" | "CONFLICT";
class ResolveError extends Error { constructor(public reason: ResolveReason) { super(reason); this.name = "ResolveError"; } }
type ResolveReason =
  | "NOT_FOUND" | "INVALID_STATE" | "PLAN_BINDING_MISMATCH" | "PLAN_INVALID"
  | "ITEM_NOT_MANUAL" | "UNKNOWN_TARGET" | "RESOLUTION_UNSUPPORTED" | "AUTHORITY_INVALID"
  | "RESOLUTION_NOT_APPLIED" | "CONFLICT";

// Regeneration is allowed pre-approval only. IN_REVIEW is included because a governed
// manual-review resolution during review must produce a NEW canonical plan version
// (landing back in PLAN_READY, consistent with the IN_REVIEW→PLAN_READY transition).
const PLANNABLE_FROM = new Set(["REQUESTED", "PLANNING", "PLAN_READY", "IN_REVIEW", "BLOCKED"]);

function toHoldLike(h: DbLegalHold): HoldLike & { id: string } {
  return {
    id: h.id, organizationId: h.organizationId, scopeType: h.scopeType, status: h.status,
    subjectId: h.subjectId, resourceType: h.resourceType, resourceId: h.resourceId,
    processingActivityId: h.processingActivityId, incidentId: h.incidentId,
    rangeStart: h.rangeStart, rangeEnd: h.rangeEnd,
  };
}
function toPolicyLike(p: DbRetentionPolicy): ErasureRetentionPolicyLike {
  return {
    id: p.id, organizationId: p.organizationId, dataClass: p.dataClass, targetResource: p.targetResource,
    action: p.action, retentionDays: p.retentionDays, approvalState: p.approvalState,
    enabled: p.enabled, dryRunOnly: p.dryRunOnly,
  };
}
/** Re-status a stored resolutions array: mark every APPLIED entry with `to`. */
function restatusApplied(raw: unknown, to: ResolutionStatus): ManualReviewResolution[] {
  return normalizeStoredResolutions(raw).map((r) => (r.resolutionStatus === "APPLIED" ? { ...r, resolutionStatus: to } : r));
}

/**
 * Transactionally store a freshly-built plan snapshot. Locks the job, requires a
 * plannable lifecycle, atomically assigns the next planVersion, writes the immutable
 * snapshot (planJson/planHash/planVersion/plannedAt/plannedBy) and moves the job to
 * PLAN_READY. Regeneration is allowed only while REQUESTED/PLANNING/PLAN_READY/
 * BLOCKED — never once APPROVED (the approved snapshot is immutable).
 */
export async function generateAndStoreErasurePlan(params: {
  id: string; organizationId: string; actorId: string; plan: ErasurePlan; planHash: string; now: Date;
}): Promise<{ ok: true; planVersion: number; planHash: string } | { ok: false; reason: PlanReason | "UNAVAILABLE" | "ERROR" }> {
  const client = await getPrisma();
  if (!client) return { ok: false, reason: "UNAVAILABLE" };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      const erasure = tx.dataDeletionRequest as AnyModel;
      if (!(await lockErasureJobRow(tx, params.id, params.organizationId))) throw new PlanError("NOT_FOUND");
      const job = (await erasure.findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as DbDataDeletionRequest | null;
      if (!job) throw new PlanError("NOT_FOUND");
      if (!PLANNABLE_FROM.has(job.lifecycle)) throw new PlanError("INVALID_STATE");
      const newVersion = (job.planVersion ?? 0) + 1;
      // planHash excludes planVersion, so correcting the version does not change it.
      const snapshot = { ...params.plan, planVersion: newVersion };
      // An INDEPENDENT plan regeneration must not silently reuse any prior manual
      // resolution: every APPLIED decision is INVALIDATED and its item reverts to
      // MANUAL_REVIEW_REQUIRED (this path builds the plan with NO resolutions).
      const invalidatedResolutions = restatusApplied(job.reviewResolutions, "INVALIDATED");
      const upd = (await erasure.updateMany({
        where: { id: params.id, organizationId: params.organizationId, lifecycle: job.lifecycle },
        data: {
          planJson: snapshot, planHash: params.planHash, planVersion: newVersion,
          plannedAt: params.now, plannedBy: params.actorId,
          reviewResolutions: invalidatedResolutions,
          // Any prior approval — attribution AND its bound hash/version — is invalidated.
          approvedBy: null, approvedAt: null, approvedPlanHash: null, approvedPlanVersion: null,
          blockedReasonCode: null, lifecycle: "PLAN_READY", updatedAt: params.now,
        },
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) throw new PlanError("INVALID_STATE");
      return { ok: true as const, planVersion: newVersion, planHash: params.planHash };
    });
  } catch (err) {
    if (err instanceof PlanError) return { ok: false, reason: err.reason };
    return { ok: false, reason: "ERROR" };
  }
}

/**
 * Approve a plan, binding approval ATOMICALLY to an exact planHash AND planVersion.
 * Inside the SELECT ... FOR UPDATE transaction the stored job is re-read, its
 * persisted planJson is STRICTLY parsed and its hash RECOMPUTED; approval requires
 *   recomputed == job.planHash == expectedPlanHash
 *   planJson.planVersion == job.planVersion == expectedPlanVersion
 * and canApproveErasurePlan(persisted snapshot) to pass — all evaluated on the
 * LOCKED row, never on a pre-lock route read. On success approvedPlanHash and
 * approvedPlanVersion are set together with the APPROVED transition, and the
 * committed values are returned for the audit record. A concurrent approval loses
 * the lock race (CONFLICT); a stale hash/version is rejected
 * (STALE_ERASURE_PLAN_APPROVAL=0).
 */
export async function approveErasurePlanForOrg(params: {
  id: string; organizationId: string; actorId: string;
  expectedPlanHash: string; expectedPlanVersion: number; now: Date;
}): Promise<
  | { ok: true; planHash: string; planVersion: number }
  | { ok: false; reason: ApproveReason | "UNAVAILABLE"; blockerCount?: number }
> {
  const client = await getPrisma();
  if (!client) return { ok: false, reason: "UNAVAILABLE" };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      const erasure = tx.dataDeletionRequest as AnyModel;
      if (!(await lockErasureJobRow(tx, params.id, params.organizationId))) throw new ApproveError("NOT_FOUND");
      const job = (await erasure.findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as DbDataDeletionRequest | null;
      if (!job) throw new ApproveError("NOT_FOUND");
      if (job.lifecycle !== "IN_REVIEW") throw new ApproveError("NOT_IN_REVIEW");

      // STRICTLY validate the PERSISTED snapshot against the authoritative job — the
      // single shared validator (bindings, closed vocab, no duplicate/unknown target,
      // counts, and recomputed hash == job.planHash). Every closed failure blocks
      // approval (CROSS_JOB/SUBJECT/UNKNOWN_TARGET/MALFORMED/COUNT_MISMATCH=0).
      const validation = validatePersistedErasurePlan(job.planJson, {
        jobId: job.id, privacyRequestId: job.privacyRequestId, organizationId: job.organizationId,
        subjectId: job.userId, expectedPlanHash: job.planHash,
      });
      if (!validation.ok) throw new ApproveError(validation.code === "PLAN_HASH_MISMATCH" ? "PLAN_HASH_MISMATCH" : "PLAN_INVALID");
      const plan = validation.plan;
      if (!job.planHash || job.planHash !== params.expectedPlanHash) throw new ApproveError("PLAN_HASH_MISMATCH");
      if (job.planVersion == null || plan.planVersion !== job.planVersion || job.planVersion !== params.expectedPlanVersion) {
        throw new ApproveError("PLAN_VERSION_MISMATCH");
      }
      // Approvability is evaluated on the LOCKED persisted snapshot (unresolved
      // manual items / CONFIGURATION_REQUIRED / unknown classifications block).
      const approvable = canApproveErasurePlan(plan);
      if (!approvable.ok) throw new ApproveError("PLAN_NOT_APPROVABLE", approvable.blockers.length);

      const upd = (await erasure.updateMany({
        where: { id: params.id, organizationId: params.organizationId, lifecycle: "IN_REVIEW", planHash: params.expectedPlanHash, planVersion: params.expectedPlanVersion },
        data: {
          lifecycle: "APPROVED", approvedBy: params.actorId, approvedAt: params.now,
          approvedPlanHash: params.expectedPlanHash, approvedPlanVersion: params.expectedPlanVersion,
          updatedAt: params.now,
        },
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) throw new ApproveError("CONFLICT");
      return { ok: true as const, planHash: params.expectedPlanHash, planVersion: params.expectedPlanVersion };
    });
  } catch (err) {
    if (err instanceof ApproveError) return { ok: false, reason: err.reason, blockerCount: err.blockerCount };
    return { ok: false, reason: "CONFLICT" };
  }
}

/**
 * ATOMIC governed manual-review resolution + plan regeneration. In ONE interactive
 * transaction under SELECT ... FOR UPDATE: re-read the job; require PLAN_READY or
 * IN_REVIEW; strictly validate the persisted source snapshot AND its exact binding
 * (sourcePlanHash/Version); prove the selected item is MANUAL_REVIEW_REQUIRED;
 * validate the closed resolution + authority boundary + target strategy; collect
 * ALL authoritative target/retention/legal-hold inputs THROUGH THE SAME transaction
 * client; build the resulting canonical plan; assign the next planVersion; and
 * persist the resolution evidence (full source→result lineage, status APPLIED), the
 * resulting plan snapshot/hash/version, plan attribution, cleared approval binding
 * and lifecycle PLAN_READY — all committed together. If anything fails, NOTHING is
 * stored (no resolution, no plan): RESOLUTION_WITHOUT_NEW_PLAN=0,
 * RESOLUTION_PARTIAL_COMMIT=0. The route writes the audit event only after commit.
 */
export async function resolveManualReviewAndRegeneratePlanForOrg(params: {
  id: string; organizationId: string; actorId: string;
  target: string; recordId: string; resolution: ManualResolutionCode;
  sourcePlanHash: string; sourcePlanVersion: number; authority: string; now: Date;
}): Promise<{ ok: true; planVersion: number; planHash: string } | { ok: false; reason: ResolveReason | "UNAVAILABLE" }> {
  const client = await getPrisma();
  if (!client) return { ok: false, reason: "UNAVAILABLE" };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      const erasure = tx.dataDeletionRequest as AnyModel;
      if (!(await lockErasureJobRow(tx, params.id, params.organizationId))) throw new ResolveError("NOT_FOUND");
      const job = (await erasure.findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as DbDataDeletionRequest | null;
      if (!job) throw new ResolveError("NOT_FOUND");
      if (!(job.lifecycle === "PLAN_READY" || job.lifecycle === "IN_REVIEW")) throw new ResolveError("INVALID_STATE");

      // Strictly validate the persisted source snapshot against the authoritative job.
      const validation = validatePersistedErasurePlan(job.planJson, {
        jobId: job.id, privacyRequestId: job.privacyRequestId, organizationId: job.organizationId,
        subjectId: job.userId, expectedPlanHash: job.planHash,
      });
      if (!validation.ok) throw new ResolveError(validation.code === "PLAN_BINDING_MISMATCH" ? "PLAN_BINDING_MISMATCH" : "PLAN_INVALID");
      const sourcePlan = validation.plan;

      // The client's expected source binding must equal the current stored plan.
      if (!job.planHash || job.planHash !== params.sourcePlanHash || job.planVersion !== params.sourcePlanVersion) {
        throw new ResolveError("PLAN_BINDING_MISMATCH");
      }
      // The selected item must currently be MANUAL_REVIEW_REQUIRED.
      if (!sourcePlan.items.some((it) => it.target === params.target && it.recordId === params.recordId && it.classification === "MANUAL_REVIEW_REQUIRED")) {
        throw new ResolveError("ITEM_NOT_MANUAL");
      }
      // Closed resolution, authority boundary and target strategy.
      if (!isManualResolutionCode(params.resolution)) throw new ResolveError("RESOLUTION_UNSUPPORTED");
      if (!isAllowedResolutionAuthority(params.authority)) throw new ResolveError("AUTHORITY_INVALID");
      const targetDef = getErasureTarget(params.target);
      if (!targetDef) throw new ResolveError("UNKNOWN_TARGET");
      if (params.resolution === "ANONYMISE_REQUIRED" && targetDef.allowedExecutionStrategy !== "ANONYMISE") {
        throw new ResolveError("RESOLUTION_UNSUPPORTED");
      }

      // The resolution set for the NEW plan: prior resolutions that produced the
      // CURRENT plan (live), minus any prior decision for this same item, plus the
      // new decision. A resolution bound to a different result plan is never reused.
      const prior = normalizeStoredResolutions(job.reviewResolutions);
      const carried = activeResolutionsForPlan(prior, job.planHash, job.planVersion ?? -1)
        .filter((r) => !(r.target === params.target && r.recordId === params.recordId));
      const newRecord: ManualReviewResolution = {
        jobId: job.id, target: params.target, recordId: params.recordId, resolution: params.resolution,
        sourcePlanHash: job.planHash, sourcePlanVersion: job.planVersion as number,
        resultPlanHash: "", resultPlanVersion: 0, resolutionStatus: "APPLIED",
        authority: params.authority, resolvedBy: params.actorId, resolvedAt: params.now.toISOString(),
      };
      const applied = [...carried, newRecord];

      // Collect ALL authoritative inputs through the SAME transaction client.
      const subject = { userId: job.userId, candidateId: job.candidateId, organizationId: job.organizationId };
      const collected = await collectErasureTargets(tx as unknown as ErasurePrisma, subject);
      const holdsRaw = (await (tx.legalHold as AnyModel).findMany({ where: { organizationId: params.organizationId, status: "ACTIVE" } })) as DbLegalHold[];
      const policiesRaw = (await (tx.retentionPolicy as AnyModel).findMany({ where: { organizationId: params.organizationId } })) as DbRetentionPolicy[];

      const newVersion = (job.planVersion ?? 0) + 1;
      const { plan: resultPlan, planHash: resultHash } = buildErasurePlan({
        jobId: job.id, privacyRequestId: job.privacyRequestId, organizationId: job.organizationId,
        subjectClass: job.subjectClass ?? "USER", subjectId: job.userId, planVersion: newVersion, now: params.now,
        collected, holds: holdsRaw.map(toHoldLike), policies: policiesRaw.map(toPolicyLike), resolutions: applied,
      });

      // Bind resolution status to the plan OUTCOME. Each applied resolution is APPLIED
      // only if it ACTUALLY affected its result item (the item exists AND its
      // classification/action/reason correspond to that exact closed decision — i.e.
      // it was not overridden by a hold/retention/dependency/ownership change and its
      // record did not disappear). Otherwise it is INVALIDATED.
      const key = (r: { target: string; recordId: string }) => `${r.target} ${r.recordId}`;
      const resultByKey = new Map(resultPlan.items.map((it) => [key(it), it]));

      // Fail closed: the NEWLY submitted resolution MUST have a matching result item,
      // otherwise nothing is stored and the whole transaction rolls back.
      if (!resolutionAffectedResultItem(params.resolution, resultByKey.get(key(newRecord)))) {
        throw new ResolveError("RESOLUTION_NOT_APPLIED");
      }

      const boundApplied = applied.map((r) => (
        resolutionAffectedResultItem(r.resolution, resultByKey.get(key(r)))
          ? { ...r, resultPlanHash: resultHash, resultPlanVersion: newVersion, resolutionStatus: "APPLIED" as ResolutionStatus }
          : { ...r, resolutionStatus: "INVALIDATED" as ResolutionStatus }
      ));
      const byKey = new Map<string, ManualReviewResolution>();
      for (const r of prior) byKey.set(key(r), r.resolutionStatus === "APPLIED" ? { ...r, resolutionStatus: "SUPERSEDED" } : r);
      for (const r of boundApplied) byKey.set(key(r), r);
      const finalResolutions = [...byKey.values()];

      const snapshot = { ...resultPlan, planVersion: newVersion };
      const upd = (await erasure.updateMany({
        where: { id: params.id, organizationId: params.organizationId, lifecycle: job.lifecycle, planHash: params.sourcePlanHash, planVersion: params.sourcePlanVersion },
        data: {
          reviewResolutions: finalResolutions,
          planJson: snapshot, planHash: resultHash, planVersion: newVersion,
          plannedAt: params.now, plannedBy: params.actorId,
          approvedBy: null, approvedAt: null, approvedPlanHash: null, approvedPlanVersion: null,
          blockedReasonCode: null, lifecycle: "PLAN_READY", updatedAt: params.now,
        },
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) throw new ResolveError("CONFLICT");
      return { ok: true as const, planVersion: newVersion, planHash: resultHash };
    });
  } catch (err) {
    if (err instanceof ResolveError) return { ok: false, reason: err.reason };
    return { ok: false, reason: "CONFLICT" };
  }
}

/**
 * Arm an APPROVED plan for execution: locks the job, requires APPROVED, sets the
 * execution idempotency key and moves to EXECUTION_PENDING. Execution itself remains
 * behind the default-false env gate at the route.
 */
export async function armErasureExecutionForOrg(params: {
  id: string; organizationId: string; actorId: string; executionIdempotencyKey: string; now: Date;
}): Promise<{ ok: true } | { ok: false; reason: ArmReason | "UNAVAILABLE" }> {
  const client = await getPrisma();
  if (!client) return { ok: false, reason: "UNAVAILABLE" };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      const erasure = tx.dataDeletionRequest as AnyModel;
      if (!(await lockErasureJobRow(tx, params.id, params.organizationId))) throw new ArmError("NOT_FOUND");
      const job = (await erasure.findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as DbDataDeletionRequest | null;
      if (!job) throw new ArmError("NOT_FOUND");
      if (job.lifecycle !== "APPROVED") throw new ArmError("NOT_APPROVED");
      const upd = (await erasure.updateMany({
        where: { id: params.id, organizationId: params.organizationId, lifecycle: "APPROVED" },
        data: { lifecycle: "EXECUTION_PENDING", executionIdempotencyKey: params.executionIdempotencyKey, updatedAt: params.now },
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) throw new ArmError("CONFLICT");
      return { ok: true as const };
    });
  } catch (err) {
    if (err instanceof ArmError) return { ok: false, reason: err.reason };
    return { ok: false, reason: "CONFLICT" };
  }
}

/**
 * Generic tenant-scoped lifecycle transition (submit-to-review, reject, send-back,
 * invalidate, cancel) with a lock + expected-from predicate. Attribution is set
 * server-side; entering PLANNING invalidates any prior approval.
 */
export async function transitionErasureJobForOrg(params: {
  id: string; organizationId: string; from: string; to: string; actorId: string; blockedReasonCode?: string;
}): Promise<{ affected: number }> {
  const client = await getPrisma();
  if (!client) return { affected: 0 };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      const erasure = tx.dataDeletionRequest as AnyModel;
      if (!(await lockErasureJobRow(tx, params.id, params.organizationId))) return { affected: 0 };
      const data: Record<string, unknown> = { lifecycle: params.to, updatedAt: new Date() };
      if (params.to === "PLANNING") { data.approvedBy = null; data.approvedAt = null; data.approvedPlanHash = null; data.approvedPlanVersion = null; } // invalidate approval + its binding
      if (params.to === "BLOCKED") { data.blockedReasonCode = params.blockedReasonCode ?? "BLOCKED"; }
      if (params.to === "FAILED") { data.failureCode = params.blockedReasonCode ?? "UNSPECIFIED"; }
      const r = (await erasure.updateMany({
        where: { id: params.id, organizationId: params.organizationId, lifecycle: params.from },
        data,
      })) as { count?: number };
      return { affected: typeof r?.count === "number" ? r.count : 0 };
    });
  } catch { return { affected: 0 }; }
}
