/**
 * Phase 97 — Governed Compliance Incident Management (pure, I/O-free).
 *
 * Closed vocabularies + explicit transition maps + fail-closed gates for the tenant
 * compliance-incident register. This module NEVER decides that a reportable breach
 * occurred, invents a legal deadline / jurisdiction / notification duty, or sends
 * anything: every un-assessed value stays quarantined (REVIEW_REQUIRED /
 * LEGAL_REVIEW_REQUIRED / CONFIGURATION_REQUIRED) and an external-notification
 * decision is recorded ONLY as owner/legal-review evidence.
 *
 * The runtime source of truth for cross-plane reconstruction remains the Phase 92
 * observability facilities (security ring, audit log, error fingerprints); an
 * incident REFERENCES that timeline by correlationId, never copying raw entries.
 */

// ── Closed vocabularies ───────────────────────────────────────────────────────

export const INCIDENT_TYPES = [
  "PRIVACY", "SECURITY", "DATA_BREACH_ASSESSMENT", "PROCESSING_NONCONFORMITY",
  "RETENTION_FAILURE", "LEGAL_HOLD_FAILURE", "EXPORT_FAILURE", "ERASURE_FAILURE",
  "PROVIDER_POLICY_FAILURE", "TRANSFER_GOVERNANCE_FAILURE", "LEGAL_DOCUMENT_FAILURE",
  "REVIEW_REQUIRED",
] as const;
export type IncidentType = typeof INCIDENT_TYPES[number];

export const INCIDENT_SEVERITIES = ["REVIEW_REQUIRED", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type IncidentSeverity = typeof INCIDENT_SEVERITIES[number];

export const INCIDENT_LIFECYCLES = [
  "OPEN", "TRIAGED", "INVESTIGATING", "CONTAINED", "REMEDIATING", "MONITORING",
  "RESOLVED", "CLOSED", "CANCELLED",
] as const;
export type IncidentLifecycle = typeof INCIDENT_LIFECYCLES[number];

/** A legal/compliance assessment vocabulary SEPARATE from the operational lifecycle.
 *  No value here is ever auto-derived; a recorded decision is human evidence only. */
export const ASSESSMENT_STATUSES = [
  "REVIEW_REQUIRED", "IN_ASSESSMENT", "INSUFFICIENT_EVIDENCE", "LEGAL_REVIEW_REQUIRED",
  "NO_EXTERNAL_NOTIFICATION_DECISION", "EXTERNAL_NOTIFICATION_REVIEW_REQUIRED", "DECISION_RECORDED",
] as const;
export type AssessmentStatus = typeof ASSESSMENT_STATUSES[number];

export const INCIDENT_SOURCE_CLASSES = ["MANUAL", "OBSERVABILITY", "GOVERNED_WORKFLOW", "EXTERNAL_REPORT", "REVIEW_REQUIRED"] as const;
export type IncidentSourceClass = typeof INCIDENT_SOURCE_CLASSES[number];

export const INCIDENT_EVENT_CODES = [
  "CREATED", "UPDATED", "LIFECYCLE_TRANSITIONED", "ASSESSMENT_TRANSITIONED", "DECISION_RECORDED",
  "OWNERSHIP_ASSIGNED", "BLOCKER_RAISED", "BLOCKER_CLEARED", "EVIDENCE_ATTACHED", "REOPENED",
  "ACTION_CREATED", "ACTION_RESOLVED", "ACTION_CANCELLED",
] as const;
export type IncidentEventCode = typeof INCIDENT_EVENT_CODES[number];

/** Closed actor classification for a timeline event — an org member or the platform.
 *  Server-derived; never client-controlled. */
export const INCIDENT_ACTOR_CLASSES = ["PLATFORM", "ORGANIZATION_MEMBER"] as const;
export type IncidentActorClass = typeof INCIDENT_ACTOR_CLASSES[number];

/** Closed outcome recorded on a decision-bearing timeline event. */
export const DECISION_OUTCOMES = ["RECORDED", "INVALIDATED"] as const;
export type DecisionOutcome = typeof DECISION_OUTCOMES[number];

// ── Governed incident actions (authoritative blockers) ────────────────────────

export const INCIDENT_ACTION_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type IncidentActionPriority = typeof INCIDENT_ACTION_PRIORITIES[number];

export const INCIDENT_ACTION_STATUSES = ["OPEN", "RESOLVED", "CANCELLED"] as const;
export type IncidentActionStatus = typeof INCIDENT_ACTION_STATUSES[number];

export const INCIDENT_ACTION_CODES = [
  "ASSESSMENT_EVIDENCE_REQUIRED", "LEGAL_REVIEW_REQUIRED", "CONTAINMENT_REQUIRED", "REMEDIATION_REQUIRED",
  "DATA_PRESERVATION_REQUIRED", "POLICY_REVIEW_REQUIRED", "FOLLOW_UP_REQUIRED", "OTHER_REVIEW_REQUIRED",
] as const;
export type IncidentActionCode = typeof INCIDENT_ACTION_CODES[number];

/** Priorities that must ALWAYS block closure while OPEN (the default gate blocks ANY
 *  open action; these are the floor). */
export const HIGH_PRIORITY_ACTIONS: IncidentActionPriority[] = ["HIGH", "CRITICAL"];

export function isIncidentType(v: unknown): v is IncidentType { return typeof v === "string" && (INCIDENT_TYPES as readonly string[]).includes(v); }
export function isIncidentSeverity(v: unknown): v is IncidentSeverity { return typeof v === "string" && (INCIDENT_SEVERITIES as readonly string[]).includes(v); }
export function isIncidentLifecycle(v: unknown): v is IncidentLifecycle { return typeof v === "string" && (INCIDENT_LIFECYCLES as readonly string[]).includes(v); }
export function isAssessmentStatus(v: unknown): v is AssessmentStatus { return typeof v === "string" && (ASSESSMENT_STATUSES as readonly string[]).includes(v); }
export function isIncidentSourceClass(v: unknown): v is IncidentSourceClass { return typeof v === "string" && (INCIDENT_SOURCE_CLASSES as readonly string[]).includes(v); }
export function isIncidentActorClass(v: unknown): v is IncidentActorClass { return typeof v === "string" && (INCIDENT_ACTOR_CLASSES as readonly string[]).includes(v); }
export function isIncidentActionPriority(v: unknown): v is IncidentActionPriority { return typeof v === "string" && (INCIDENT_ACTION_PRIORITIES as readonly string[]).includes(v); }
export function isIncidentActionStatus(v: unknown): v is IncidentActionStatus { return typeof v === "string" && (INCIDENT_ACTION_STATUSES as readonly string[]).includes(v); }
export function isIncidentActionCode(v: unknown): v is IncidentActionCode { return typeof v === "string" && (INCIDENT_ACTION_CODES as readonly string[]).includes(v); }

/** A currently-valid recorded decision requires a lowercase SHA-256 evidence hash AND
 *  a positive monotonic version — never just the assessmentStatus string. */
export const SHA256_HEX = /^[a-f0-9]{64}$/;
export function isValidDecisionEvidence(evidenceHash: string | null | undefined, decisionVersion: number): boolean {
  return typeof evidenceHash === "string" && SHA256_HEX.test(evidenceHash) && Number.isInteger(decisionVersion) && decisionVersion > 0;
}
/** decisionVersion is monotonic and never decreases; the next valid decision receives
 *  the last issued version + 1. Invalidation preserves the version as lineage. */
export function nextDecisionVersion(currentVersion: number): number {
  return (Number.isInteger(currentVersion) && currentVersion > 0 ? currentVersion : 0) + 1;
}

// ── Closed lifecycle transition map + action classification ───────────────────

export const INCIDENT_TRANSITIONS: Record<IncidentLifecycle, IncidentLifecycle[]> = {
  OPEN:          ["TRIAGED", "CANCELLED"],
  TRIAGED:       ["INVESTIGATING", "CANCELLED"],
  INVESTIGATING: ["CONTAINED", "REMEDIATING", "MONITORING", "RESOLVED", "CANCELLED"],
  CONTAINED:     ["REMEDIATING", "MONITORING", "INVESTIGATING", "RESOLVED"],
  REMEDIATING:   ["MONITORING", "CONTAINED", "INVESTIGATING", "RESOLVED"],
  MONITORING:    ["RESOLVED", "INVESTIGATING", "REMEDIATING"],
  RESOLVED:      ["CLOSED", "INVESTIGATING"], // →INVESTIGATING = un-resolve (reopen before close)
  CLOSED:        ["INVESTIGATING"],           // explicit reopen workflow
  CANCELLED:     [],                          // terminal
};

/** manage = triage/investigate/contain workflow; resolve = →RESOLVED (gated by the
 *  closure blockers); close = →CLOSED; reopen = leaving RESOLVED/CLOSED to INVESTIGATING. */
export type IncidentAction = "manage" | "resolve" | "close" | "reopen";

export function canTransitionIncident(from: string, to: string): boolean {
  if (from === to) return false;
  const allowed = INCIDENT_TRANSITIONS[from as IncidentLifecycle];
  return Array.isArray(allowed) && (allowed as string[]).includes(to);
}

export function incidentTransitionAction(from: string, to: string): IncidentAction | null {
  if (!canTransitionIncident(from, to)) return null;
  if (to === "CLOSED") return "close";
  if (to === "INVESTIGATING" && (from === "RESOLVED" || from === "CLOSED")) return "reopen";
  if (to === "RESOLVED") return "resolve";
  return "manage";
}

/** A material update is permitted only in an ACTIVE working state — RESOLVED/CLOSED
 *  evidence is frozen (mutable only via the explicit reopen), CANCELLED is terminal. */
export const EDITABLE_INCIDENT_LIFECYCLES: IncidentLifecycle[] = ["OPEN", "TRIAGED", "INVESTIGATING", "CONTAINED", "REMEDIATING", "MONITORING"];
export function isEditableIncidentLifecycle(v: string): boolean { return (EDITABLE_INCIDENT_LIFECYCLES as string[]).includes(v); }

// ── Assessment transition map + action classification ─────────────────────────

export const ASSESSMENT_TRANSITIONS: Record<AssessmentStatus, AssessmentStatus[]> = {
  REVIEW_REQUIRED:                       ["IN_ASSESSMENT", "LEGAL_REVIEW_REQUIRED", "INSUFFICIENT_EVIDENCE"],
  IN_ASSESSMENT:                         ["INSUFFICIENT_EVIDENCE", "LEGAL_REVIEW_REQUIRED", "NO_EXTERNAL_NOTIFICATION_DECISION", "EXTERNAL_NOTIFICATION_REVIEW_REQUIRED", "DECISION_RECORDED"],
  INSUFFICIENT_EVIDENCE:                 ["IN_ASSESSMENT", "LEGAL_REVIEW_REQUIRED"],
  LEGAL_REVIEW_REQUIRED:                 ["IN_ASSESSMENT", "INSUFFICIENT_EVIDENCE", "NO_EXTERNAL_NOTIFICATION_DECISION", "EXTERNAL_NOTIFICATION_REVIEW_REQUIRED", "DECISION_RECORDED"],
  EXTERNAL_NOTIFICATION_REVIEW_REQUIRED: ["DECISION_RECORDED", "NO_EXTERNAL_NOTIFICATION_DECISION", "LEGAL_REVIEW_REQUIRED"],
  NO_EXTERNAL_NOTIFICATION_DECISION:     ["DECISION_RECORDED", "EXTERNAL_NOTIFICATION_REVIEW_REQUIRED"],
  DECISION_RECORDED:                     ["IN_ASSESSMENT"], // re-assessment only
};

/** Entering these assessment states is a HIGH-AUTHORITY decision (owner/legal). */
export const ASSESSMENT_DECISION_STATES: AssessmentStatus[] = ["NO_EXTERNAL_NOTIFICATION_DECISION", "EXTERNAL_NOTIFICATION_REVIEW_REQUIRED", "DECISION_RECORDED"];
export function isAssessmentDecisionState(v: string): boolean { return (ASSESSMENT_DECISION_STATES as string[]).includes(v); }

export type AssessmentAction = "assess" | "decide";
export function canTransitionAssessment(from: string, to: string): boolean {
  if (from === to) return false;
  const allowed = ASSESSMENT_TRANSITIONS[from as AssessmentStatus];
  return Array.isArray(allowed) && (allowed as string[]).includes(to);
}
export function assessmentTransitionAction(from: string, to: string): AssessmentAction | null {
  if (!canTransitionAssessment(from, to)) return null;
  return isAssessmentDecisionState(to) ? "decide" : "assess";
}

// ── Closure gate (fail-closed) ────────────────────────────────────────────────

export interface IncidentBlocker { field: string; reason: string }

/** The assessment must have reached a RECORDED decision (either a recorded decision
 *  or an explicit no-external-notification decision) before an incident may resolve
 *  or close. Every other assessment state fails closed with a specific reason. */
export function assessmentClosureBlocker(assessmentStatus: string): string | null {
  if (assessmentStatus === "DECISION_RECORDED" || assessmentStatus === "NO_EXTERNAL_NOTIFICATION_DECISION") return null;
  if (assessmentStatus === "REVIEW_REQUIRED") return "ASSESSMENT_REQUIRED";
  if (assessmentStatus === "LEGAL_REVIEW_REQUIRED") return "LEGAL_REVIEW_REQUIRED";
  if (assessmentStatus === "INSUFFICIENT_EVIDENCE") return "EVIDENCE_INSUFFICIENT";
  return "ASSESSMENT_IN_PROGRESS"; // IN_ASSESSMENT / EXTERNAL_NOTIFICATION_REVIEW_REQUIRED / unknown
}

/**
 * RESOLVED and CLOSED are blocked while: the mandatory assessment is not decided OR
 * its CURRENT decision evidence is not valid (a hash + version, never merely the
 * status string); the owner is missing or the owner's membership is not currently
 * ACTIVE; any authoritative OPEN IncidentAction exists (an anonymous cached count is
 * never trusted — the caller supplies the authoritative OPEN count read under the
 * incident lock); or an active LegalHold requires continued preservation. Every input
 * is read on the LOCKED row / under the incident lock by the DB layer.
 */
export function incidentClosureBlockers(input: {
  assessmentStatus: string;
  decisionEvidenceHash: string | null;
  decisionVersion: number;
  ownerId: string | null;
  ownerMembershipActive: boolean;
  openActionCount: number;      // authoritative COUNT of OPEN ComplianceIncidentAction rows
  activeLegalHold: boolean;
}): IncidentBlocker[] {
  const blockers: IncidentBlocker[] = [];
  const a = assessmentClosureBlocker(input.assessmentStatus);
  if (a) blockers.push({ field: "assessmentStatus", reason: a });
  // Even in a "decided" assessment state, closure requires CURRENT valid evidence.
  else if (!isValidDecisionEvidence(input.decisionEvidenceHash, input.decisionVersion)) {
    blockers.push({ field: "decisionEvidence", reason: "DECISION_EVIDENCE_REQUIRED" });
  }
  if (!input.ownerId) blockers.push({ field: "ownership", reason: "OWNERSHIP_REQUIRED" });
  else if (!input.ownerMembershipActive) blockers.push({ field: "ownership", reason: "OWNER_MEMBERSHIP_INACTIVE" });
  if (input.openActionCount > 0) blockers.push({ field: "openActions", reason: "UNRESOLVED_ACTIONS" });
  if (input.activeLegalHold) blockers.push({ field: "legalHold", reason: "ACTIVE_LEGAL_HOLD" });
  return blockers;
}

export function canResolveOrCloseIncident(input: Parameters<typeof incidentClosureBlockers>[0]): { ok: boolean; blockers: IncidentBlocker[] } {
  const blockers = incidentClosureBlockers(input);
  return { ok: blockers.length === 0, blockers };
}

/** The timeline event code for a lifecycle transition (closed vocabulary). */
export function lifecycleEventCode(action: IncidentAction): IncidentEventCode {
  return action === "reopen" ? "REOPENED" : "LIFECYCLE_TRANSITIONED";
}
