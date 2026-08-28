/**
 * PHASE 104-B1 — typed audit adapter for recruitment writes.
 *
 * `AuditLog.metadata` is an untyped Json column; nothing in the schema forces
 * an entry to carry a reason or a before/after picture. This adapter is the
 * validated boundary: a recruitment audit row is REFUSED (throws) unless its
 * metadata parses against the schema below, so a shapeless blob can never
 * masquerade as an audit record. The write itself happens inside the caller's
 * transaction — an audit row that could silently vanish while the job row
 * committed would not be an audit trail.
 */

import { z } from "zod";

export const RECRUITMENT_AUDIT_ACTIONS = [
  "recruitment.job.draft_created",
] as const;

const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValue), z.record(z.string(), jsonValue)]),
);

export const recruitmentAuditMetadataSchema = z
  .object({
    reason: z.string().trim().min(1, "an audit entry must say WHY"),
    before: jsonValue.nullable(),
    after: jsonValue,
    stage: z.literal("B1"),
  })
  .strict();

export type RecruitmentAuditMetadata = z.infer<typeof recruitmentAuditMetadataSchema>;

export interface RecruitmentAuditEntry {
  action: (typeof RECRUITMENT_AUDIT_ACTIONS)[number];
  entityType: "AtsJob";
  entityId: string;
  userId: string;
  organizationId: string;
  metadata: RecruitmentAuditMetadata;
}

/**
 * Validate and shape the `auditLog.create` payload. Throws on an invalid
 * shape — fail closed, never write an unvalidated audit row.
 */
export function buildRecruitmentAuditCreate(entry: RecruitmentAuditEntry) {
  const metadata = recruitmentAuditMetadataSchema.parse(entry.metadata);
  if (!entry.userId || !entry.organizationId || !entry.entityId) {
    throw new Error("recruitment audit requires actor, organization and entity");
  }
  return {
    data: {
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      organizationId: entry.organizationId,
      outcome: "COMPLETED",
      metadata,
    },
  };
}
