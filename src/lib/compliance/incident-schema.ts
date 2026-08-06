/**
 * Phase 97 — compliance-incident strict input schemas + safe DTOs.
 *
 * STRICT zod objects: any unknown key — including organizationId, lifecycle,
 * assessmentStatus, openBlockerCount, sequence or any *By/*At attribution — is
 * REJECTED with a 400, so client-supplied scope / lifecycle / attribution can never
 * reach the database (CLIENT_SUPPLIED_INCIDENT_ATTRIBUTION=0). Attribution is always
 * server-derived. incidentType / severity / sourceClass are CLASSIFICATIONS the
 * caller may propose (closed vocab), never attribution.
 *
 * `sensitiveSummary` is the ONLY free-form field: bounded, optional and explicitly
 * classified potentially-sensitive. It is exposed to an authorised reader in the DTO
 * but is NEVER placed in AuditLog, metric labels or security-event metadata.
 */
import { z } from "zod";
import { INCIDENT_TYPES, INCIDENT_SEVERITIES, INCIDENT_SOURCE_CLASSES, ASSESSMENT_STATUSES } from "./incident-governance";
import type { DbComplianceIncident, DbComplianceIncidentEvent } from "./types";

const bounded = (max: number) => z.string().trim().min(1).max(max);
const incidentType = z.enum(INCIDENT_TYPES as unknown as [string, ...string[]]);
const severity = z.enum(INCIDENT_SEVERITIES as unknown as [string, ...string[]]);
const sourceClass = z.enum(INCIDENT_SOURCE_CLASSES as unknown as [string, ...string[]]);
const assessmentStatus = z.enum(ASSESSMENT_STATUSES as unknown as [string, ...string[]]);
// Correlation id references the observability timeline; same safe shape as the logger.
const correlationId = z.string().trim().regex(/^[A-Za-z0-9_-]{8,128}$/);
const evidenceHash = z.string().trim().regex(/^[a-f0-9]{64}$/);
const summaryText = z.string().trim().min(1).max(2000); // bounded, potentially-sensitive

export const createIncidentSchema = z.object({
  incidentType:         incidentType.optional(),
  severity:             severity.optional(),
  sourceClass:          sourceClass.optional(),
  correlationId:        correlationId.nullish(),
  occurredAt:           z.coerce.date().nullish(),
  summaryCode:          bounded(120).nullish(),
  sensitiveSummary:     summaryText.nullish(),
  idempotencyKey:       bounded(200).optional(),
  processingActivityId: bounded(64).nullish(),
  subprocessorId:       bounded(64).nullish(),
  dataTransferId:       bounded(64).nullish(),
  ownerId:              bounded(64).nullish(),
  assignedToId:         bounded(64).nullish(),
}).strict();

export const updateIncidentSchema = z.object({
  incidentType:         incidentType.optional(),
  severity:             severity.optional(),
  sourceClass:          sourceClass.optional(),
  correlationId:        correlationId.nullish(),
  occurredAt:           z.coerce.date().nullish(),
  summaryCode:          bounded(120).nullish(),
  sensitiveSummary:     summaryText.nullish(),
  processingActivityId: bounded(64).nullish(),
  subprocessorId:       bounded(64).nullish(),
  dataTransferId:       bounded(64).nullish(),
  ownerId:              bounded(64).nullish(),
  assignedToId:         bounded(64).nullish(),
}).strict();

/** Assessment progression / decision recording (target status + optional evidence). */
export const recordAssessmentSchema = z.object({
  assessmentStatus: assessmentStatus,
  evidenceHash:     evidenceHash.optional(),
}).strict();

/** Adjust the unresolved-blocker count (never client-set directly). */
export const blockerActionSchema = z.object({
  action: z.enum(["RAISE", "CLEAR"]),
}).strict();

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;

// ── DTOs (identifiers + closed statuses + counts; the sensitive summary is only
//        returned to an authorised reader, never emitted to audit/metrics/logs) ──

export function toIncidentDto(row: DbComplianceIncident) {
  return {
    id:                   row.id,
    organizationId:       row.organizationId,
    incidentType:         row.incidentType,
    severity:             row.severity,
    lifecycle:            row.lifecycle,
    assessmentStatus:     row.assessmentStatus,
    sourceClass:          row.sourceClass,
    correlationId:        row.correlationId,
    detectedAt:           row.detectedAt,
    occurredAt:           row.occurredAt,
    summaryCode:          row.summaryCode,
    sensitiveSummary:     row.sensitiveSummary,
    processingActivityId: row.processingActivityId,
    subprocessorId:       row.subprocessorId,
    dataTransferId:       row.dataTransferId,
    openBlockerCount:     row.openBlockerCount,
    ownerId:              row.ownerId,
    assignedToId:         row.assignedToId,
    reviewedAt:           row.reviewedAt,
    decisionAt:           row.decisionAt,
    resolvedAt:           row.resolvedAt,
    closedAt:             row.closedAt,
    reopenedAt:           row.reopenedAt,
    createdAt:            row.createdAt,
    updatedAt:            row.updatedAt,
  };
}

export function toIncidentEventDto(row: DbComplianceIncidentEvent) {
  return {
    id:             row.id,
    sequence:       row.sequence,
    eventCode:      row.eventCode,
    fromLifecycle:  row.fromLifecycle,
    toLifecycle:    row.toLifecycle,
    fromAssessment: row.fromAssessment,
    toAssessment:   row.toAssessment,
    actorId:        row.actorId,
    evidenceHash:   row.evidenceHash,
    correlationId:  row.correlationId,
    createdAt:      row.createdAt,
  };
}
