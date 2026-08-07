/**
 * Phase 97 — governed compliance evidence packs: strict input schema + safe DTO.
 *
 * The client may choose ONLY the scope, the same-org target id for that scope, and an
 * optional idempotency key. organizationId, actor, lifecycle, readiness, snapshotAt,
 * generatedAt, manifestHash, itemCount and evidence items are ALL server-derived and are
 * rejected by `.strict()`. The DTO never exposes manifestJson (served separately by the
 * manifest route) and carries only safe, closed-vocabulary fields.
 */
import { z } from "zod";
import { EVIDENCE_SCOPE_TYPES, type EvidenceScopeType } from "./evidence-governance";
import type { EvidenceTarget } from "./evidence-pack-db";
import type { DbComplianceEvidencePack } from "./types";

const idStr = z.string().trim().min(1).max(200);

export const createEvidencePackSchema = z.object({
  scopeType:            z.enum(EVIDENCE_SCOPE_TYPES as unknown as [string, ...string[]]),
  incidentId:           idStr.optional(),
  processingActivityId: idStr.optional(),
  privacyRequestId:     idStr.optional(),
  idempotencyKey:       z.string().trim().min(8).max(200).optional(),
}).strict();
export type CreateEvidencePackInput = z.infer<typeof createEvidencePackSchema>;

/**
 * Map a validated input to the exact tenant-safe target for its scope, rejecting a
 * scope/target mismatch (ORGANIZATION carries no target; every other scope carries
 * EXACTLY its one corresponding same-org id). Fail-closed.
 */
export function resolveEvidenceTarget(scopeType: EvidenceScopeType, input: CreateEvidencePackInput):
  | { ok: true; target: EvidenceTarget }
  | { ok: false; reason: string } {
  const i = input.incidentId, pa = input.processingActivityId, pr = input.privacyRequestId;
  switch (scopeType) {
    case "ORGANIZATION":
      if (i || pa || pr) return { ok: false, reason: "ORGANIZATION_SCOPE_TAKES_NO_TARGET" };
      return { ok: true, target: { incidentId: null, processingActivityId: null, privacyRequestId: null } };
    case "INCIDENT":
      if (!i || pa || pr) return { ok: false, reason: "INCIDENT_SCOPE_REQUIRES_INCIDENT_ID" };
      return { ok: true, target: { incidentId: i, processingActivityId: null, privacyRequestId: null } };
    case "PROCESSING_ACTIVITY":
      if (!pa || i || pr) return { ok: false, reason: "PROCESSING_ACTIVITY_SCOPE_REQUIRES_ACTIVITY_ID" };
      return { ok: true, target: { incidentId: null, processingActivityId: pa, privacyRequestId: null } };
    case "PRIVACY_REQUEST":
      if (!pr || i || pa) return { ok: false, reason: "PRIVACY_REQUEST_SCOPE_REQUIRES_REQUEST_ID" };
      return { ok: true, target: { incidentId: null, processingActivityId: null, privacyRequestId: pr } };
    default:
      return { ok: false, reason: "UNKNOWN_SCOPE" };
  }
}

/** Safe list/detail DTO — closed vocab + ids + counts + hash only; never manifestJson. */
export function toEvidencePackDto(row: DbComplianceEvidencePack) {
  return {
    id:            row.id,
    lifecycle:     row.lifecycle,
    readiness:     row.readiness,
    scopeType:     row.scopeType,
    schemaVersion: row.schemaVersion,
    target: {
      incidentId:           row.targetIncidentId,
      processingActivityId: row.targetProcessingActivityId,
      privacyRequestId:     row.targetPrivacyRequestId,
    },
    itemCount:     row.itemCount,
    manifestHash:  row.manifestHash,
    snapshotAt:    row.snapshotAt,
    requestedAt:   row.requestedAt,
    generatedAt:   row.generatedAt,
    revokedAt:     row.revokedAt,
    expiresAt:     row.expiresAt,
    failureCode:   row.failureCode,
    createdAt:     row.createdAt,
    updatedAt:     row.updatedAt,
  };
}
