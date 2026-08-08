/**
 * Phase 97 — Retention & Legal-hold input validation and projection.
 *
 * Zod schemas (organizationId / id / audit fields are DELIBERATELY absent — the
 * org is server-derived and Zod strict() rejects any client-supplied scope) plus
 * fail-closed create-payload builders and DTO projections.
 */

import { z } from "zod";
import {
  RETENTION_ACTIONS,
  RETENTION_TRIGGERS,
  RETENTION_APPROVAL_STATES,
  LEGAL_HOLD_SCOPE_TYPES,
  LEGAL_HOLD_STATUSES,
  classifyRetentionPolicy,
  type RetentionPolicyLike,
} from "./retention-engine";
import type { NormalizedLegalHoldScope } from "./legal-hold";
import type { DbRetentionPolicy, DbLegalHold } from "./types";

const enumOf = (vals: readonly string[]) => z.enum(vals as [string, ...string[]]);

// ── Retention policy ──────────────────────────────────────────────────────────

const retentionBase = {
  name:             z.string().trim().min(1).max(200),
  description:      z.string().trim().max(2000).optional(),
  dataClass:        z.string().trim().min(1).max(200),
  targetResource:   z.string().trim().min(1).max(200),
  retentionTrigger: enumOf(RETENTION_TRIGGERS).optional(),
  retentionDays:    z.number().int().positive().max(100000).optional(),
  action:           enumOf(RETENTION_ACTIONS).optional(),
  reviewOwner:      z.string().trim().max(200).optional(),
  approvalState:    enumOf(RETENTION_APPROVAL_STATES).optional(),
  // legalHoldAware is DELIBERATELY not client-settable — no policy flag may
  // disable active legal-hold protection (LEGAL_HOLD_POLICY_BYPASS=0). It is
  // forced true server-side. A client body carrying it is rejected by strict().
  dryRunOnly:       z.boolean().optional(),
  enabled:          z.boolean().optional(),
};

export const createRetentionPolicySchema = z.object(retentionBase).strict();
export const updateRetentionPolicySchema = z.object(retentionBase).strict().partial();
export type CreateRetentionPolicyInput = z.infer<typeof createRetentionPolicySchema>;
export type UpdateRetentionPolicyInput = z.infer<typeof updateRetentionPolicySchema>;

export function toRetentionCreateData(input: CreateRetentionPolicyInput): Record<string, unknown> {
  return {
    name:             input.name,
    description:      input.description ?? null,
    dataClass:        input.dataClass,
    targetResource:   input.targetResource,
    retentionTrigger: input.retentionTrigger ?? "REVIEW_REQUIRED",
    retentionDays:    input.retentionDays ?? null,          // null = CONFIGURATION_REQUIRED
    action:           input.action ?? "REVIEW_REQUIRED",     // fail-closed: no automated action
    reviewOwner:      input.reviewOwner ?? null,
    approvalState:    input.approvalState ?? "PENDING_REVIEW",
    legalHoldAware:   true, // forced true server-side — never a bypass
    dryRunOnly:       input.dryRunOnly ?? true,             // dry-run by default
    enabled:          input.enabled ?? false,               // disabled by default
  };
}

export function toRetentionUpdateData(input: UpdateRetentionPolicyInput): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) data[k] = k === "description" || k === "reviewOwner" ? (v ?? null) : v;
  }
  return data;
}

export function toRetentionPolicyDto(row: DbRetentionPolicy) {
  const cfg = classifyRetentionPolicy(row as unknown as RetentionPolicyLike);
  return {
    id:               row.id,
    name:             row.name,
    description:      row.description,
    dataClass:        row.dataClass,
    targetResource:   row.targetResource,
    retentionTrigger: row.retentionTrigger,
    retentionDays:    row.retentionDays,
    action:           row.action,
    reviewOwner:      row.reviewOwner,
    approvalState:    row.approvalState,
    legalHoldAware:   row.legalHoldAware,
    dryRunOnly:       row.dryRunOnly,
    enabled:          row.enabled,
    createdAt:        row.createdAt,
    updatedAt:        row.updatedAt,
    configStatus:     cfg.status,
    configGaps:       cfg.reasons,
  };
}

// ── Legal hold ────────────────────────────────────────────────────────────────

const holdBase = {
  name:                 z.string().trim().min(1).max(200),
  reasonClass:          z.string().trim().max(200).optional(),
  scopeType:            enumOf(LEGAL_HOLD_SCOPE_TYPES),
  subjectId:            z.string().trim().max(200).optional(),
  resourceType:         z.string().trim().max(200).optional(),
  resourceId:           z.string().trim().max(200).optional(),
  processingActivityId: z.string().trim().max(200).optional(),
  incidentId:           z.string().trim().max(200).optional(),
  rangeStart:           z.string().datetime().optional(),
  rangeEnd:             z.string().datetime().optional(),
  startDate:            z.string().datetime().optional(),
  reviewDate:           z.string().datetime().optional(),
};

export const createLegalHoldSchema = z.object(holdBase).strict();
// status is settable on update (transition handled server-side), never on create.
export const updateLegalHoldSchema = z.object({ ...holdBase, status: enumOf(LEGAL_HOLD_STATUSES) }).strict().partial();
export type CreateLegalHoldInput = z.infer<typeof createLegalHoldSchema>;
export type UpdateLegalHoldInput = z.infer<typeof updateLegalHoldSchema>;

const dateOrNull = (s?: string) => (s ? new Date(s) : null);

/**
 * Build the CREATE payload from validated input PLUS a pre-validated normalized
 * scope (see validateLegalHoldScope). The scope fields come only from the
 * normalized object, so a contradictory field can never be persisted. A new hold
 * is always PROPOSED — never ACTIVE on creation.
 */
export function toLegalHoldCreateData(
  input: CreateLegalHoldInput,
  normalized: NormalizedLegalHoldScope,
): Record<string, unknown> {
  return {
    name:                 input.name,
    reasonClass:          input.reasonClass ?? "REVIEW_REQUIRED",
    scopeType:            normalized.scopeType,
    subjectId:            normalized.subjectId,
    resourceType:         normalized.resourceType,
    resourceId:           normalized.resourceId,
    processingActivityId: normalized.processingActivityId,
    incidentId:           normalized.incidentId,
    rangeStart:           normalized.rangeStart,
    rangeEnd:             normalized.rangeEnd,
    startDate:            dateOrNull(input.startDate),
    reviewDate:           dateOrNull(input.reviewDate),
    status:               "PROPOSED",
  };
}

export function toLegalHoldDto(row: DbLegalHold) {
  return {
    id:                   row.id,
    name:                 row.name,
    reasonClass:          row.reasonClass,
    scopeType:            row.scopeType,
    subjectId:            row.subjectId,
    resourceType:         row.resourceType,
    resourceId:           row.resourceId,
    processingActivityId: row.processingActivityId,
    incidentId:           row.incidentId,
    rangeStart:           row.rangeStart,
    rangeEnd:             row.rangeEnd,
    status:               row.status,
    approvedAt:           row.approvedAt,
    startDate:            row.startDate,
    reviewDate:           row.reviewDate,
    releasedAt:           row.releasedAt,
    cancelledAt:          row.cancelledAt,
    createdAt:            row.createdAt,
    updatedAt:            row.updatedAt,
  };
}
