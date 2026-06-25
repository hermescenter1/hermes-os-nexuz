-- Phase 61 — Compliance, GDPR & Privacy Governance
-- Migration: 20260801000000_phase61_compliance

-- ── OrgRole enum extension ────────────────────────────────────────────────────
ALTER TYPE "OrgRole" ADD VALUE IF NOT EXISTS 'COMPLIANCE_MANAGER';

-- ── New enums ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "PrivacyRequestType" AS ENUM (
    'DATA_EXPORT', 'DATA_DELETION', 'CONSENT_WITHDRAWAL',
    'ACCESS_REQUEST', 'CORRECTION_REQUEST'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PrivacyRequestStatus" AS ENUM (
    'PENDING', 'IN_REVIEW', 'COMPLETED', 'REJECTED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "LegalDocumentType" AS ENUM (
    'PRIVACY_POLICY', 'TERMS_OF_SERVICE', 'COOKIE_POLICY',
    'DPA', 'CANDIDATE_CONSENT', 'ACADEMY_TERMS', 'MARKETING_CONSENT'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── ConsentRecord ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ConsentRecord" (
    "id"             TEXT NOT NULL,
    "userId"         TEXT,
    "candidateId"    TEXT,
    "organizationId" TEXT,
    "consentType"    TEXT NOT NULL,
    "consentVersion" TEXT NOT NULL DEFAULT '1.0',
    "granted"        BOOLEAN NOT NULL,
    "locale"         TEXT NOT NULL DEFAULT 'en',
    "ipAddress"      TEXT,
    "userAgent"      TEXT,
    "metadata"       JSONB NOT NULL DEFAULT '{}',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ConsentRecord_userId_consentType_createdAt_idx"
    ON "ConsentRecord"("userId", "consentType", "createdAt");
CREATE INDEX IF NOT EXISTS "ConsentRecord_candidateId_consentType_idx"
    ON "ConsentRecord"("candidateId", "consentType");
CREATE INDEX IF NOT EXISTS "ConsentRecord_organizationId_createdAt_idx"
    ON "ConsentRecord"("organizationId", "createdAt");

-- ── CookieConsent ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CookieConsent" (
    "id"             TEXT NOT NULL,
    "sessionId"      TEXT NOT NULL,
    "userId"         TEXT,
    "necessary"      BOOLEAN NOT NULL DEFAULT true,
    "analytics"      BOOLEAN NOT NULL DEFAULT false,
    "marketing"      BOOLEAN NOT NULL DEFAULT false,
    "preferences"    BOOLEAN NOT NULL DEFAULT false,
    "ipAddress"      TEXT,
    "userAgent"      TEXT,
    "locale"         TEXT NOT NULL DEFAULT 'en',
    "consentVersion" TEXT NOT NULL DEFAULT '1.0',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CookieConsent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CookieConsent_sessionId_key" ON "CookieConsent"("sessionId");
CREATE INDEX IF NOT EXISTS "CookieConsent_userId_idx" ON "CookieConsent"("userId");
CREATE INDEX IF NOT EXISTS "CookieConsent_createdAt_idx" ON "CookieConsent"("createdAt");

-- ── PrivacyRequest ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PrivacyRequest" (
    "id"             TEXT NOT NULL,
    "userId"         TEXT,
    "candidateId"    TEXT,
    "organizationId" TEXT,
    "requestType"    "PrivacyRequestType" NOT NULL,
    "status"         "PrivacyRequestStatus" NOT NULL DEFAULT 'PENDING',
    "email"          TEXT NOT NULL,
    "description"    TEXT,
    "locale"         TEXT NOT NULL DEFAULT 'en',
    "ipAddress"      TEXT,
    "userAgent"      TEXT,
    "reviewedBy"     TEXT,
    "reviewedAt"     TIMESTAMP(3),
    "completedAt"    TIMESTAMP(3),
    "responseNote"   TEXT,
    "metadata"       JSONB NOT NULL DEFAULT '{}',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PrivacyRequest_status_createdAt_idx"
    ON "PrivacyRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "PrivacyRequest_userId_createdAt_idx"
    ON "PrivacyRequest"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "PrivacyRequest_email_idx"
    ON "PrivacyRequest"("email");
CREATE INDEX IF NOT EXISTS "PrivacyRequest_organizationId_createdAt_idx"
    ON "PrivacyRequest"("organizationId", "createdAt");

-- ── LegalDocument ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "LegalDocument" (
    "id"             TEXT NOT NULL,
    "documentType"   "LegalDocumentType" NOT NULL,
    "version"        TEXT NOT NULL,
    "title"          TEXT NOT NULL,
    "content"        TEXT NOT NULL,
    "locale"         TEXT NOT NULL DEFAULT 'en',
    "isPublished"    BOOLEAN NOT NULL DEFAULT false,
    "publishedAt"    TIMESTAMP(3),
    "effectiveDate"  TIMESTAMP(3),
    "organizationId" TEXT,
    "createdBy"      TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LegalDocument_documentType_version_locale_key"
    ON "LegalDocument"("documentType", "version", "locale");
CREATE INDEX IF NOT EXISTS "LegalDocument_documentType_isPublished_locale_idx"
    ON "LegalDocument"("documentType", "isPublished", "locale");
CREATE INDEX IF NOT EXISTS "LegalDocument_organizationId_documentType_idx"
    ON "LegalDocument"("organizationId", "documentType");

-- ── LegalAcceptance ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "LegalAcceptance" (
    "id"              TEXT NOT NULL,
    "legalDocumentId" TEXT NOT NULL,
    "userId"          TEXT,
    "candidateId"     TEXT,
    "organizationId"  TEXT,
    "ipAddress"       TEXT,
    "userAgent"       TEXT,
    "locale"          TEXT NOT NULL DEFAULT 'en',
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LegalAcceptance_legalDocumentId_createdAt_idx"
    ON "LegalAcceptance"("legalDocumentId", "createdAt");
CREATE INDEX IF NOT EXISTS "LegalAcceptance_userId_legalDocumentId_idx"
    ON "LegalAcceptance"("userId", "legalDocumentId");
CREATE INDEX IF NOT EXISTS "LegalAcceptance_candidateId_legalDocumentId_idx"
    ON "LegalAcceptance"("candidateId", "legalDocumentId");

-- ── DataExportRequest ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DataExportRequest" (
    "id"             TEXT NOT NULL,
    "userId"         TEXT,
    "candidateId"    TEXT,
    "organizationId" TEXT,
    "email"          TEXT NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'PENDING',
    "downloadUrl"    TEXT,
    "expiresAt"      TIMESTAMP(3),
    "locale"         TEXT NOT NULL DEFAULT 'en',
    "ipAddress"      TEXT,
    "completedAt"    TIMESTAMP(3),
    "metadata"       JSONB NOT NULL DEFAULT '{}',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataExportRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DataExportRequest_userId_createdAt_idx"
    ON "DataExportRequest"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "DataExportRequest_status_createdAt_idx"
    ON "DataExportRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "DataExportRequest_email_idx"
    ON "DataExportRequest"("email");

-- ── DataDeletionRequest ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DataDeletionRequest" (
    "id"             TEXT NOT NULL,
    "userId"         TEXT,
    "candidateId"    TEXT,
    "organizationId" TEXT,
    "email"          TEXT NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'PENDING',
    "reason"         TEXT,
    "scheduledFor"   TIMESTAMP(3),
    "completedAt"    TIMESTAMP(3),
    "locale"         TEXT NOT NULL DEFAULT 'en',
    "ipAddress"      TEXT,
    "metadata"       JSONB NOT NULL DEFAULT '{}',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataDeletionRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DataDeletionRequest_userId_createdAt_idx"
    ON "DataDeletionRequest"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "DataDeletionRequest_status_createdAt_idx"
    ON "DataDeletionRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "DataDeletionRequest_email_idx"
    ON "DataDeletionRequest"("email");

-- ── ProcessingActivity ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ProcessingActivity" (
    "id"              TEXT NOT NULL,
    "organizationId"  TEXT,
    "name"            TEXT NOT NULL,
    "purpose"         TEXT NOT NULL,
    "legalBasis"      TEXT NOT NULL,
    "dataCategories"  JSONB NOT NULL DEFAULT '[]',
    "recipients"      JSONB NOT NULL DEFAULT '[]',
    "retentionPeriod" TEXT,
    "thirdCountries"  JSONB NOT NULL DEFAULT '[]',
    "isActive"        BOOLEAN NOT NULL DEFAULT true,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcessingActivity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProcessingActivity_organizationId_isActive_idx"
    ON "ProcessingActivity"("organizationId", "isActive");

-- ── Foreign key constraints ───────────────────────────────────────────────────
ALTER TABLE "ConsentRecord"
    ADD CONSTRAINT "ConsentRecord_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "ConsentRecord_candidateId_fkey"
        FOREIGN KEY ("candidateId") REFERENCES "AtsCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "ConsentRecord_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CookieConsent"
    ADD CONSTRAINT "CookieConsent_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PrivacyRequest"
    ADD CONSTRAINT "PrivacyRequest_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "PrivacyRequest_candidateId_fkey"
        FOREIGN KEY ("candidateId") REFERENCES "AtsCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "PrivacyRequest_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LegalDocument"
    ADD CONSTRAINT "LegalDocument_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LegalAcceptance"
    ADD CONSTRAINT "LegalAcceptance_legalDocumentId_fkey"
        FOREIGN KEY ("legalDocumentId") REFERENCES "LegalDocument"("id") ON UPDATE CASCADE,
    ADD CONSTRAINT "LegalAcceptance_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "LegalAcceptance_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DataExportRequest"
    ADD CONSTRAINT "DataExportRequest_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "DataExportRequest_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DataDeletionRequest"
    ADD CONSTRAINT "DataDeletionRequest_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "DataDeletionRequest_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProcessingActivity"
    ADD CONSTRAINT "ProcessingActivity_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
