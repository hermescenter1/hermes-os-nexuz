/**
 * Phase 97 — compliance-incident strict input schemas + safe DTOs.
 *
 * STRICT zod objects reject any unknown key — including organizationId, lifecycle,
 * assessmentStatus, openBlockerCount, sequence, ownerId, assignedToId, every *By/*At
 * attribution, decisionEvidenceHash/decisionVersion and actorId — so client-supplied
 * scope / lifecycle / ownership / attribution can never reach the database
 * (CLIENT_SUPPLIED_INCIDENT_ATTRIBUTION=0). Ownership is assigned ONLY through the
 * explicit membership-bound assignment route; a decision is recorded ONLY through the
 * assessment route with a required evidence hash. Attribution is server-derived.
 *
 * `sensitiveSummary` is the ONLY free-form field: bounded, optional, potentially-
 * sensitive; exposed to an authorised reader in the DTO but NEVER in AuditLog, metric
 * labels or security-event metadata.
 */
import { z } from "zod";
import {
  INCIDENT_TYPES, INCIDENT_SEVERITIES, INCIDENT_SOURCE_CLASSES, ASSESSMENT_STATUSES,
  INCIDENT_ACTION_PRIORITIES, INCIDENT_ACTION_CODES,
} from "./incident-governance";
import type { DbComplianceIncident, DbComplianceIncidentEvent, DbComplianceIncidentAction } from "./types";

const bounded = (max: number) => z.string().trim().min(1).max(max);
const incidentType = z.enum(INCIDENT_TYPES as unknown as [string, ...string[]]);
const severity = z.enum(INCIDENT_SEVERITIES as unknown as [string, ...string[]]);
const sourceClass = z.enum(INCIDENT_SOURCE_CLASSES as unknown as [string, ...string[]]);
const assessmentStatus = z.enum(ASSESSMENT_STATUSES as unknown as [string, ...string[]]);
const actionPriority = z.enum(INCIDENT_ACTION_PRIORITIES as unknown as [string, ...string[]]);
const actionCode = z.enum(INCIDENT_ACTION_CODES as unknown as [string, ...string[]]);
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
}).strict();

/** Governed ownership assignment — only the assignee's user identity. The route
 *  resolves it through the authoritative OrganizationMember table. */
export const assignIncidentSchema = z.object({
  ownerId: bounded(64),
}).strict();

/** Assessment progression / decision recording (target status + evidence). The route
 *  requires evidenceHash when the target is a high-authority decision state. */
export const recordAssessmentSchema = z.object({
  assessmentStatus: assessmentStatus,
  evidenceHash:     evidenceHash.optional(),
}).strict();

/** Create a governed incident action (a blocker). */
export const createActionSchema = z.object({
  priority:   actionPriority,
  actionCode: actionCode,
}).strict();

/** Resolve a governed incident action (evidence required for HIGH/CRITICAL — enforced
 *  in the DB layer against the locked action's priority). */
export const resolveActionSchema = z.object({
  evidenceHash: evidenceHash.optional(),
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
    decisionEvidenceHash: row.decisionEvidenceHash,
    decisionVersion:      row.decisionVersion,
    resolvedAt:           row.resolvedAt,
    closedAt:             row.closedAt,
    reopenedAt:           row.reopenedAt,
    createdAt:            row.createdAt,
    updatedAt:            row.updatedAt,
  };
}

export function toIncidentEventDto(row: DbComplianceIncidentEvent) {
  return {
    id:              row.id,
    sequence:        row.sequence,
    eventCode:       row.eventCode,
    actorId:         row.actorId,
    actorClass:      row.actorClass,
    fromLifecycle:   row.fromLifecycle,
    toLifecycle:     row.toLifecycle,
    fromAssessment:  row.fromAssessment,
    toAssessment:    row.toAssessment,
    evidenceHash:    row.evidenceHash,
    decisionVersion: row.decisionVersion,
    decisionOutcome: row.decisionOutcome,
    actionId:        row.actionId,
    correlationId:   row.correlationId,
    createdAt:       row.createdAt,
  };
}

export function toIncidentActionDto(row: DbComplianceIncidentAction) {
  return {
    id:                     row.id,
    complianceIncidentId:   row.complianceIncidentId,
    priority:               row.priority,
    status:                 row.status,
    actionCode:             row.actionCode,
    createdAt:              row.createdAt,
    resolvedAt:             row.resolvedAt,
    resolutionEvidenceHash: row.resolutionEvidenceHash,
    updatedAt:              row.updatedAt,
  };
}
