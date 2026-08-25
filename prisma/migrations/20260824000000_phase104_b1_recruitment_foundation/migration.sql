-- PHASE 104-B1 — Recruitment & ATS foundation (additive, rollback-aware).
--
-- Contract:
--   * Every new column is NULLABLE with NO default: an owner-gated field holds
--     no invented value until the owner decides it.
--   * NO existing row is rewritten: dropping a column DEFAULT changes future
--     INSERTs only; historical values keep whatever provenance they have.
--   * requisitionKey stays nullable in this stage (stage 1 of the five-stage
--     plan in 35-importer-contract.md). The org-scoped UNIQUE is safe to add
--     now because PostgreSQL treats NULLs as distinct.
--   * publishedAt is NOT backfilled from createdAt.
--
-- Rollback (reverse order, all non-destructive to pre-existing data):
--   DROP TABLE "RecruitmentOtpChallenge"; DROP TABLE "RecruitmentIdempotencyKey";
--   DROP TABLE "AtsJobTranslation"; DROP TYPE "AtsJobLanguage";
--   ALTER TABLE "ConsentRecord" DROP COLUMN "recordNature"; DROP TYPE "ConsentRecordNature";
--   DROP INDEX "RecruitmentOtpChallenge_live_one_key";
--   ALTER TABLE "RecruitmentIdempotencyKey" DROP CONSTRAINT "RecruitmentIdempotencyKey_job_tenant_fkey";
--   DROP INDEX "AtsJob_organizationId_id_key";
--   ALTER TABLE "AtsJob" DROP CONSTRAINT "AtsJob_hiringManager_tenant_fkey";
--   DROP INDEX "OrganizationMember_organizationId_id_key";
--   DROP INDEX "AtsJob_organizationId_requisitionKey_key";
--   ALTER TABLE "AtsJob" ALTER COLUMN "isPublic" SET DEFAULT true;  -- only if the pre-B1 behaviour must return
--   ALTER TABLE "AtsJob" DROP COLUMN ... (each B1 column);
--   restoring the two dropped DEFAULTs would re-introduce the misleading
--   values and is deliberately NOT part of rollback.

-- ── AtsJob: retire misleading defaults (values in existing rows untouched) ──
-- B1.1: isPublic loses its default too. The column stays NOT NULL, so an
-- INSERT that does not state a publication decision now FAILS instead of
-- silently becoming public. No stored row is rewritten.
ALTER TABLE "AtsJob" ALTER COLUMN "isPublic" DROP DEFAULT;
ALTER TABLE "AtsJob" ALTER COLUMN "locationType" DROP DEFAULT;
ALTER TABLE "AtsJob" ALTER COLUMN "locationType" DROP NOT NULL;
ALTER TABLE "AtsJob" ALTER COLUMN "salaryCurrency" DROP DEFAULT;
ALTER TABLE "AtsJob" ALTER COLUMN "salaryCurrency" DROP NOT NULL;

-- ── AtsJob: B1 columns (all nullable, no defaults) ──
ALTER TABLE "AtsJob" ADD COLUMN "requisitionKey" TEXT;
ALTER TABLE "AtsJob" ADD COLUMN "externalKey" TEXT;
ALTER TABLE "AtsJob" ADD COLUMN "slug" TEXT;
ALTER TABLE "AtsJob" ADD COLUMN "employmentType" TEXT;
ALTER TABLE "AtsJob" ADD COLUMN "contractType" TEXT;
ALTER TABLE "AtsJob" ADD COLUMN "numberOfOpenings" INTEGER;
ALTER TABLE "AtsJob" ADD COLUMN "hiringManagerId" TEXT;
ALTER TABLE "AtsJob" ADD COLUMN "publishedAt" TIMESTAMP(3);
ALTER TABLE "AtsJob" ADD COLUMN "addressLocality" TEXT;
ALTER TABLE "AtsJob" ADD COLUMN "addressRegion" TEXT;
ALTER TABLE "AtsJob" ADD COLUMN "addressCountry" TEXT;
ALTER TABLE "AtsJob" ADD COLUMN "workingHoursSchedule" TEXT;
ALTER TABLE "AtsJob" ADD COLUMN "educationRequirement" TEXT;
ALTER TABLE "AtsJob" ADD COLUMN "minimumExperience" TEXT;

CREATE UNIQUE INDEX "AtsJob_organizationId_requisitionKey_key"
  ON "AtsJob"("organizationId", "requisitionKey");

-- B1.1 — the hiring-manager link carries the TENANT (phase102 release-
-- blocker-6 precedent: composite tenant FKs are a property of the DATABASE).
-- A single-column FK would accept org B's member on org A's job; the
-- composite one makes that row unwritable. MATCH SIMPLE means rows with a
-- NULL hiringManagerId are unconstrained, exactly as intended.
--
-- Referential action: ON DELETE SET NULL with a COLUMN LIST — deleting the
-- member nulls ONLY "hiringManagerId"; "organizationId" (NOT NULL, the
-- tenant) is never touched. A bare SET NULL would try to null both and
-- abort every such delete with a NOT NULL violation.
CREATE UNIQUE INDEX "OrganizationMember_organizationId_id_key"
  ON "OrganizationMember"("organizationId", "id");

ALTER TABLE "AtsJob" ADD CONSTRAINT "AtsJob_hiringManager_tenant_fkey"
  FOREIGN KEY ("organizationId", "hiringManagerId")
  REFERENCES "OrganizationMember"("organizationId", "id")
  ON DELETE SET NULL ("hiringManagerId") ON UPDATE CASCADE;

-- ── AtsCandidate: stop fabricating work authorization ──
ALTER TABLE "AtsCandidate" ALTER COLUMN "workAuthorization" DROP DEFAULT;
ALTER TABLE "AtsCandidate" ALTER COLUMN "workAuthorization" DROP NOT NULL;

-- ── AtsJobTranslation (content model Option A) ──
CREATE TYPE "AtsJobLanguage" AS ENUM ('EN', 'DE', 'FA');

CREATE TABLE "AtsJobTranslation" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "language" "AtsJobLanguage" NOT NULL,
    "title" TEXT NOT NULL,
    "shortSummary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "departmentLabel" TEXT NOT NULL,
    "responsibilities" JSONB NOT NULL DEFAULT '[]',
    "requirements" JSONB NOT NULL DEFAULT '[]',
    "preferredExperience" JSONB NOT NULL DEFAULT '[]',
    "localizedSkills" JSONB NOT NULL DEFAULT '{}',
    "seoTitle" TEXT NOT NULL,
    "seoDescription" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AtsJobTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AtsJobTranslation_jobId_language_key"
  ON "AtsJobTranslation"("jobId", "language");
CREATE INDEX "AtsJobTranslation_language_idx" ON "AtsJobTranslation"("language");

ALTER TABLE "AtsJobTranslation" ADD CONSTRAINT "AtsJobTranslation_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "AtsJob"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── ConsentRecord.recordNature (typed; nullable for unknown historical rows) ──
CREATE TYPE "ConsentRecordNature" AS ENUM ('ACKNOWLEDGEMENT', 'ATTESTATION', 'CONSENT');
ALTER TABLE "ConsentRecord" ADD COLUMN "recordNature" "ConsentRecordNature";

-- ── RecruitmentIdempotencyKey ──
CREATE TABLE "RecruitmentIdempotencyKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resultId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecruitmentIdempotencyKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecruitmentIdempotencyKey_organizationId_jobId_keyHash_key"
  ON "RecruitmentIdempotencyKey"("organizationId", "jobId", "keyHash");
CREATE INDEX "RecruitmentIdempotencyKey_expiresAt_idx"
  ON "RecruitmentIdempotencyKey"("expiresAt");

-- B1.1 — the claim row carries the tenant AND the job; bind them together so
-- a claim can only reference a job of its OWN organization. CASCADE: a
-- deleted job takes its claims with it (both columns reference one row).
CREATE UNIQUE INDEX "AtsJob_organizationId_id_key"
  ON "AtsJob"("organizationId", "id");

ALTER TABLE "RecruitmentIdempotencyKey"
  ADD CONSTRAINT "RecruitmentIdempotencyKey_job_tenant_fkey"
  FOREIGN KEY ("organizationId", "jobId")
  REFERENCES "AtsJob"("organizationId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── RecruitmentOtpChallenge ──
CREATE TABLE "RecruitmentOtpChallenge" (
    "id" TEXT NOT NULL,
    "identifierHmac" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "codeHmac" TEXT NOT NULL,
    "secretVersion" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invalidatedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecruitmentOtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecruitmentOtpChallenge_identifierHmac_purpose_createdAt_idx"
  ON "RecruitmentOtpChallenge"("identifierHmac", "purpose", "createdAt");

-- B1.2 — at most ONE live (unconsumed, uninvalidated) challenge per
-- (identifierHmac, purpose), enforced by the DATABASE with a PARTIAL unique
-- index. Concurrent double-issue loses on this constraint even if every
-- application-level check races. Partial indexes are not expressible in the
-- Prisma schema language; this is the second declared migration-only
-- construct, machine-gated by phase104b12-schema-sql-parity.test.ts.
CREATE UNIQUE INDEX "RecruitmentOtpChallenge_live_one_key"
  ON "RecruitmentOtpChallenge"("identifierHmac", "purpose")
  WHERE "invalidatedAt" IS NULL AND "consumedAt" IS NULL;
CREATE INDEX "RecruitmentOtpChallenge_expiresAt_idx"
  ON "RecruitmentOtpChallenge"("expiresAt");
