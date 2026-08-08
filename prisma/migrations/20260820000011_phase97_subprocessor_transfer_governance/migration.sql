-- Phase 97 Part I — Subprocessor & Data-Transfer governance.
--
-- ADDITIVE ONLY. Two NEW tenant-owned tables (no existing rows anywhere, so no
-- preflight or data mapping is required) plus one additive unique index on
-- ProcessingActivity used as a composite-FK target. Migrations 20260820000000
-- through 20260820000010 are untouched. No destructive operation.
--
--   - Every record carries an authoritative organizationId with a REAL
--     Organization FK (ON DELETE RESTRICT — governance evidence is never silently
--     orphaned; LegalHold precedent).
--   - Closed lifecycle / review-status CHECKs quarantine unknown values.
--   - Approval CHECKs: APPROVED/ACTIVE requires approval attribution AND every
--     required review POSITIVELY complete at the database layer
--     (UNREVIEWED_SUBPROCESSOR_APPROVAL=0 / UNREVIEWED_DATA_TRANSFER_APPROVAL=0).
--   - Composite tenant-safe relation FKs on DataTransfer: (subprocessorId,
--     organizationId) → Subprocessor(id, organizationId) and
--     (processingActivityId, organizationId) → ProcessingActivity(id,
--     organizationId), both ON DELETE RESTRICT — a foreign-tenant identifier can
--     never be linked even when the raw id is valid
--     (CROSS_TENANT_TRANSFER_RELATION=0). MATCH SIMPLE + non-null organizationId
--     means the FK is enforced exactly when the optional link column is set.

-- CreateTable
CREATE TABLE "Subprocessor" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalEntity" TEXT,
    "providerRegistryId" TEXT,
    "serviceCategory" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "operatingCountries" JSONB NOT NULL DEFAULT '[]',
    "processingCountries" JSONB NOT NULL DEFAULT '[]',
    "dataCategories" JSONB NOT NULL DEFAULT '[]',
    "subjectCategories" JSONB NOT NULL DEFAULT '[]',
    "contractReviewStatus" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "privacyReviewStatus" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "securityReviewStatus" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "lifecycle" TEXT NOT NULL DEFAULT 'DRAFT',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subprocessor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataTransfer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subprocessorId" TEXT,
    "processingActivityId" TEXT,
    "sourceJurisdiction" TEXT NOT NULL DEFAULT 'CONFIGURATION_REQUIRED',
    "destinationJurisdiction" TEXT NOT NULL DEFAULT 'CONFIGURATION_REQUIRED',
    "transferCategory" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "transferMechanismStatus" TEXT NOT NULL DEFAULT 'LEGAL_REVIEW_REQUIRED',
    "legalReviewStatus" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "riskReviewStatus" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "lifecycle" TEXT NOT NULL DEFAULT 'DRAFT',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Subprocessor_organizationId_lifecycle_idx" ON "Subprocessor" ("organizationId", "lifecycle");
CREATE INDEX "Subprocessor_organizationId_updatedAt_idx" ON "Subprocessor" ("organizationId", "updatedAt");
CREATE INDEX "DataTransfer_organizationId_lifecycle_idx" ON "DataTransfer" ("organizationId", "lifecycle");
CREATE INDEX "DataTransfer_organizationId_updatedAt_idx" ON "DataTransfer" ("organizationId", "updatedAt");
CREATE INDEX "DataTransfer_subprocessorId_idx" ON "DataTransfer" ("subprocessorId");
CREATE INDEX "DataTransfer_processingActivityId_idx" ON "DataTransfer" ("processingActivityId");

-- Composite-FK targets (id is already unique, so these always succeed).
CREATE UNIQUE INDEX "Subprocessor_id_org_key" ON "Subprocessor" ("id", "organizationId");
CREATE UNIQUE INDEX "ProcessingActivity_id_org_key" ON "ProcessingActivity" ("id", "organizationId");

-- AddForeignKey: authoritative organization ownership (evidence → RESTRICT).
ALTER TABLE "Subprocessor" ADD CONSTRAINT "Subprocessor_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DataTransfer" ADD CONSTRAINT "DataTransfer_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: tenant-safe composite relations. organizationId is NOT NULL, so
-- MATCH SIMPLE enforces the FK exactly when the optional link column is non-null —
-- and the referenced row must belong to the SAME organization. A ProcessingActivity
-- with a NULL organizationId can never be referenced (NULL never equals).
ALTER TABLE "DataTransfer" ADD CONSTRAINT "DataTransfer_subprocessor_tuple_fkey"
  FOREIGN KEY ("subprocessorId", "organizationId")
  REFERENCES "Subprocessor" ("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DataTransfer" ADD CONSTRAINT "DataTransfer_processing_activity_tuple_fkey"
  FOREIGN KEY ("processingActivityId", "organizationId")
  REFERENCES "ProcessingActivity" ("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Closed lifecycle vocabulary (shared by both registers).
ALTER TABLE "Subprocessor" ADD CONSTRAINT "Subprocessor_lifecycle_check"
  CHECK ("lifecycle" IN ('DRAFT','UNDER_REVIEW','APPROVED','ACTIVE','SUSPENDED','RETIRED','REVIEW_REQUIRED'));
ALTER TABLE "DataTransfer" ADD CONSTRAINT "DataTransfer_lifecycle_check"
  CHECK ("lifecycle" IN ('DRAFT','UNDER_REVIEW','APPROVED','ACTIVE','SUSPENDED','RETIRED','REVIEW_REQUIRED'));

-- Closed review vocabularies.
ALTER TABLE "Subprocessor" ADD CONSTRAINT "Subprocessor_review_status_check"
  CHECK ("contractReviewStatus" IN ('REVIEW_REQUIRED','IN_REVIEW','APPROVED','REJECTED')
    AND "privacyReviewStatus" IN ('REVIEW_REQUIRED','IN_REVIEW','APPROVED','REJECTED')
    AND "securityReviewStatus" IN ('REVIEW_REQUIRED','IN_REVIEW','APPROVED','REJECTED'));
ALTER TABLE "DataTransfer" ADD CONSTRAINT "DataTransfer_review_status_check"
  CHECK ("transferMechanismStatus" IN ('CONFIGURED','LEGAL_REVIEW_REQUIRED','CONFIGURATION_REQUIRED')
    AND "legalReviewStatus" IN ('REVIEW_REQUIRED','IN_REVIEW','APPROVED','REJECTED')
    AND "riskReviewStatus" IN ('REVIEW_REQUIRED','IN_REVIEW','APPROVED','REJECTED'));

-- APPROVED/ACTIVE requires approval attribution AND positively-complete reviews.
ALTER TABLE "Subprocessor" ADD CONSTRAINT "Subprocessor_approval_check"
  CHECK ("lifecycle" NOT IN ('APPROVED','ACTIVE')
    OR ("approvedBy" IS NOT NULL AND "approvedAt" IS NOT NULL
      AND "contractReviewStatus" = 'APPROVED'
      AND "privacyReviewStatus" = 'APPROVED'
      AND "securityReviewStatus" = 'APPROVED'));
ALTER TABLE "DataTransfer" ADD CONSTRAINT "DataTransfer_approval_check"
  CHECK ("lifecycle" NOT IN ('APPROVED','ACTIVE')
    OR ("approvedBy" IS NOT NULL AND "approvedAt" IS NOT NULL
      AND "transferMechanismStatus" = 'CONFIGURED'
      AND "legalReviewStatus" = 'APPROVED'
      AND "riskReviewStatus" = 'APPROVED'));
