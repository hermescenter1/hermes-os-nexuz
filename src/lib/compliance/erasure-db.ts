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
import type { DbDataDeletionRequest } from "./types";
import type { ErasurePlan } from "./erasure-planner";

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
class ApproveError extends Error { constructor(public reason: ApproveReason) { super(reason); this.name = "ApproveError"; } }
type ApproveReason = "NOT_FOUND" | "NOT_IN_REVIEW" | "PLAN_HASH_MISMATCH" | "CONFLICT";
class ArmError extends Error { constructor(public reason: ArmReason) { super(reason); this.name = "ArmError"; } }
type ArmReason = "NOT_FOUND" | "NOT_APPROVED" | "CONFLICT";

const PLANNABLE_FROM = new Set(["REQUESTED", "PLANNING", "PLAN_READY", "BLOCKED"]);

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
      const upd = (await erasure.updateMany({
        where: { id: params.id, organizationId: params.organizationId, lifecycle: job.lifecycle },
        data: {
          planJson: snapshot, planHash: params.planHash, planVersion: newVersion,
          plannedAt: params.now, plannedBy: params.actorId,
          approvedBy: null, approvedAt: null,          // any prior approval is invalidated
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
 * Approve a plan, binding approval ATOMICALLY to an exact planHash. Locks the job,
 * requires IN_REVIEW and job.planHash === expectedPlanHash, then sets approval
 * attribution and moves to APPROVED. A concurrent approval loses the lock race and
 * sees a non-IN_REVIEW state (CONFLICT); a stale expectedPlanHash is rejected.
 */
export async function approveErasurePlanForOrg(params: {
  id: string; organizationId: string; actorId: string; expectedPlanHash: string; now: Date;
}): Promise<{ ok: true; planHash: string } | { ok: false; reason: ApproveReason | "UNAVAILABLE" }> {
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
      if (!job.planHash || job.planHash !== params.expectedPlanHash) throw new ApproveError("PLAN_HASH_MISMATCH");
      const upd = (await erasure.updateMany({
        where: { id: params.id, organizationId: params.organizationId, lifecycle: "IN_REVIEW", planHash: params.expectedPlanHash },
        data: { lifecycle: "APPROVED", approvedBy: params.actorId, approvedAt: params.now, updatedAt: params.now },
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) throw new ApproveError("CONFLICT");
      return { ok: true as const, planHash: params.expectedPlanHash };
    });
  } catch (err) {
    if (err instanceof ApproveError) return { ok: false, reason: err.reason };
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
      if (params.to === "PLANNING") { data.approvedBy = null; data.approvedAt = null; } // invalidate approval
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
