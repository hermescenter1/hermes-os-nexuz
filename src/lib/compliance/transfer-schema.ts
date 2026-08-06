/**
 * Phase 97 Part I — strict input schemas + safe DTOs.
 *
 * STRICT zod objects: any unknown key — including organizationId, approvedBy,
 * approvedAt, reviewedBy, reviewedAt, lifecycle or a provider-policy outcome — is
 * REJECTED with a 400, so client-supplied scope/attribution can never reach the
 * database (CLIENT_SUPPLIED_REVIEW_ATTRIBUTION=0 /
 * CLIENT_SUPPLIED_APPROVAL_ATTRIBUTION=0). Attribution is always server-derived.
 * DTOs expose identifiers + closed statuses only — no internal provider
 * configuration, no secrets (none are ever stored).
 */
import { z } from "zod";
import { REVIEW_STATUSES, MECHANISM_STATUSES } from "./transfer-governance";
import type { DbSubprocessor, DbDataTransfer } from "./types";

const bounded = (max: number) => z.string().trim().min(1).max(max);
const strList = z.array(z.string().trim().min(1).max(120)).max(64);
const reviewStatus = z.enum(REVIEW_STATUSES as [string, ...string[]]);
const mechanismStatus = z.enum(MECHANISM_STATUSES as [string, ...string[]]);

// ── Subprocessor ──────────────────────────────────────────────────────────────

// Provider scope is the EXPLICIT closed Phase 95 governance scope (never derived from
// dataCategories/serviceCategory). Bounded string arrays; the exact allow-list is
// enforced against the registry + org Policy at approval time, not here.
const scopeList = z.array(z.string().trim().min(1).max(120)).max(32);

export const createSubprocessorSchema = z.object({
  name:                bounded(200),
  legalEntity:         bounded(200).nullish(),
  providerRegistryId:  bounded(200).nullish(),
  providerDataClasses: scopeList.optional(),
  providerWorkflows:   scopeList.optional(),
  serviceCategory:     bounded(120).optional(),
  operatingCountries:  strList.optional(),
  processingCountries: strList.optional(),
  dataCategories:      strList.optional(),
  subjectCategories:   strList.optional(),
}).strict();

export const updateSubprocessorSchema = z.object({
  name:                bounded(200).optional(),
  legalEntity:         bounded(200).nullish(),
  providerRegistryId:  bounded(200).nullish(),
  providerDataClasses: scopeList.optional(),
  providerWorkflows:   scopeList.optional(),
  serviceCategory:     bounded(120).optional(),
  operatingCountries:  strList.optional(),
  processingCountries: strList.optional(),
  dataCategories:      strList.optional(),
  subjectCategories:   strList.optional(),
  // Review statuses are explicit review ACTIONS (closed vocab); attribution is
  // stamped server-side when any of them changes.
  contractReviewStatus: reviewStatus.optional(),
  privacyReviewStatus:  reviewStatus.optional(),
  securityReviewStatus: reviewStatus.optional(),
  nextReviewAt:         z.coerce.date().nullish(),
}).strict();

export type CreateSubprocessorInput = z.infer<typeof createSubprocessorSchema>;
export type UpdateSubprocessorInput = z.infer<typeof updateSubprocessorSchema>;

// ── DataTransfer ──────────────────────────────────────────────────────────────

export const createDataTransferSchema = z.object({
  subprocessorId:          bounded(64).nullish(),
  processingActivityId:    bounded(64).nullish(),
  sourceJurisdiction:      bounded(120).optional(),
  destinationJurisdiction: bounded(120).optional(),
  transferCategory:        bounded(120).optional(),
}).strict();

export const updateDataTransferSchema = z.object({
  subprocessorId:          bounded(64).nullish(),
  processingActivityId:    bounded(64).nullish(),
  sourceJurisdiction:      bounded(120).optional(),
  destinationJurisdiction: bounded(120).optional(),
  transferCategory:        bounded(120).optional(),
  transferMechanismStatus: mechanismStatus.optional(),
  legalReviewStatus:       reviewStatus.optional(),
  riskReviewStatus:        reviewStatus.optional(),
}).strict();

export type CreateDataTransferInput = z.infer<typeof createDataTransferSchema>;
export type UpdateDataTransferInput = z.infer<typeof updateDataTransferSchema>;

// ── DTOs (identifiers + closed statuses only) ─────────────────────────────────

export function toSubprocessorDto(row: DbSubprocessor) {
  return {
    id:                   row.id,
    organizationId:       row.organizationId,
    name:                 row.name,
    legalEntity:          row.legalEntity,
    providerRegistryId:   row.providerRegistryId,
    providerDataClasses:  row.providerDataClasses,
    providerWorkflows:    row.providerWorkflows,
    approvedProviderPolicyVersion: row.approvedProviderPolicyVersion,
    approvedProviderScopeHash:     row.approvedProviderScopeHash,
    providerPolicyEvaluatedAt:     row.providerPolicyEvaluatedAt,
    serviceCategory:      row.serviceCategory,
    operatingCountries:   row.operatingCountries,
    processingCountries:  row.processingCountries,
    dataCategories:       row.dataCategories,
    subjectCategories:    row.subjectCategories,
    contractReviewStatus: row.contractReviewStatus,
    privacyReviewStatus:  row.privacyReviewStatus,
    securityReviewStatus: row.securityReviewStatus,
    lifecycle:            row.lifecycle,
    reviewedAt:           row.reviewedAt,
    approvedAt:           row.approvedAt,
    nextReviewAt:         row.nextReviewAt,
    createdAt:            row.createdAt,
    updatedAt:            row.updatedAt,
  };
}

export function toDataTransferDto(row: DbDataTransfer) {
  return {
    id:                      row.id,
    organizationId:          row.organizationId,
    subprocessorId:          row.subprocessorId,
    processingActivityId:    row.processingActivityId,
    sourceJurisdiction:      row.sourceJurisdiction,
    destinationJurisdiction: row.destinationJurisdiction,
    transferCategory:        row.transferCategory,
    transferMechanismStatus: row.transferMechanismStatus,
    legalReviewStatus:       row.legalReviewStatus,
    riskReviewStatus:        row.riskReviewStatus,
    lifecycle:               row.lifecycle,
    reviewedAt:              row.reviewedAt,
    approvedAt:              row.approvedAt,
    createdAt:               row.createdAt,
    updatedAt:               row.updatedAt,
  };
}
