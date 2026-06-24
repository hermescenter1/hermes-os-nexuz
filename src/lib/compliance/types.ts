// Phase 61 — Compliance type aliases (no static @prisma/client import)

export type PrivacyRequestType =
  | "DATA_EXPORT"
  | "DATA_DELETION"
  | "CONSENT_WITHDRAWAL"
  | "ACCESS_REQUEST"
  | "CORRECTION_REQUEST";

export type PrivacyRequestStatus =
  | "PENDING"
  | "IN_REVIEW"
  | "COMPLETED"
  | "REJECTED";

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
  createdAt:       Date;
}

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
  createdAt:      Date;
  updatedAt:      Date;
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
};

export const CURRENT_CONSENT_VERSION = "1.0";
export const CURRENT_POLICY_VERSION  = "1.0";
