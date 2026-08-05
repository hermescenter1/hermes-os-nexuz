/**
 * Phase 97 Part H — plan orchestration (collect → build → store).
 *
 * Reads the authoritative job, collects ONLY the closed-registry target records for
 * the subject (safe projections, org+subject predicates), gathers the current active
 * legal holds and retention policies, builds the deterministic plan (pure) and stores
 * the immutable snapshot transactionally. No raw subject content ever enters the plan.
 */
import { getPrisma } from "@/lib/db/prisma";
import { listActiveLegalHoldsForOrg, listRetentionPoliciesForOrg } from "./db";
import { collectErasureTargets, type ErasurePrisma } from "./erasure-targets";
import { buildErasurePlan, type ErasurePlan, type ErasureRetentionPolicyLike, type ManualReviewResolution } from "./erasure-planner";
import { generateAndStoreErasurePlan, getErasureJobForOrg } from "./erasure-db";
import type { HoldLike } from "./retention-engine";
import type { DbLegalHold, DbRetentionPolicy } from "./types";

export type ErasurePlanningResult =
  | { ok: true; planVersion: number; planHash: string; plan: ErasurePlan }
  | { ok: false; reason: "NOT_FOUND" | "INVALID_STATE" | "UNAVAILABLE" | "ERROR" };

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

export async function planErasureForJob(params: {
  id: string; organizationId: string; actorId: string; now: Date;
}): Promise<ErasurePlanningResult> {
  const client = await getPrisma();
  if (!client) return { ok: false, reason: "UNAVAILABLE" };

  const job = await getErasureJobForOrg(params.id, params.organizationId);
  if (!job) return { ok: false, reason: "NOT_FOUND" };

  const subject = { userId: job.userId, candidateId: job.candidateId, organizationId: job.organizationId };
  const collected = await collectErasureTargets(client as unknown as ErasurePrisma, subject);
  const [holdsRaw, policiesRaw] = await Promise.all([
    listActiveLegalHoldsForOrg(params.organizationId),
    listRetentionPoliciesForOrg(params.organizationId),
  ]);

  const { plan, planHash } = buildErasurePlan({
    jobId:            job.id,
    privacyRequestId: job.privacyRequestId,
    organizationId:   job.organizationId,
    subjectClass:     job.subjectClass ?? "USER",
    subjectId:        job.userId,
    planVersion:      (job.planVersion ?? 0) + 1,
    now:              params.now,
    collected,
    holds:            holdsRaw.map(toHoldLike),
    policies:         policiesRaw.map(toPolicyLike),
    // Server-recorded governed review decisions — applied by the planner only at the
    // manual-review fallback (a resolution can never bypass hold/retention/dependency).
    resolutions:      Array.isArray(job.reviewResolutions) ? (job.reviewResolutions as unknown as ManualReviewResolution[]) : [],
  });

  const stored = await generateAndStoreErasurePlan({ id: params.id, organizationId: params.organizationId, actorId: params.actorId, plan, planHash, now: params.now });
  if (!stored.ok) return { ok: false, reason: stored.reason === "UNAVAILABLE" ? "UNAVAILABLE" : stored.reason === "NOT_FOUND" ? "NOT_FOUND" : stored.reason === "INVALID_STATE" ? "INVALID_STATE" : "ERROR" };
  return { ok: true, planVersion: stored.planVersion, planHash: stored.planHash, plan: { ...plan, planVersion: stored.planVersion } };
}
