/**
 * Phase 97 Part H — erasure job projections. Minimised: the subject email, free-text
 * reason and raw IP are NEVER exposed. The plan snapshot is safe by construction
 * (identifiers + closed classifications + reason codes only), so an authorised org
 * viewer may see it; the list projection omits the full plan and shows only counts.
 */
import type { DbDataDeletionRequest } from "./types";

function planCounts(job: DbDataDeletionRequest): Record<string, number> | null {
  const plan = job.planJson as { counts?: Record<string, number> } | null;
  return plan && typeof plan === "object" && plan.counts ? plan.counts : null;
}

export function toErasureJobDto(job: DbDataDeletionRequest) {
  return {
    id:                job.id,
    privacyRequestId:  job.privacyRequestId,
    organizationId:    job.organizationId,
    lifecycle:         job.lifecycle,
    subjectClass:      job.subjectClass,
    planVersion:       job.planVersion,
    planHash:          job.planHash,
    plannedAt:         job.plannedAt,
    approvedAt:        job.approvedAt,
    blockedReasonCode: job.blockedReasonCode,
    failureCode:       job.failureCode,
    planCounts:        planCounts(job),
    createdAt:         job.createdAt,
    updatedAt:         job.updatedAt,
  };
}

/** Detailed projection including the (content-free) plan snapshot for review. */
export function toErasureJobDetailDto(job: DbDataDeletionRequest) {
  return {
    ...toErasureJobDto(job),
    plan: job.planJson ?? null,
  };
}
