-- PHASE 104-B1 / B1.2 — EXACT, ORDERED, EXECUTABLE ROLLBACK
--
-- This file is the ONE rollback authority for
-- 20260824000000_phase104_b1_recruitment_foundation. The PG rehearsal runs
-- THIS file verbatim (wrapped in BEGIN/ROLLBACK); nothing is retyped inline,
-- so the artifact the reviewer reads is the artifact that was executed.
--
-- ORDER is load-bearing: dependants before dependencies.
--   1. constraints and indexes that REFERENCE other objects
--   2. the tables they belonged to
--   3. the enum types those tables used
--   4. the columns added to pre-existing tables
--
-- The three DROPPED DEFAULTS (locationType='onsite', salaryCurrency='USD',
-- workAuthorization='citizen') are deliberately NOT restored: they were the
-- defect, not the baseline. `isPublic` is the one exception — it had a real
-- pre-B1 default, so its restore is included and clearly marked, for a
-- rollback that must return the column to its exact pre-B1 behaviour.
--
-- Retired name check: this migration NEVER created
-- `AtsJob_hiringManagerId_fkey`; the tenant-carrying composite constraint is
-- `AtsJob_hiringManager_tenant_fkey`. A rollback naming the retired one would
-- fail at the first statement.

-- ── 1. constraints and indexes ───────────────────────────────────────────────
ALTER TABLE "RecruitmentIdempotencyKey" DROP CONSTRAINT "RecruitmentIdempotencyKey_job_tenant_fkey";
ALTER TABLE "AtsJob" DROP CONSTRAINT "AtsJob_hiringManager_tenant_fkey";
DROP INDEX "RecruitmentOtpChallenge_live_one_key";
DROP INDEX "AtsJob_organizationId_id_key";
DROP INDEX "OrganizationMember_organizationId_id_key";
DROP INDEX "AtsJob_organizationId_requisitionKey_key";

-- ── 2. tables added by this migration ────────────────────────────────────────
DROP TABLE "RecruitmentOtpChallenge";
DROP TABLE "RecruitmentIdempotencyKey";
DROP TABLE "AtsJobTranslation";

-- ── 3. columns added to pre-existing tables, then their enum types ───────────
ALTER TABLE "ConsentRecord" DROP COLUMN "recordNature";
DROP TYPE "ConsentRecordNature";
DROP TYPE "AtsJobLanguage";

ALTER TABLE "AtsJob"
  DROP COLUMN "requisitionKey",
  DROP COLUMN "externalKey",
  DROP COLUMN "slug",
  DROP COLUMN "employmentType",
  DROP COLUMN "contractType",
  DROP COLUMN "numberOfOpenings",
  DROP COLUMN "hiringManagerId",
  DROP COLUMN "publishedAt",
  DROP COLUMN "addressLocality",
  DROP COLUMN "addressRegion",
  DROP COLUMN "addressCountry",
  DROP COLUMN "workingHoursSchedule",
  DROP COLUMN "educationRequirement",
  DROP COLUMN "minimumExperience";

-- ── 4. the one legitimate default restore ────────────────────────────────────
-- Pre-B1, AtsJob.isPublic defaulted to true. B1.2 dropped that default so a
-- job can never become public implicitly. A rollback to pre-B1 behaviour must
-- put it back; a rollback that only removes B1 objects may omit this line.
ALTER TABLE "AtsJob" ALTER COLUMN "isPublic" SET DEFAULT true;
