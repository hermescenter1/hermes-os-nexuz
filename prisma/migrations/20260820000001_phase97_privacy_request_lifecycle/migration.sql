-- Phase 97 — Compliance, Privacy & Legal Readiness (Part B: PrivacyRequest lifecycle).
--
-- ADDITIVE ONLY. Enum values are appended (append-only) and NOT referenced by any
-- statement in this migration, so they are safe to add inside the migration
-- transaction. New PrivacyRequest columns are nullable so existing rows survive
-- unchanged. No data is read, rewritten or deleted.

-- AlterEnum: extend the request-type vocabulary (GDPR Art. 18/21 + catch-all).
ALTER TYPE "PrivacyRequestType" ADD VALUE IF NOT EXISTS 'RESTRICTION';
ALTER TYPE "PrivacyRequestType" ADD VALUE IF NOT EXISTS 'OBJECTION';
ALTER TYPE "PrivacyRequestType" ADD VALUE IF NOT EXISTS 'OTHER';

-- AlterEnum: extend the lifecycle-status vocabulary. PENDING is retained as the
-- legacy initial state; RECEIVED is its explicit synonym.
ALTER TYPE "PrivacyRequestStatus" ADD VALUE IF NOT EXISTS 'RECEIVED';
ALTER TYPE "PrivacyRequestStatus" ADD VALUE IF NOT EXISTS 'IDENTITY_VERIFICATION_REQUIRED';
ALTER TYPE "PrivacyRequestStatus" ADD VALUE IF NOT EXISTS 'VERIFIED';
ALTER TYPE "PrivacyRequestStatus" ADD VALUE IF NOT EXISTS 'TRIAGED';
ALTER TYPE "PrivacyRequestStatus" ADD VALUE IF NOT EXISTS 'DATA_COLLECTION';
ALTER TYPE "PrivacyRequestStatus" ADD VALUE IF NOT EXISTS 'LEGAL_REVIEW_REQUIRED';
ALTER TYPE "PrivacyRequestStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "PrivacyRequestStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_APPROVED';
ALTER TYPE "PrivacyRequestStatus" ADD VALUE IF NOT EXISTS 'FULFILMENT_IN_PROGRESS';
ALTER TYPE "PrivacyRequestStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- AlterTable: PrivacyRequest — triage assignment + policy-clock columns.
ALTER TABLE "PrivacyRequest" ADD COLUMN "assignedById" TEXT;
ALTER TABLE "PrivacyRequest" ADD COLUMN "assignedAt" TIMESTAMP(3);
ALTER TABLE "PrivacyRequest" ADD COLUMN "responsiblePersonId" TEXT;
ALTER TABLE "PrivacyRequest" ADD COLUMN "identityVerifiedAt" TIMESTAMP(3);
ALTER TABLE "PrivacyRequest" ADD COLUMN "acknowledgementDueAt" TIMESTAMP(3);
ALTER TABLE "PrivacyRequest" ADD COLUMN "identityVerificationDueAt" TIMESTAMP(3);
ALTER TABLE "PrivacyRequest" ADD COLUMN "responseDueAt" TIMESTAMP(3);
ALTER TABLE "PrivacyRequest" ADD COLUMN "extensionDueAt" TIMESTAMP(3);

-- CreateIndex: tenant-scoped status queries for the compliance operations center.
CREATE INDEX "PrivacyRequest_organizationId_status_idx" ON "PrivacyRequest"("organizationId", "status");
