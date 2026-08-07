-- Phase 97 Part H — Governed subject data erasure planning.
--
-- ADDITIVE / STRENGTHENING ONLY. No table, column or ROW is dropped or rewritten;
-- migrations 20260820000000 through 20260820000008 are left untouched. The existing
-- DataDeletionRequest becomes the governed CHILD planning/execution job of the
-- authoritative PrivacyRequest (mirroring the hardened DataExportRequest design):
--   - governed child-job columns + an immutable, hashed plan snapshot;
--   - a composite parent-tuple FK (privacyRequestId, organizationId, userId) →
--     PrivacyRequest (id, organizationId, userId) ON DELETE RESTRICT (reuses the
--     PrivacyRequest_id_org_user_key unique index created by migration 7);
--   - one ACTIVE governed job per parent;
--   - closed lifecycle, governed-shape, parentless-state, approval, plan-evidence
--     and plan-hash-format CHECKs.
--
-- Existing DataDeletionRequest rows keep privacyRequestId NULL and default to the
-- fail-closed REVIEW_REQUIRED quarantine state (no approval or parent binding is
-- invented). They are outside every new governed constraint.

-- AlterTable: DataDeletionRequest — governed child-job + plan-snapshot columns.
ALTER TABLE "DataDeletionRequest" ADD COLUMN "privacyRequestId" TEXT;
ALTER TABLE "DataDeletionRequest" ADD COLUMN "lifecycle" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED';
ALTER TABLE "DataDeletionRequest" ADD COLUMN "subjectClass" TEXT;
ALTER TABLE "DataDeletionRequest" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "DataDeletionRequest" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "DataDeletionRequest" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "DataDeletionRequest" ADD COLUMN "planJson" JSONB;
ALTER TABLE "DataDeletionRequest" ADD COLUMN "planVersion" INTEGER;
ALTER TABLE "DataDeletionRequest" ADD COLUMN "planHash" TEXT;
ALTER TABLE "DataDeletionRequest" ADD COLUMN "plannedAt" TIMESTAMP(3);
ALTER TABLE "DataDeletionRequest" ADD COLUMN "plannedBy" TEXT;
ALTER TABLE "DataDeletionRequest" ADD COLUMN "executionIdempotencyKey" TEXT;
ALTER TABLE "DataDeletionRequest" ADD COLUMN "executionStartedAt" TIMESTAMP(3);
ALTER TABLE "DataDeletionRequest" ADD COLUMN "blockedReasonCode" TEXT;
ALTER TABLE "DataDeletionRequest" ADD COLUMN "failureCode" TEXT;

-- ── Preflight (fail-closed) ───────────────────────────────────────────────────
-- Abort with CLASSIFICATION COUNTS only (never personal data) if any pre-existing
-- row would be incompatible. No data-repair policy is invented.
DO $$
DECLARE
  n_parentless_active bigint;
  n_governed_unbound  bigint;
  n_plan_missing      bigint;
  n_bad_plan_hash     bigint;
BEGIN
  SELECT count(*) INTO n_parentless_active FROM "DataDeletionRequest"
    WHERE "privacyRequestId" IS NULL
      AND "lifecycle" NOT IN ('REVIEW_REQUIRED','FAILED','CANCELLED');

  SELECT count(*) INTO n_governed_unbound FROM "DataDeletionRequest"
    WHERE "privacyRequestId" IS NOT NULL
      AND ("organizationId" IS NULL OR "userId" IS NULL OR "candidateId" IS NOT NULL
        OR "subjectClass" <> 'USER' OR "idempotencyKey" IS NULL);

  SELECT count(*) INTO n_plan_missing FROM "DataDeletionRequest"
    WHERE "lifecycle" IN ('PLAN_READY','IN_REVIEW','APPROVED','EXECUTION_PENDING','EXECUTING','COMPLETED')
      AND ("planJson" IS NULL OR "planHash" IS NULL OR "planVersion" IS NULL OR "plannedAt" IS NULL);

  SELECT count(*) INTO n_bad_plan_hash FROM "DataDeletionRequest"
    WHERE "planHash" IS NOT NULL AND "planHash" !~ '^[a-f0-9]{64}$';

  IF n_parentless_active > 0 OR n_governed_unbound > 0 OR n_plan_missing > 0 OR n_bad_plan_hash > 0 THEN
    RAISE EXCEPTION 'Phase97 governed subject erasure preflight failed (no data-repair policy is invented; resolve before applying): parentless_active=% governed_unbound=% plan_missing=% invalid_plan_hash=%',
      n_parentless_active, n_governed_unbound, n_plan_missing, n_bad_plan_hash;
  END IF;
END $$;

-- Closed lifecycle vocabulary at the database layer.
ALTER TABLE "DataDeletionRequest" ADD CONSTRAINT "DataDeletionRequest_lifecycle_check"
  CHECK ("lifecycle" IN ('REVIEW_REQUIRED','REQUESTED','PLANNING','PLAN_READY','IN_REVIEW','APPROVED','EXECUTION_PENDING','EXECUTING','COMPLETED','BLOCKED','FAILED','REJECTED','CANCELLED'));

-- A parentless (legacy/quarantine) row may hold ONLY a non-governed state.
ALTER TABLE "DataDeletionRequest" ADD CONSTRAINT "DataDeletionRequest_parentless_state_check"
  CHECK ("privacyRequestId" IS NOT NULL OR "lifecycle" IN ('REVIEW_REQUIRED','FAILED','CANCELLED'));

-- A job WITH a parent link must be a fully-bound USER job.
ALTER TABLE "DataDeletionRequest" ADD CONSTRAINT "DataDeletionRequest_governed_check"
  CHECK ("privacyRequestId" IS NULL OR (
    "organizationId" IS NOT NULL AND "userId" IS NOT NULL AND "candidateId" IS NULL
    AND "subjectClass" = 'USER' AND "idempotencyKey" IS NOT NULL));

-- Lifecycle at/after APPROVED requires approval attribution.
ALTER TABLE "DataDeletionRequest" ADD CONSTRAINT "DataDeletionRequest_approval_check"
  CHECK ("lifecycle" NOT IN ('APPROVED','EXECUTION_PENDING','EXECUTING','COMPLETED')
    OR ("approvedBy" IS NOT NULL AND "approvedAt" IS NOT NULL));

-- A plan-bearing lifecycle requires a durable, hashed plan snapshot.
ALTER TABLE "DataDeletionRequest" ADD CONSTRAINT "DataDeletionRequest_plan_evidence_check"
  CHECK ("lifecycle" NOT IN ('PLAN_READY','IN_REVIEW','APPROVED','EXECUTION_PENDING','EXECUTING','COMPLETED')
    OR ("planJson" IS NOT NULL AND "planHash" IS NOT NULL AND "planVersion" IS NOT NULL AND "plannedAt" IS NOT NULL));

-- Execution-armed lifecycle requires an execution idempotency key.
ALTER TABLE "DataDeletionRequest" ADD CONSTRAINT "DataDeletionRequest_execution_idem_check"
  CHECK ("lifecycle" NOT IN ('EXECUTION_PENDING','EXECUTING','COMPLETED') OR "executionIdempotencyKey" IS NOT NULL);

-- planHash must be a valid SHA-256 hex digest.
ALTER TABLE "DataDeletionRequest" ADD CONSTRAINT "DataDeletionRequest_plan_hash_format_check"
  CHECK ("planHash" IS NULL OR "planHash" ~ '^[a-f0-9]{64}$');

-- At most one ACTIVE governed job per parent PrivacyRequest (legacy rows have a NULL
-- privacyRequestId and are outside the index).
CREATE UNIQUE INDEX "DataDeletionRequest_active_parent_key"
  ON "DataDeletionRequest" ("privacyRequestId")
  WHERE ("privacyRequestId" IS NOT NULL AND "lifecycle" IN ('REQUESTED','PLANNING','PLAN_READY','IN_REVIEW','APPROVED','EXECUTION_PENDING','EXECUTING'));

-- CreateIndex
CREATE INDEX "DataDeletionRequest_organizationId_lifecycle_idx" ON "DataDeletionRequest" ("organizationId", "lifecycle");
CREATE INDEX "DataDeletionRequest_privacyRequestId_idx" ON "DataDeletionRequest" ("privacyRequestId");

-- AddForeignKey: composite authoritative parent binding. MATCH SIMPLE enforces it
-- only when all three columns are non-null — exactly the governed jobs — so a legacy
-- row (privacyRequestId NULL) is exempt, and a governed job can neither be orphaned
-- nor claim a foreign parent org/user. RESTRICT: a governed child blocks deletion of
-- its parent (evidence is never silently orphaned).
ALTER TABLE "DataDeletionRequest" ADD CONSTRAINT "DataDeletionRequest_parent_tuple_fkey"
  FOREIGN KEY ("privacyRequestId", "organizationId", "userId")
  REFERENCES "PrivacyRequest" ("id", "organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
