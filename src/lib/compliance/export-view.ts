/**
 * Phase 97 Part G — export job admin projection. Minimised: the internal storage
 * key, the subject email, the legacy downloadUrl and the raw IP are never
 * exposed; only governed lifecycle, integrity and expiry metadata are returned.
 */
import type { DbDataExportRequest } from "./types";

export function toExportJobDto(job: DbDataExportRequest) {
  return {
    id:               job.id,
    privacyRequestId: job.privacyRequestId,
    organizationId:   job.organizationId,
    lifecycle:        job.lifecycle,
    subjectClass:     job.subjectClass,
    schemaVersion:    job.schemaVersion,
    contentHash:      job.contentHash,
    expiresAt:        job.expiresAt,
    revokedAt:        job.revokedAt,
    completedAt:      job.completedAt,
    failureCode:      job.failureCode,
    createdAt:        job.createdAt,
    updatedAt:        job.updatedAt,
  };
}

/** Self-service subject view — only safe status, no internal identifiers. */
export function toSubjectExportStatusDto(job: DbDataExportRequest) {
  return {
    lifecycle:    job.lifecycle,
    expiresAt:    job.expiresAt,
    completedAt:  job.completedAt,
  };
}
