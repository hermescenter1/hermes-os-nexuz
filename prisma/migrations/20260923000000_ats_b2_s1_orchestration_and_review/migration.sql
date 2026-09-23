-- ATS-B2 / ATS-S1 — public intake orchestration, AI review, human approval gate
-- (additive, rollback-aware).
--
-- Contract:
--   * Purely additive DDL. No UPDATE, DELETE, INSERT, DROP, TRUNCATE, no
--     backfill. Every new AtsApplication column is NULLABLE or carries a
--     structural default (a counter at 0), never an invented business value.
--   * Two values are APPENDED to "AtsApplicationStatus". PostgreSQL
--     ALTER TYPE ... ADD VALUE is non-transactional but idempotent with
--     IF NOT EXISTS (phase32 / phase48 precedent). No existing row changes
--     status; the new values are only ever written by the intake service and
--     the review worker.
--   * Every S1 child table carries (organizationId, applicationId) → the
--     composite AtsApplication(organizationId, id), so a row for another
--     organization's application is unwritable at the database (phase102
--     release-blocker-6 / B1.2 precedent). AtsJobCriterion carries the same
--     to AtsJob(organizationId, id), which already exists.
--   * The body below is byte-for-byte the output of
--       prisma migrate diff --from-schema <HEAD schema> --to-schema prisma/schema.prisma --script
--     with the single edit of IF NOT EXISTS on the two ADD VALUE statements,
--     so schema ↔ SQL parity is exact and machine-checked by
--     prisma/__tests__/ats-b2-s1-migration-safety.test.ts.
--
-- Rollback (reverse order; non-destructive to pre-existing data; the two enum
-- values cannot be removed from a PostgreSQL type and are simply left unused):
--   ALTER TABLE "AtsReviewOutbox" DROP CONSTRAINT "AtsReviewOutbox_application_tenant_fkey";
--   ALTER TABLE "AtsReviewOutbox" DROP CONSTRAINT "AtsReviewOutbox_organizationId_fkey";
--   ALTER TABLE "AtsReviewDecision" DROP CONSTRAINT "AtsReviewDecision_aiReviewId_fkey";
--   ALTER TABLE "AtsReviewDecision" DROP CONSTRAINT "AtsReviewDecision_application_tenant_fkey";
--   ALTER TABLE "AtsReviewDecision" DROP CONSTRAINT "AtsReviewDecision_organizationId_fkey";
--   ALTER TABLE "AtsAiReview" DROP CONSTRAINT "AtsAiReview_application_tenant_fkey";
--   ALTER TABLE "AtsAiReview" DROP CONSTRAINT "AtsAiReview_organizationId_fkey";
--   ALTER TABLE "AtsJobCriterion" DROP CONSTRAINT "AtsJobCriterion_job_tenant_fkey";
--   ALTER TABLE "AtsJobCriterion" DROP CONSTRAINT "AtsJobCriterion_organizationId_fkey";
--   DROP TABLE "AtsReviewOutbox"; DROP TABLE "AtsReviewDecision";
--   DROP TABLE "AtsAiReview"; DROP TABLE "AtsJobCriterion";
--   DROP INDEX "AtsApplication_publicReference_key";
--   DROP INDEX "AtsApplication_organizationId_id_key";
--   DROP INDEX "AtsApplication_organizationId_retentionExpiresAt_idx";
--   ALTER TABLE "AtsApplication" DROP COLUMN "aiReviewCycle", DROP COLUMN "anonymizedAt",
--     DROP COLUMN "consentVersion", DROP COLUMN "intakeCorrelationId",
--     DROP COLUMN "jobCriteriaSnapshot", DROP COLUMN "publicReference",
--     DROP COLUMN "retentionExpiresAt", DROP COLUMN "retentionPolicyId",
--     DROP COLUMN "withdrawnAt";
--   DROP TYPE "AtsReviewOutboxStatus"; DROP TYPE "AtsReviewDecisionKind";
--   DROP TYPE "AtsAiRecommendation"; DROP TYPE "AtsCriterionKind";

-- CreateEnum
CREATE TYPE "AtsCriterionKind" AS ENUM ('MUST_HAVE', 'NICE_TO_HAVE', 'DISQUALIFIER');

-- CreateEnum
CREATE TYPE "AtsAiRecommendation" AS ENUM ('ADVANCE', 'REVIEW_REQUIRED', 'HOLD', 'REJECT_RECOMMENDED');

-- CreateEnum
CREATE TYPE "AtsReviewDecisionKind" AS ENUM ('ADVANCE', 'HOLD', 'RETURN_FOR_REVIEW', 'REJECT');

-- CreateEnum
CREATE TYPE "AtsReviewOutboxStatus" AS ENUM ('PENDING', 'CLAIMED', 'RETRYING', 'DELIVERED', 'DEAD_LETTER');

-- AlterEnum
-- PostgreSQL ALTER TYPE ADD VALUE is non-transactional but idempotent with
-- IF NOT EXISTS. Values are appended; no existing row is touched.
ALTER TYPE "AtsApplicationStatus" ADD VALUE IF NOT EXISTS 'AI_REVIEW_PENDING';
ALTER TYPE "AtsApplicationStatus" ADD VALUE IF NOT EXISTS 'PENDING_HUMAN_APPROVAL';

-- AlterTable
ALTER TABLE "AtsApplication" ADD COLUMN     "aiReviewCycle" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "anonymizedAt" TIMESTAMP(3),
ADD COLUMN     "consentVersion" TEXT,
ADD COLUMN     "intakeCorrelationId" TEXT,
ADD COLUMN     "jobCriteriaSnapshot" JSONB,
ADD COLUMN     "publicReference" TEXT,
ADD COLUMN     "retentionExpiresAt" TIMESTAMP(3),
ADD COLUMN     "retentionPolicyId" TEXT,
ADD COLUMN     "withdrawnAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AtsJobCriterion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "kind" "AtsCriterionKind" NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "keywords" JSONB NOT NULL DEFAULT '[]',
    "minYears" INTEGER,
    "hardGate" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtsJobCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtsAiReview" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT NOT NULL,
    "extractorVersion" TEXT NOT NULL,
    "rubricVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "modelVersion" TEXT,
    "recommendation" "AtsAiRecommendation" NOT NULL,
    "overallScore" INTEGER,
    "confidence" INTEGER,
    "hardGatesPassed" INTEGER NOT NULL DEFAULT 0,
    "hardGatesFailed" INTEGER NOT NULL DEFAULT 0,
    "hardGatesUnknown" INTEGER NOT NULL DEFAULT 0,
    "riskFlagCount" INTEGER NOT NULL DEFAULT 0,
    "report" JSONB NOT NULL,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtsAiReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtsReviewDecision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorMemberId" TEXT,
    "actorRole" TEXT NOT NULL,
    "fromStatus" "AtsApplicationStatus" NOT NULL,
    "toStatus" "AtsApplicationStatus" NOT NULL,
    "decision" "AtsReviewDecisionKind" NOT NULL,
    "reason" TEXT NOT NULL,
    "aiReviewId" TEXT,
    "correlationId" TEXT NOT NULL,
    "auditLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtsReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtsReviewOutbox" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'AI_REVIEW',
    "cycle" INTEGER NOT NULL DEFAULT 0,
    "status" "AtsReviewOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "aiReviewId" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtsReviewOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AtsJobCriterion_organizationId_jobId_sortOrder_idx" ON "AtsJobCriterion"("organizationId", "jobId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AtsJobCriterion_organizationId_jobId_code_key" ON "AtsJobCriterion"("organizationId", "jobId", "code");

-- CreateIndex
CREATE INDEX "AtsAiReview_organizationId_applicationId_createdAt_idx" ON "AtsAiReview"("organizationId", "applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "AtsAiReview_organizationId_recommendation_idx" ON "AtsAiReview"("organizationId", "recommendation");

-- CreateIndex
CREATE UNIQUE INDEX "AtsAiReview_organizationId_applicationId_cycle_key" ON "AtsAiReview"("organizationId", "applicationId", "cycle");

-- CreateIndex
CREATE INDEX "AtsReviewDecision_organizationId_applicationId_createdAt_idx" ON "AtsReviewDecision"("organizationId", "applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "AtsReviewDecision_organizationId_actorUserId_createdAt_idx" ON "AtsReviewDecision"("organizationId", "actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AtsReviewOutbox_status_nextAttemptAt_idx" ON "AtsReviewOutbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "AtsReviewOutbox_organizationId_status_createdAt_idx" ON "AtsReviewOutbox"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AtsReviewOutbox_organizationId_applicationId_kind_cycle_key" ON "AtsReviewOutbox"("organizationId", "applicationId", "kind", "cycle");

-- CreateIndex
CREATE INDEX "AtsApplication_organizationId_retentionExpiresAt_idx" ON "AtsApplication"("organizationId", "retentionExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AtsApplication_organizationId_id_key" ON "AtsApplication"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AtsApplication_publicReference_key" ON "AtsApplication"("publicReference");

-- AddForeignKey
ALTER TABLE "AtsJobCriterion" ADD CONSTRAINT "AtsJobCriterion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsJobCriterion" ADD CONSTRAINT "AtsJobCriterion_job_tenant_fkey" FOREIGN KEY ("organizationId", "jobId") REFERENCES "AtsJob"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsAiReview" ADD CONSTRAINT "AtsAiReview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsAiReview" ADD CONSTRAINT "AtsAiReview_application_tenant_fkey" FOREIGN KEY ("organizationId", "applicationId") REFERENCES "AtsApplication"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsReviewDecision" ADD CONSTRAINT "AtsReviewDecision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsReviewDecision" ADD CONSTRAINT "AtsReviewDecision_application_tenant_fkey" FOREIGN KEY ("organizationId", "applicationId") REFERENCES "AtsApplication"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsReviewDecision" ADD CONSTRAINT "AtsReviewDecision_aiReviewId_fkey" FOREIGN KEY ("aiReviewId") REFERENCES "AtsAiReview"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsReviewOutbox" ADD CONSTRAINT "AtsReviewOutbox_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsReviewOutbox" ADD CONSTRAINT "AtsReviewOutbox_application_tenant_fkey" FOREIGN KEY ("organizationId", "applicationId") REFERENCES "AtsApplication"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
