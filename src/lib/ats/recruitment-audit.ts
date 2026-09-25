/**
 * PHASE 104-B1 — typed audit adapter for recruitment writes.
 * ATS-B2 / ATS-S1 — widened to the intake, review and decision actions.
 *
 * `AuditLog.metadata` is an untyped Json column; nothing in the schema forces
 * an entry to carry a reason or a before/after picture. This adapter is the
 * validated boundary: a recruitment audit row is REFUSED (throws) unless its
 * metadata parses against the schema below, so a shapeless blob can never
 * masquerade as an audit record. The write itself happens inside the caller's
 * transaction — an audit row that could silently vanish while the job row
 * committed would not be an audit trail.
 *
 * SYSTEM ACTIONS. The public intake and the review worker act on nobody's
 * session, so `userId` is null for them and `metadata.actor` names the system
 * component instead. A human action MUST carry a userId — the adapter refuses
 * a null actor for any action outside the SYSTEM_ACTIONS set.
 *
 * NO PII. Metadata carries identifiers (application, job, cycle, correlation)
 * and outcomes. It never carries a name, an e-mail, a phone number or résumé
 * text — the row is read by operators and exported to evidence packs.
 */

import { z } from "zod";

export const RECRUITMENT_AUDIT_ACTIONS = [
  "recruitment.job.draft_created",
  "recruitment.job.criteria_applied",
  // ATS-B2
  "recruitment.application.received",
  "recruitment.application.duplicate_replayed",
  // ATS-S1
  "recruitment.review.completed",
  "recruitment.review.failed",
  "recruitment.decision.recorded",
  "recruitment.application.status_transition",
  "recruitment.application.anonymized",
  // ATS-M1 — position management and organization settings. All HUMAN
  // actions: every one needs the acting user.
  "recruitment.position.created",
  "recruitment.position.updated",
  "recruitment.position.published",
  "recruitment.position.paused",
  "recruitment.position.resumed",
  "recruitment.position.closed",
  "recruitment.position.reopened",
  "recruitment.position.archived",
  "recruitment.position.soft_deleted",
  "recruitment.settings.updated",
  "recruitment.retention_policy.updated",
] as const;

export type RecruitmentAuditAction = (typeof RECRUITMENT_AUDIT_ACTIONS)[number];

const SYSTEM_ACTIONS: ReadonlySet<RecruitmentAuditAction> = new Set<RecruitmentAuditAction>([
  "recruitment.application.received",
  "recruitment.application.duplicate_replayed",
  "recruitment.review.completed",
  "recruitment.review.failed",
  "recruitment.application.anonymized",
]);

const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValue), z.record(z.string(), jsonValue)]),
);

export const recruitmentAuditMetadataSchema = z
  .object({
    reason: z.string().trim().min(1, "an audit entry must say WHY"),
    before: jsonValue.nullable(),
    after: jsonValue,
    stage: z.enum(["B1", "B2", "S1", "M1"]),
    /** Present for system actions; names the component, never a person. */
    actor: z.enum(["SYSTEM_PUBLIC_INTAKE", "SYSTEM_REVIEW_WORKER", "SYSTEM_RETENTION"]).optional(),
    /**
     * ATS-M1 — what a destructive or lifecycle action touched or left linked
     * (applications, interviews, reviews, audit records). Counts only.
     */
    affectedCounts: z.record(z.string(), z.number().int().min(0)).optional(),
  })
  .strict();

export type RecruitmentAuditMetadata = z.infer<typeof recruitmentAuditMetadataSchema>;

export interface RecruitmentAuditEntry {
  action: RecruitmentAuditAction;
  entityType: "AtsJob" | "AtsApplication" | "AtsAiReview" | "AtsReviewDecision" | "AtsOrganizationSettings" | "RetentionPolicy";
  entityId: string;
  /** null ONLY for a SYSTEM action, and then `metadata.actor` is required. */
  userId: string | null;
  organizationId: string;
  correlationId?: string;
  metadata: RecruitmentAuditMetadata;
}

/**
 * Validate and shape the `auditLog.create` payload. Throws on an invalid
 * shape — fail closed, never write an unvalidated audit row.
 */
export function buildRecruitmentAuditCreate(entry: RecruitmentAuditEntry) {
  const metadata = recruitmentAuditMetadataSchema.parse(entry.metadata);
  if (!entry.organizationId || !entry.entityId) {
    throw new Error("recruitment audit requires organization and entity");
  }
  const isSystem = SYSTEM_ACTIONS.has(entry.action);
  if (!isSystem && !entry.userId) {
    throw new Error("recruitment audit requires a human actor for this action");
  }
  if (isSystem && !metadata.actor) {
    throw new Error("a system audit entry must name the system actor");
  }
  return {
    data: {
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      organizationId: entry.organizationId,
      outcome: "COMPLETED",
      ...(entry.correlationId ? { correlationId: entry.correlationId } : {}),
      metadata,
    },
  };
}
