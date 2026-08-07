-- Phase 97 — Compliance, Privacy & Legal Readiness (Part A: Processing Inventory).
--
-- ADDITIVE ONLY. No DROP TABLE, no DROP COLUMN, no destructive enum recreation.
-- Every new column is nullable or defaulted so the existing Phase 61
-- ProcessingActivity rows survive the upgrade unchanged. Classification columns
-- default to fail-closed sentinels (LEGAL_REVIEW_REQUIRED / REVIEW_REQUIRED /
-- DRAFT / PENDING_REVIEW) so an un-reviewed Record of Processing Activity is
-- never treated as complete/compliant. No data is read or rewritten here.

-- AlterTable: ProcessingActivity — Article 30 RoPA enrichment (Phase 97 Part A).
ALTER TABLE "ProcessingActivity" ADD COLUMN "description" TEXT;
ALTER TABLE "ProcessingActivity" ADD COLUMN "dataSubjectCategories" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ProcessingActivity" ADD COLUMN "sourceSystems" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ProcessingActivity" ADD COLUMN "destinationSystems" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ProcessingActivity" ADD COLUMN "internalRecipients" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ProcessingActivity" ADD COLUMN "externalRecipients" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ProcessingActivity" ADD COLUMN "subprocessors" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ProcessingActivity" ADD COLUMN "storageLocations" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ProcessingActivity" ADD COLUMN "retentionPolicyRef" TEXT;
ALTER TABLE "ProcessingActivity" ADD COLUMN "legalBasisStatus" TEXT NOT NULL DEFAULT 'LEGAL_REVIEW_REQUIRED';
ALTER TABLE "ProcessingActivity" ADD COLUMN "specialCategory" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProcessingActivity" ADD COLUMN "automatedDecision" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProcessingActivity" ADD COLUMN "internationalTransfer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProcessingActivity" ADD COLUMN "riskClassification" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED';
ALTER TABLE "ProcessingActivity" ADD COLUMN "dataOwner" TEXT;
ALTER TABLE "ProcessingActivity" ADD COLUMN "systemOwner" TEXT;
ALTER TABLE "ProcessingActivity" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "ProcessingActivity" ADD COLUMN "approvalState" TEXT NOT NULL DEFAULT 'PENDING_REVIEW';
ALTER TABLE "ProcessingActivity" ADD COLUMN "reviewDate" TIMESTAMP(3);
ALTER TABLE "ProcessingActivity" ADD COLUMN "createdBy" TEXT;
ALTER TABLE "ProcessingActivity" ADD COLUMN "updatedBy" TEXT;

-- CreateIndex: query paths for the compliance operations center (org-scoped).
CREATE INDEX "ProcessingActivity_organizationId_status_idx" ON "ProcessingActivity"("organizationId", "status");
CREATE INDEX "ProcessingActivity_organizationId_approvalState_idx" ON "ProcessingActivity"("organizationId", "approvalState");
CREATE INDEX "ProcessingActivity_organizationId_updatedAt_idx" ON "ProcessingActivity"("organizationId", "updatedAt");
