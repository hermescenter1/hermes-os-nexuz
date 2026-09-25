-- ATS-M1 — position management and organization ATS settings (additive,
-- rollback-aware).
--
-- Contract:
--   * Purely additive DDL. No UPDATE, DELETE, INSERT, DROP, TRUNCATE, no
--     backfill, no existing column altered. Every new AtsJob column is
--     NULLABLE or carries a structural default (a version counter at 0, an
--     empty evidence list, salaryConfidential false) that asserts nothing
--     publishable: the publish gate refuses a position without its criteria,
--     rubric, owners and SLA whatever these defaults say.
--   * Two values are APPENDED to "AtsJobStatus" (PAUSED, ARCHIVED). PostgreSQL
--     ALTER TYPE ... ADD VALUE is idempotent with IF NOT EXISTS (phase32 /
--     phase48 / ATS-S1 precedent). No row changes status; the legacy ON_HOLD
--     value stays and is read as PAUSED by the position state machine. Nothing
--     in this migration uses the new values, so the non-transactional
--     ADD VALUE is safe.
--   * RetentionPolicy gains one NULLABLE column, effectiveFrom. Existing rows
--     read NULL = "effective from approval", i.e. unchanged behaviour.
--   * Two new tables, each owned by an organization and dying with it:
--     AtsOrganizationSettings (one row per organization, created on first
--     write; an absent row reads as fail-closed defaults) and
--     AtsManagementIdempotencyKey (24-hour dedupe claims, hashed keys only).
--   * AtsApplication_jobId_fkey is untouched and remains NO ACTION: the
--     database itself refuses to hard-delete a position that still has
--     applications. The application layer never attempts it (soft delete only).
--   * The body below is byte-for-byte the output of
--       prisma migrate diff --from-schema <HEAD schema> --to-schema prisma/schema.prisma --script
--     with the single edit of IF NOT EXISTS on the two ADD VALUE statements,
--     machine-checked by prisma/__tests__/ats-m1-migration-safety.test.ts.
--
-- Rollback (reverse order; non-destructive to pre-existing data; the two enum
-- values cannot be removed from a PostgreSQL type and are simply left unused —
-- before rolling back, move any PAUSED/ARCHIVED position to a pre-M1 status
-- with an explicit, reviewed statement):
--   ALTER TABLE "AtsManagementIdempotencyKey" DROP CONSTRAINT "AtsManagementIdempotencyKey_organizationId_fkey";
--   ALTER TABLE "AtsOrganizationSettings" DROP CONSTRAINT "AtsOrganizationSettings_organizationId_fkey";
--   DROP TABLE "AtsManagementIdempotencyKey";
--   DROP TABLE "AtsOrganizationSettings";
--   ALTER TABLE "RetentionPolicy" DROP COLUMN "effectiveFrom";
--   ALTER TABLE "AtsJob" DROP COLUMN "approvalOwnerRole", DROP COLUMN "archivedAt",
--     DROP COLUMN "assessmentConfig", DROP COLUMN "closedAt", DROP COLUMN "decisionSlaDays",
--     DROP COLUMN "evidenceRequirements", DROP COLUMN "internalBrief", DROP COLUMN "internalTitle",
--     DROP COLUMN "interviewKit", DROP COLUMN "pausedAt", DROP COLUMN "relocationPolicy",
--     DROP COLUMN "roleProfileCode", DROP COLUMN "salaryConfidential", DROP COLUMN "scoringRubric",
--     DROP COLUMN "sponsorshipPolicy", DROP COLUMN "version";

-- AlterEnum
ALTER TYPE "AtsJobStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "AtsJobStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

-- AlterTable
ALTER TABLE "AtsJob" ADD COLUMN     "approvalOwnerRole" TEXT,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "assessmentConfig" JSONB,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "decisionSlaDays" INTEGER,
ADD COLUMN     "evidenceRequirements" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "internalBrief" TEXT,
ADD COLUMN     "internalTitle" TEXT,
ADD COLUMN     "interviewKit" JSONB,
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "relocationPolicy" TEXT,
ADD COLUMN     "roleProfileCode" TEXT,
ADD COLUMN     "salaryConfidential" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scoringRubric" JSONB,
ADD COLUMN     "sponsorshipPolicy" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RetentionPolicy" ADD COLUMN     "effectiveFrom" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AtsOrganizationSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "defaultDecisionSlaDays" INTEGER,
    "defaultInterviewStages" JSONB NOT NULL DEFAULT '[]',
    "defaultApprovalOwnerRole" TEXT,
    "aiProviderMode" TEXT NOT NULL DEFAULT 'deterministic',
    "externalAiProcessingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "minimumConfidence" INTEGER,
    "reviewAlertsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "interviewRemindersEnabled" BOOLEAN NOT NULL DEFAULT false,
    "slaBreachAlertsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "publicListingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "applicationIntakeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultPublicLocale" TEXT NOT NULL DEFAULT 'fa',
    "retentionPolicyId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtsOrganizationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtsManagementIdempotencyKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "resultJson" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtsManagementIdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AtsOrganizationSettings_organizationId_key" ON "AtsOrganizationSettings"("organizationId");

-- CreateIndex
CREATE INDEX "AtsManagementIdempotencyKey_expiresAt_idx" ON "AtsManagementIdempotencyKey"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AtsManagementIdempotencyKey_organizationId_operation_keyHas_key" ON "AtsManagementIdempotencyKey"("organizationId", "operation", "keyHash");

-- AddForeignKey
ALTER TABLE "AtsOrganizationSettings" ADD CONSTRAINT "AtsOrganizationSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsManagementIdempotencyKey" ADD CONSTRAINT "AtsManagementIdempotencyKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

