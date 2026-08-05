// Phase 61 — Compliance type aliases (no static @prisma/client import)

export type PrivacyRequestType =
  | "DATA_EXPORT"
  | "DATA_DELETION"
  | "CONSENT_WITHDRAWAL"
  | "ACCESS_REQUEST"
  | "CORRECTION_REQUEST"
  | "RESTRICTION"
  | "OBJECTION"
  | "OTHER";

export type PrivacyRequestStatus =
  | "PENDING"
  | "IN_REVIEW"
  | "COMPLETED"
  | "REJECTED"
  | "RECEIVED"
  | "IDENTITY_VERIFICATION_REQUIRED"
  | "VERIFIED"
  | "TRIAGED"
  | "DATA_COLLECTION"
  | "LEGAL_REVIEW_REQUIRED"
  | "APPROVED"
  | "PARTIALLY_APPROVED"
  | "FULFILMENT_IN_PROGRESS"
  | "CANCELLED";

export type LegalDocumentType =
  | "PRIVACY_POLICY"
  | "TERMS_OF_SERVICE"
  | "COOKIE_POLICY"
  | "DPA"
  | "CANDIDATE_CONSENT"
  | "ACADEMY_TERMS"
  | "MARKETING_CONSENT";

export type CookieConsentPreferences = {
  necessary:   boolean;
  analytics:   boolean;
  marketing:   boolean;
  preferences: boolean;
};

export interface DbConsentRecord {
  id:             string;
  userId:         string | null;
  candidateId:    string | null;
  organizationId: string | null;
  consentType:    string;
  consentVersion: string;
  granted:        boolean;
  locale:         string;
  ipAddress:      string | null;
  userAgent:      string | null;
  metadata:       Record<string, unknown>;
  createdAt:      Date;
}

export interface DbCookieConsent {
  id:             string;
  sessionId:      string;
  userId:         string | null;
  necessary:      boolean;
  analytics:      boolean;
  marketing:      boolean;
  preferences:    boolean;
  ipAddress:      string | null;
  userAgent:      string | null;
  locale:         string;
  consentVersion: string;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface DbPrivacyRequest {
  id:             string;
  userId:         string | null;
  candidateId:    string | null;
  organizationId: string | null;
  requestType:    PrivacyRequestType;
  status:         PrivacyRequestStatus;
  email:          string;
  description:    string | null;
  locale:         string;
  ipAddress:      string | null;
  userAgent:      string | null;
  reviewedBy:     string | null;
  reviewedAt:     Date | null;
  completedAt:    Date | null;
  responseNote:   string | null;
  metadata:       Record<string, unknown>;
  assignedById:              string | null;
  assignedAt:                Date | null;
  responsiblePersonId:       string | null;
  identityVerifiedAt:        Date | null;
  acknowledgementDueAt:      Date | null;
  identityVerificationDueAt: Date | null;
  responseDueAt:             Date | null;
  extensionDueAt:            Date | null;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface DbLegalDocument {
  id:             string;
  documentType:   LegalDocumentType;
  version:        string;
  title:          string;
  content:        string;
  locale:         string;
  isPublished:    boolean;
  publishedAt:    Date | null;
  effectiveDate:  Date | null;
  organizationId: string | null;
  createdBy:      string | null;
  lifecycle:      string;
  approvedBy:     string | null;
  approvedAt:     Date | null;
  publishedBy:    string | null;
  withdrawnAt:    Date | null;
  supersededById: string | null;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface DbLegalAcceptance {
  id:              string;
  legalDocumentId: string;
  userId:          string | null;
  candidateId:     string | null;
  organizationId:  string | null;
  ipAddress:       string | null;
  userAgent:       string | null;
  locale:          string;
  documentType:    string | null;
  documentVersion: string | null;
  sourceClass:     string | null;
  correlationId:   string | null;
  withdrawnAt:     Date | null;
  createdAt:       Date;
}

export type LegalDocumentLifecycle =
  | "DRAFT" | "IN_REVIEW" | "APPROVED" | "SCHEDULED"
  | "PUBLISHED" | "SUPERSEDED" | "WITHDRAWN" | "ARCHIVED";

export interface DbDataExportRequest {
  id:             string;
  userId:         string | null;
  candidateId:    string | null;
  organizationId: string | null;
  email:          string;
  status:         string;
  downloadUrl:    string | null;
  expiresAt:      Date | null;
  locale:         string;
  ipAddress:      string | null;
  completedAt:    Date | null;
  metadata:       Record<string, unknown>;
  privacyRequestId: string | null;
  lifecycle:      string;
  subjectClass:   string | null;
  approvedBy:     string | null;
  approvedAt:     Date | null;
  schemaVersion:  string | null;
  packageKey:     string | null;
  contentHash:    string | null;
  packageHash:    string | null;
  idempotencyKey: string | null;
  revokedBy:      string | null;
  revokedAt:      Date | null;
  failureCode:    string | null;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface DbExportDownloadToken {
  id:              string;
  exportRequestId: string;
  tokenHash:       string;
  subjectUserId:   string | null;
  organizationId:  string | null;
  expiresAt:       Date;
  usedAt:          Date | null;
  revokedAt:       Date | null;
  createdAt:       Date;
}

export interface DbDataDeletionRequest {
  id:             string;
  userId:         string | null;
  candidateId:    string | null;
  organizationId: string | null;
  email:          string;
  status:         string;
  reason:         string | null;
  scheduledFor:   Date | null;
  completedAt:    Date | null;
  locale:         string;
  ipAddress:      string | null;
  metadata:       Record<string, unknown>;
  // Phase 97 Part H — governed child erasure job.
  privacyRequestId:        string | null;
  lifecycle:               string;
  subjectClass:            string | null;
  idempotencyKey:          string | null;
  approvedBy:              string | null;
  approvedAt:              Date | null;
  approvedPlanHash:        string | null;
  approvedPlanVersion:     number | null;
  planJson:                Record<string, unknown> | null;
  planVersion:             number | null;
  planHash:                string | null;
  plannedAt:               Date | null;
  plannedBy:               string | null;
  reviewResolutions:       Record<string, unknown>[] | null;
  executionIdempotencyKey: string | null;
  executionStartedAt:      Date | null;
  blockedReasonCode:       string | null;
  failureCode:             string | null;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface ComplianceStats {
  totalPrivacyRequests:    number;
  pendingRequests:         number;
  completedRequests:       number;
  totalConsentRecords:     number;
  totalCookieConsents:     number;
  totalExportRequests:     number;
  totalDeletionRequests:   number;
  totalLegalDocuments:     number;
  publishedLegalDocuments: number;
}

export const LEGAL_DOC_LABELS: Record<LegalDocumentType, string> = {
  PRIVACY_POLICY:    "Privacy Policy",
  TERMS_OF_SERVICE:  "Terms of Service",
  COOKIE_POLICY:     "Cookie Policy",
  DPA:               "Data Processing Agreement",
  CANDIDATE_CONSENT: "Candidate Privacy Consent",
  ACADEMY_TERMS:     "Academy Learner Terms",
  MARKETING_CONSENT: "Marketing Consent",
};

export const REQUEST_TYPE_LABELS: Record<PrivacyRequestType, string> = {
  DATA_EXPORT:         "Data Export",
  DATA_DELETION:       "Data Deletion",
  CONSENT_WITHDRAWAL:  "Consent Withdrawal",
  ACCESS_REQUEST:      "Data Access Request",
  CORRECTION_REQUEST:  "Data Correction",
  RESTRICTION:         "Restriction of Processing",
  OBJECTION:           "Objection to Processing",
  OTHER:               "Other Request",
};

export const CURRENT_CONSENT_VERSION = "1.0";
export const CURRENT_POLICY_VERSION  = "1.0";

// ── Phase 97 — Processing Inventory (Article 30 RoPA) ─────────────────────────
//
// Classification vocabularies are CLOSED and fail-closed by default. No statutory
// duration, lawful-basis conclusion or approval is ever invented: a value the
// owner/legal counsel has not set stays LEGAL_REVIEW_REQUIRED / REVIEW_REQUIRED /
// CONFIGURATION_REQUIRED and is reported as incomplete in evidence generation.

export type ProcessingActivityStatus =
  | "DRAFT"
  | "ACTIVE"
  | "UNDER_REVIEW"
  | "RETIRED";

export type ProcessingApprovalState =
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED";

export type LegalBasisStatus =
  | "CONFIGURED"
  | "LEGAL_REVIEW_REQUIRED"
  | "CONFIGURATION_REQUIRED";

export type RiskClassification =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "REVIEW_REQUIRED";

export const PROCESSING_ACTIVITY_STATUSES: ProcessingActivityStatus[] = ["DRAFT", "ACTIVE", "UNDER_REVIEW", "RETIRED"];
export const PROCESSING_APPROVAL_STATES:   ProcessingApprovalState[]  = ["PENDING_REVIEW", "APPROVED", "REJECTED"];
export const LEGAL_BASIS_STATUSES:         LegalBasisStatus[]         = ["CONFIGURED", "LEGAL_REVIEW_REQUIRED", "CONFIGURATION_REQUIRED"];
export const RISK_CLASSIFICATIONS:         RiskClassification[]       = ["LOW", "MEDIUM", "HIGH", "REVIEW_REQUIRED"];

/**
 * Recognised lawful-basis classifications (GDPR Article 6). These are the values
 * an authorised user may SELECT — they are classifications, not a legal
 * conclusion. An empty/unknown basis is represented by legalBasisStatus, never by
 * guessing one of these.
 */
export const LEGAL_BASIS_CLASSIFICATIONS = [
  "consent",
  "contract",
  "legal_obligation",
  "vital_interests",
  "public_task",
  "legitimate_interests",
] as const;
export type LegalBasisClassification = typeof LEGAL_BASIS_CLASSIFICATIONS[number];

export interface DbRetentionPolicy {
  id:               string;
  organizationId:   string;
  name:             string;
  description:      string | null;
  dataClass:        string;
  targetResource:   string;
  retentionTrigger: string;
  retentionDays:    number | null;
  action:           string;
  reviewOwner:      string | null;
  approvalState:    string;
  legalHoldAware:   boolean;
  dryRunOnly:       boolean;
  enabled:          boolean;
  createdBy:        string | null;
  updatedBy:        string | null;
  createdAt:        Date;
  updatedAt:        Date;
}

export interface DbLegalHold {
  id:                   string;
  organizationId:       string;
  name:                 string;
  reasonClass:          string;
  scopeType:            string;
  subjectId:            string | null;
  resourceType:         string | null;
  resourceId:           string | null;
  processingActivityId: string | null;
  incidentId:           string | null;
  rangeStart:           Date | null;
  rangeEnd:             Date | null;
  status:               string;
  approvedBy:           string | null;
  approvedAt:           Date | null;
  startDate:            Date | null;
  reviewDate:           Date | null;
  releaseApprovedBy:    string | null;
  releasedAt:           Date | null;
  cancelledBy:          string | null;
  cancelledAt:          Date | null;
  createdBy:            string | null;
  updatedBy:            string | null;
  createdAt:            Date;
  updatedAt:            Date;
}

export interface DbProcessingActivity {
  id:                    string;
  organizationId:        string | null;
  name:                  string;
  purpose:               string;
  legalBasis:            string;
  dataCategories:        unknown;
  recipients:            unknown;
  retentionPeriod:       string | null;
  thirdCountries:        unknown;
  isActive:              boolean;
  description:           string | null;
  dataSubjectCategories: unknown;
  sourceSystems:         unknown;
  destinationSystems:    unknown;
  internalRecipients:    unknown;
  externalRecipients:    unknown;
  subprocessors:         unknown;
  storageLocations:      unknown;
  retentionPolicyRef:    string | null;
  legalBasisStatus:      string;
  specialCategory:       boolean;
  automatedDecision:     boolean;
  internationalTransfer: boolean;
  riskClassification:    string;
  dataOwner:             string | null;
  systemOwner:           string | null;
  status:                string;
  approvalState:         string;
  reviewDate:            Date | null;
  createdBy:             string | null;
  updatedBy:             string | null;
  createdAt:             Date;
  updatedAt:             Date;
}
