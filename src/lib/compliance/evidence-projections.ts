/**
 * Phase 97 — SAFE evidence projections (pure, I/O-free).
 *
 * Each builder maps ONE governed record (already read with a SAFE column selection) to a
 * SafeEvidenceItem carrying only identifiers, versions, timestamps, counts, booleans,
 * closed classifications and cryptographic hashes. A builder NEVER receives or emits raw
 * personal data, free text, bodies, contracts, secrets, provider configuration or an
 * incident's sensitiveSummary — those columns are not selected upstream and are not
 * referenced here. Inputs are coerced defensively (fail-closed): a malformed value never
 * throws and never leaks. `evidenceStatus` is a fail-closed per-item readiness
 * classification; the pack readiness is the fold of these (see foldReadiness).
 */
import type { EvidenceReadiness } from "./evidence-governance";

export interface SafeEvidenceItem {
  entityType:     string;
  entityId:       string | null;
  evidenceCode:   string;
  evidenceStatus: EvidenceReadiness;
  sourceVersion:  string | null;
  sourceUpdatedAt: Date | null;
  safeMetadata:   Record<string, unknown>;
}

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const dt = (v: unknown): Date | null => (v instanceof Date ? v : null);
const bl = (v: unknown): boolean => v === true;
const has = (v: unknown): boolean => v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "");
const id = (r: Row): string => (typeof r.id === "string" ? r.id : "");

// ── ProcessingActivity ────────────────────────────────────────────────────────
export function projectProcessingActivity(r: Row): SafeEvidenceItem {
  const legalBasisStatus = s(r.legalBasisStatus), approvalState = s(r.approvalState);
  const status: EvidenceReadiness =
    legalBasisStatus === "CONFIGURATION_REQUIRED" ? "CONFIGURATION_REQUIRED"
    : legalBasisStatus === "LEGAL_REVIEW_REQUIRED" ? "REVIEW_REQUIRED"
    : approvalState === "APPROVED" ? "COMPLETE"
    : approvalState === "PENDING_REVIEW" || approvalState === "REJECTED" ? "REVIEW_REQUIRED"
    : "CONFIGURATION_REQUIRED";
  return {
    entityType: "PROCESSING_ACTIVITY", entityId: id(r), evidenceCode: "PROCESSING_ACTIVITY_RECORD",
    evidenceStatus: status, sourceVersion: null, sourceUpdatedAt: dt(r.updatedAt),
    safeMetadata: {
      legalBasisStatus, approvalState, status: s(r.status), riskClassification: s(r.riskClassification),
      specialCategory: bl(r.specialCategory), automatedDecision: bl(r.automatedDecision),
      internationalTransfer: bl(r.internationalTransfer), isActive: bl(r.isActive), hasReviewDate: has(r.reviewDate),
    },
  };
}

// ── RetentionPolicy ───────────────────────────────────────────────────────────
export function projectRetentionPolicy(r: Row): SafeEvidenceItem {
  const approvalState = s(r.approvalState);
  const status: EvidenceReadiness =
    !has(r.retentionDays) ? "CONFIGURATION_REQUIRED"
    : approvalState === "APPROVED" ? "COMPLETE"
    : approvalState === "PENDING_REVIEW" ? "REVIEW_REQUIRED"
    : "CONFIGURATION_REQUIRED";
  return {
    entityType: "RETENTION_POLICY", entityId: id(r), evidenceCode: "RETENTION_POLICY_RECORD",
    evidenceStatus: status, sourceVersion: null, sourceUpdatedAt: dt(r.updatedAt),
    safeMetadata: {
      dataClass: s(r.dataClass), targetResource: s(r.targetResource), retentionTrigger: s(r.retentionTrigger),
      hasRetentionDays: has(r.retentionDays), action: s(r.action), approvalState,
      legalHoldAware: bl(r.legalHoldAware), dryRunOnly: r.dryRunOnly !== false, enabled: bl(r.enabled),
    },
  };
}

// ── LegalHold ─────────────────────────────────────────────────────────────────
export function projectLegalHold(r: Row): SafeEvidenceItem {
  const status = s(r.status);
  const st: EvidenceReadiness =
    status === "ACTIVE" || status === "RELEASED" || status === "CANCELLED" ? "COMPLETE"
    : status === "PROPOSED" ? "REVIEW_REQUIRED"
    : "CONFIGURATION_REQUIRED";
  return {
    entityType: "LEGAL_HOLD", entityId: id(r), evidenceCode: "LEGAL_HOLD_RECORD",
    evidenceStatus: st, sourceVersion: null, sourceUpdatedAt: dt(r.updatedAt),
    safeMetadata: { reasonClass: s(r.reasonClass), scopeType: s(r.scopeType), status, hasApproval: bl(r.hasApproval) },
  };
}

// ── Subprocessor ──────────────────────────────────────────────────────────────
export function projectSubprocessor(r: Row): SafeEvidenceItem {
  const lifecycle = s(r.lifecycle);
  const reviewsApproved = s(r.contractReviewStatus) === "APPROVED" && s(r.privacyReviewStatus) === "APPROVED" && s(r.securityReviewStatus) === "APPROVED";
  const st: EvidenceReadiness =
    (lifecycle === "APPROVED" || lifecycle === "ACTIVE") && reviewsApproved ? "COMPLETE"
    : lifecycle === "REVIEW_REQUIRED" || lifecycle === "UNDER_REVIEW" || lifecycle === "DRAFT" ? "REVIEW_REQUIRED"
    : lifecycle === "SUSPENDED" || lifecycle === "RETIRED" ? "COMPLETE"
    : "CONFIGURATION_REQUIRED";
  return {
    entityType: "SUBPROCESSOR", entityId: id(r), evidenceCode: "SUBPROCESSOR_RECORD",
    evidenceStatus: st, sourceVersion: s(r.approvedProviderPolicyVersion), sourceUpdatedAt: dt(r.updatedAt),
    safeMetadata: {
      serviceCategory: s(r.serviceCategory), lifecycle, contractReviewStatus: s(r.contractReviewStatus),
      privacyReviewStatus: s(r.privacyReviewStatus), securityReviewStatus: s(r.securityReviewStatus),
      hasApprovedScopeBinding: has(r.approvedProviderScopeHash),
    },
  };
}

// ── DataTransfer ──────────────────────────────────────────────────────────────
export function projectDataTransfer(r: Row): SafeEvidenceItem {
  const mech = s(r.transferMechanismStatus), lifecycle = s(r.lifecycle);
  const st: EvidenceReadiness =
    mech === "CONFIGURATION_REQUIRED" ? "CONFIGURATION_REQUIRED"
    : mech === "LEGAL_REVIEW_REQUIRED" || s(r.legalReviewStatus) === "LEGAL_REVIEW_REQUIRED" ? "REVIEW_REQUIRED"
    : mech === "CONFIGURED" && (lifecycle === "APPROVED" || lifecycle === "ACTIVE") ? "COMPLETE"
    : lifecycle === "DRAFT" || lifecycle === "UNDER_REVIEW" || lifecycle === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED"
    : "CONFIGURATION_REQUIRED";
  return {
    entityType: "DATA_TRANSFER", entityId: id(r), evidenceCode: "DATA_TRANSFER_RECORD",
    evidenceStatus: st, sourceVersion: null, sourceUpdatedAt: dt(r.updatedAt),
    safeMetadata: {
      sourceJurisdiction: s(r.sourceJurisdiction), destinationJurisdiction: s(r.destinationJurisdiction),
      transferCategory: s(r.transferCategory), transferMechanismStatus: mech, legalReviewStatus: s(r.legalReviewStatus),
      riskReviewStatus: s(r.riskReviewStatus), lifecycle, hasSubprocessorBinding: bl(r.hasSubprocessor),
    },
  };
}

// ── LegalDocument (type/version/lifecycle/contentHash — NEVER the body) ────────
export function projectLegalDocument(r: Row): SafeEvidenceItem {
  const lifecycle = s(r.lifecycle);
  const st: EvidenceReadiness =
    lifecycle === "PUBLISHED" || lifecycle === "SUPERSEDED" || lifecycle === "WITHDRAWN" || lifecycle === "ARCHIVED" ? "COMPLETE"
    : lifecycle === "DRAFT" || lifecycle === "IN_REVIEW" || lifecycle === "APPROVED" || lifecycle === "SCHEDULED" ? "REVIEW_REQUIRED"
    : "CONFIGURATION_REQUIRED";
  return {
    entityType: "LEGAL_DOCUMENT", entityId: id(r), evidenceCode: "LEGAL_DOCUMENT_VERSION",
    evidenceStatus: st, sourceVersion: s(r.version), sourceUpdatedAt: dt(r.updatedAt),
    safeMetadata: {
      documentType: s(r.documentType), locale: s(r.locale), isPublished: bl(r.isPublished), lifecycle,
      hasEffectiveDate: bl(r.hasEffectiveDate), hasPublishedAt: bl(r.hasPublishedAt),
    },
  };
}

// ── ComplianceIncident (summaryCode ONLY — never sensitiveSummary) ────────────
export function projectComplianceIncident(r: Row): SafeEvidenceItem {
  const lifecycle = s(r.lifecycle);
  const st: EvidenceReadiness =
    lifecycle === "CLOSED" || lifecycle === "RESOLVED" ? "COMPLETE"
    : has(r.decisionEvidenceHash) ? "REVIEW_REQUIRED"
    : "INSUFFICIENT_EVIDENCE";
  return {
    entityType: "COMPLIANCE_INCIDENT", entityId: id(r), evidenceCode: "COMPLIANCE_INCIDENT_RECORD",
    evidenceStatus: st, sourceVersion: has(r.decisionVersion) ? String(n(r.decisionVersion)) : null, sourceUpdatedAt: dt(r.updatedAt),
    safeMetadata: {
      incidentType: s(r.incidentType), severity: s(r.severity), lifecycle, assessmentStatus: s(r.assessmentStatus),
      sourceClass: s(r.sourceClass), summaryCode: s(r.summaryCode), decisionVersion: n(r.decisionVersion),
      hasDecisionEvidence: has(r.decisionEvidenceHash), decisionEvidenceHash: s(r.decisionEvidenceHash),
      openBlockerCount: n(r.openBlockerCount), hasOwner: bl(r.hasOwner),
    },
  };
}

// ── Provider policy (Phase 95 — enabled/version/scope counts; no secrets) ─────
export function projectProviderPolicy(r: Row): SafeEvidenceItem {
  const st: EvidenceReadiness =
    bl(r.enabled) && !bl(r.isExpired) && bl(r.hasApproval) ? "COMPLETE"
    : bl(r.enabled) ? "REVIEW_REQUIRED"
    : "CONFIGURATION_REQUIRED";
  return {
    entityType: "PROVIDER_POLICY", entityId: id(r), evidenceCode: "PROVIDER_GOVERNANCE_STATUS",
    evidenceStatus: st, sourceVersion: s(r.policyVersion), sourceUpdatedAt: dt(r.updatedAt),
    safeMetadata: {
      providerRegistryId: s(r.providerRegistryId), enabled: bl(r.enabled), isExpired: bl(r.isExpired),
      allowedDataClassCount: n(r.allowedDataClassCount), allowedWorkflowCount: n(r.allowedWorkflowCount), hasApproval: bl(r.hasApproval),
    },
  };
}

// ── Entitlement / billing governance (Phase 96) ───────────────────────────────
export function projectEntitlementOverride(r: Row): SafeEvidenceItem {
  const st: EvidenceReadiness = bl(r.isRevoked) || bl(r.isExpired) ? "COMPLETE" : "REVIEW_REQUIRED";
  return {
    entityType: "ENTITLEMENT_OVERRIDE", entityId: id(r), evidenceCode: "ENTITLEMENT_GOVERNANCE_STATUS",
    evidenceStatus: st, sourceVersion: null, sourceUpdatedAt: dt(r.updatedAt),
    safeMetadata: {
      entitlementKey: s(r.entitlementKey), decision: s(r.decision), hasLimitOverride: bl(r.hasLimitOverride),
      isRevoked: bl(r.isRevoked), isExpired: bl(r.isExpired),
    },
  };
}

// ── Per-record PrivacyRequest lifecycle (PRIVACY_REQUEST scope; no email/desc) ─
export function projectPrivacyRequest(r: Row): SafeEvidenceItem {
  const status = s(r.status);
  const terminal = status === "COMPLETED" || status === "REJECTED" || status === "CANCELLED";
  const st: EvidenceReadiness = terminal ? "COMPLETE" : "REVIEW_REQUIRED";
  return {
    entityType: "PRIVACY_REQUEST", entityId: id(r), evidenceCode: "PRIVACY_REQUEST_LIFECYCLE",
    evidenceStatus: st, sourceVersion: null, sourceUpdatedAt: dt(r.updatedAt),
    safeMetadata: { requestType: s(r.requestType), status, locale: s(r.locale), hasIdentityVerification: bl(r.hasIdentityVerification) },
  };
}

// ── Governance children of a privacy request (export / erasure — no bodies) ───
export function projectDataExportRequest(r: Row): SafeEvidenceItem {
  const lifecycle = s(r.lifecycle);
  const st: EvidenceReadiness =
    bl(r.hasFailure) ? "REVIEW_REQUIRED"
    : lifecycle === "DELIVERED" || lifecycle === "COMPLETED" || lifecycle === "REVOKED" ? "COMPLETE"
    : "REVIEW_REQUIRED";
  return {
    entityType: "DATA_EXPORT_REQUEST", entityId: id(r), evidenceCode: "SUBJECT_EXPORT_GOVERNANCE",
    evidenceStatus: st, sourceVersion: s(r.schemaVersion), sourceUpdatedAt: dt(r.updatedAt),
    safeMetadata: {
      lifecycle, subjectClass: s(r.subjectClass), hasApproval: bl(r.hasApproval),
      hasContentHash: bl(r.hasContentHash), hasPackageHash: bl(r.hasPackageHash), hasFailure: bl(r.hasFailure),
    },
  };
}

export function projectDataDeletionRequest(r: Row): SafeEvidenceItem {
  const lifecycle = s(r.lifecycle);
  const st: EvidenceReadiness =
    bl(r.hasFailure) || has(r.blockedReasonCode) ? "REVIEW_REQUIRED"
    : lifecycle === "COMPLETED" || lifecycle === "EXECUTED" ? "COMPLETE"
    : "REVIEW_REQUIRED";
  return {
    entityType: "DATA_DELETION_REQUEST", entityId: id(r), evidenceCode: "SUBJECT_ERASURE_GOVERNANCE",
    evidenceStatus: st, sourceVersion: has(r.planVersion) ? String(n(r.planVersion)) : null, sourceUpdatedAt: dt(r.updatedAt),
    safeMetadata: {
      lifecycle, subjectClass: s(r.subjectClass), hasApproval: bl(r.hasApproval),
      hasPlan: bl(r.hasPlan), hasApprovedPlan: bl(r.hasApprovedPlan), blockedReasonCode: s(r.blockedReasonCode), hasFailure: bl(r.hasFailure),
    },
  };
}

// ── Aggregates (counts only — never per-subject identity) ─────────────────────
export function projectCountAggregate(params: {
  entityType: string; evidenceCode: string; total: number; byStatus: Record<string, number>;
  status: EvidenceReadiness; extra?: Record<string, unknown>;
}): SafeEvidenceItem {
  const sortedCounts: Record<string, number> = {};
  for (const k of Object.keys(params.byStatus).sort()) sortedCounts[k] = params.byStatus[k];
  return {
    entityType: params.entityType, entityId: null, evidenceCode: params.evidenceCode,
    evidenceStatus: params.status, sourceVersion: null, sourceUpdatedAt: null,
    safeMetadata: { total: params.total, byStatus: sortedCounts, ...(params.extra ?? {}) },
  };
}

// ── Unsupported / malformed governed record (never dropped; no raw content) ───
export function projectUnsupported(entityType: string, reasonCode: string, entityId: string | null = null): SafeEvidenceItem {
  return {
    entityType: "UNSUPPORTED", entityId, evidenceCode: "UNSUPPORTED_OR_MALFORMED",
    evidenceStatus: "CONFIGURATION_REQUIRED", sourceVersion: null, sourceUpdatedAt: null,
    safeMetadata: { sourceEntityType: entityType, reasonCode },
  };
}
