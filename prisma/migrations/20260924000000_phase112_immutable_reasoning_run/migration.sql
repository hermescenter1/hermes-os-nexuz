-- PHASE 112 — IMMUTABLE REASONING RUN + EXACT REPLAY
--
-- Additive, forward-only migration. It creates three new tables plus their
-- enums and adds NO change to any existing table. Everything Prisma can express
-- lives in schema.prisma and is generated below (sections 1–4); the constructs
-- Prisma CANNOT express (CHECK constraints and immutability triggers) are
-- appended in sections 5–6 and machine-pinned by:
--   prisma/__tests__/phase112-schema-sql-parity.test.ts
--
-- IMMUTABILITY MODEL
--   - Run / artifact / replay CONTENT is never editable: a BEFORE UPDATE trigger
--     rejects every UPDATE on the three tables (section 6).
--   - Rows remain DELETABLE so a governed retention/privacy path (and ordinary
--     tenant/org lifecycle cascades) can erase them. The application repository
--     exposes NO delete of its own — deletion is a governed operation only.
--     This satisfies "immutable = append-only + non-editable WHILE RETAINED"
--     without making lawful retention deletion impossible.
--
-- ROLLBACK (manual, destructive — never run against production without approval)
--   DROP TRIGGER IF EXISTS reasoning_run_no_update_trg ON "ReasoningRun";
--   DROP TRIGGER IF EXISTS reasoning_run_artifact_no_update_trg ON "ReasoningRunArtifact";
--   DROP TRIGGER IF EXISTS reasoning_replay_attempt_no_update_trg ON "ReasoningReplayAttempt";
--   DROP FUNCTION IF EXISTS reasoning_run_reject_update();
--   DROP FUNCTION IF EXISTS reasoning_run_artifact_reject_update();
--   DROP FUNCTION IF EXISTS reasoning_replay_attempt_reject_update();
--   DROP TABLE IF EXISTS "ReasoningReplayAttempt";
--   DROP TABLE IF EXISTS "ReasoningRunArtifact";
--   DROP TABLE IF EXISTS "ReasoningRun";
--   DROP TYPE IF EXISTS "ReasoningReplayOutcome";
--   DROP TYPE IF EXISTS "ReasoningReplayEngineAvailability";
--   DROP TYPE IF EXISTS "ReasoningReplayMode";
--   DROP TYPE IF EXISTS "ReasoningRunArtifactKind";
--   DROP TYPE IF EXISTS "ReasoningRunStatus";
--   DROP TYPE IF EXISTS "ReasoningRunSourceChannel";
--   (No existing table is touched, so rollback removes only the Phase 112 objects.)

-- ── 1. Enums ──────────────────────────────────────────────────────────────────
-- CreateEnum
CREATE TYPE "ReasoningRunSourceChannel" AS ENUM ('INTERACTIVE', 'TELEMETRY', 'ALARM', 'EVIDENCE_UPDATE', 'REPLAY');

-- CreateEnum
CREATE TYPE "ReasoningRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReasoningRunArtifactKind" AS ENUM ('RAW_INPUT', 'NORMALIZED_INPUT', 'EVIDENCE', 'ENGINE_MANIFEST', 'ANALYSIS_OUTPUT', 'REASONING_MAP', 'UNCERTAINTY', 'SAFE_ACTION', 'HUMAN_DECISION');

-- CreateEnum
CREATE TYPE "ReasoningReplayMode" AS ENUM ('ARCHIVAL', 'EXECUTION');

-- CreateEnum
CREATE TYPE "ReasoningReplayEngineAvailability" AS ENUM ('AVAILABLE', 'ENGINE_VERSION_UNAVAILABLE', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "ReasoningReplayOutcome" AS ENUM ('MATCH', 'MISMATCH', 'ARCHIVAL_VERIFIED', 'ENGINE_VERSION_UNAVAILABLE', 'INTEGRITY_FAILURE');

-- ── 2. Tables ─────────────────────────────────────────────────────────────────
-- CreateTable
CREATE TABLE "ReasoningRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT,
    "assetId" TEXT,
    "initiatedByUserId" TEXT,
    "sourceChannel" "ReasoningRunSourceChannel" NOT NULL,
    "status" "ReasoningRunStatus" NOT NULL,
    "engineId" VARCHAR(120) NOT NULL,
    "engineVersion" VARCHAR(64) NOT NULL,
    "rulePackVersion" VARCHAR(64) NOT NULL,
    "caseCorpusVersion" VARCHAR(64),
    "caseCorpusChecksum" VARCHAR(64),
    "graphRevision" INTEGER,
    "graphChecksum" VARCHAR(64),
    "documentCorpusChecksum" VARCHAR(64),
    "modelProvider" VARCHAR(120),
    "modelVersion" VARCHAR(120),
    "modelConfigVersion" VARCHAR(120),
    "schemaVersion" VARCHAR(16) NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "requestFingerprint" VARCHAR(64) NOT NULL,
    "parentRunId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "inputDigest" VARCHAR(64) NOT NULL,
    "outputDigest" VARCHAR(64) NOT NULL,
    "manifestDigest" VARCHAR(64) NOT NULL,
    "errorClass" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReasoningRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReasoningRunArtifact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" "ReasoningRunArtifactKind" NOT NULL,
    "schemaVersion" VARCHAR(16) NOT NULL,
    "payload" JSONB NOT NULL,
    "digest" VARCHAR(64) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReasoningRunArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReasoningReplayAttempt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "mode" "ReasoningReplayMode" NOT NULL,
    "requestedEngineVersion" VARCHAR(64),
    "engineAvailability" "ReasoningReplayEngineAvailability" NOT NULL,
    "outcome" "ReasoningReplayOutcome" NOT NULL,
    "originalOutputDigest" VARCHAR(64) NOT NULL,
    "replayedOutputDigest" VARCHAR(64),
    "mismatchSummary" VARCHAR(2000),
    "correlationId" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReasoningReplayAttempt_pkey" PRIMARY KEY ("id")
);

-- ── 3. Indexes ────────────────────────────────────────────────────────────────
-- CreateIndex
CREATE INDEX "ReasoningRun_organizationId_createdAt_idx" ON "ReasoningRun"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ReasoningRun_organizationId_siteId_idx" ON "ReasoningRun"("organizationId", "siteId");

-- CreateIndex
CREATE INDEX "ReasoningRun_organizationId_assetId_idx" ON "ReasoningRun"("organizationId", "assetId");

-- CreateIndex
CREATE INDEX "ReasoningRun_organizationId_engineId_engineVersion_idx" ON "ReasoningRun"("organizationId", "engineId", "engineVersion");

-- CreateIndex
CREATE INDEX "ReasoningRun_organizationId_parentRunId_idx" ON "ReasoningRun"("organizationId", "parentRunId");

-- CreateIndex
CREATE UNIQUE INDEX "ReasoningRun_organizationId_id_key" ON "ReasoningRun"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ReasoningRun_organizationId_idempotencyKey_key" ON "ReasoningRun"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ReasoningRunArtifact_organizationId_runId_idx" ON "ReasoningRunArtifact"("organizationId", "runId");

-- CreateIndex
CREATE UNIQUE INDEX "ReasoningRunArtifact_organizationId_runId_kind_key" ON "ReasoningRunArtifact"("organizationId", "runId", "kind");

-- CreateIndex
CREATE INDEX "ReasoningReplayAttempt_organizationId_runId_createdAt_idx" ON "ReasoningReplayAttempt"("organizationId", "runId", "createdAt");

-- ── 4. Foreign keys ───────────────────────────────────────────────────────────
-- AddForeignKey
ALTER TABLE "ReasoningRun" ADD CONSTRAINT "ReasoningRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReasoningRun" ADD CONSTRAINT "ReasoningRun_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "IndustrialSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReasoningRun" ADD CONSTRAINT "ReasoningRun_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "IndustrialAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReasoningRun" ADD CONSTRAINT "ReasoningRun_parent_tenant_fkey" FOREIGN KEY ("organizationId", "parentRunId") REFERENCES "ReasoningRun"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ReasoningRunArtifact" ADD CONSTRAINT "ReasoningRunArtifact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReasoningRunArtifact" ADD CONSTRAINT "ReasoningRunArtifact_run_tenant_fkey" FOREIGN KEY ("organizationId", "runId") REFERENCES "ReasoningRun"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReasoningReplayAttempt" ADD CONSTRAINT "ReasoningReplayAttempt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReasoningReplayAttempt" ADD CONSTRAINT "ReasoningReplayAttempt_run_tenant_fkey" FOREIGN KEY ("organizationId", "runId") REFERENCES "ReasoningRun"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 5. CHECK constraints (MIGRATION-ONLY — Prisma cannot express CHECK) ─────────
-- Digests are lowercase SHA-256 hex. Nullable checksum/replay columns are NULL or hex.
ALTER TABLE "ReasoningRun"
  ADD CONSTRAINT "ReasoningRun_requestFingerprint_sha256_check" CHECK ("requestFingerprint" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "ReasoningRun_inputDigest_sha256_check" CHECK ("inputDigest" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "ReasoningRun_outputDigest_sha256_check" CHECK ("outputDigest" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "ReasoningRun_manifestDigest_sha256_check" CHECK ("manifestDigest" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "ReasoningRun_caseCorpusChecksum_sha256_check" CHECK ("caseCorpusChecksum" IS NULL OR "caseCorpusChecksum" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "ReasoningRun_graphChecksum_sha256_check" CHECK ("graphChecksum" IS NULL OR "graphChecksum" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "ReasoningRun_documentCorpusChecksum_sha256_check" CHECK ("documentCorpusChecksum" IS NULL OR "documentCorpusChecksum" ~ '^[0-9a-f]{64}$'),
  -- Terminal-state consistency: a persisted run is COMPLETED or FAILED with a
  -- completion timestamp; FAILED carries an error class, COMPLETED does not.
  ADD CONSTRAINT "ReasoningRun_terminal_state_check" CHECK (
    ("status" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "errorClass" IS NULL)
    OR ("status" = 'FAILED' AND "completedAt" IS NOT NULL AND "errorClass" IS NOT NULL)
    OR ("status" IN ('PENDING', 'RUNNING'))
  );

ALTER TABLE "ReasoningRunArtifact"
  ADD CONSTRAINT "ReasoningRunArtifact_digest_sha256_check" CHECK ("digest" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "ReasoningRunArtifact_byteSize_positive_check" CHECK ("byteSize" > 0);

ALTER TABLE "ReasoningReplayAttempt"
  ADD CONSTRAINT "ReasoningReplayAttempt_originalOutputDigest_sha256_check" CHECK ("originalOutputDigest" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "ReasoningReplayAttempt_replayedOutputDigest_sha256_check" CHECK ("replayedOutputDigest" IS NULL OR "replayedOutputDigest" ~ '^[0-9a-f]{64}$');

-- ── 6. Immutability triggers (MIGRATION-ONLY — content is never editable) ───────
-- UPDATE is rejected on all three tables. DELETE is intentionally NOT blocked so
-- a governed retention/privacy path and ordinary org/tenant cascades can erase
-- rows; the application repository never issues those deletes on its own.
CREATE OR REPLACE FUNCTION reasoning_run_reject_update()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ReasoningRun is immutable; UPDATE is not permitted (append-only reasoning ledger)';
END $$;
CREATE TRIGGER reasoning_run_no_update_trg
  BEFORE UPDATE ON "ReasoningRun"
  FOR EACH ROW EXECUTE FUNCTION reasoning_run_reject_update();

CREATE OR REPLACE FUNCTION reasoning_run_artifact_reject_update()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ReasoningRunArtifact is immutable; UPDATE is not permitted (append-only reasoning ledger)';
END $$;
CREATE TRIGGER reasoning_run_artifact_no_update_trg
  BEFORE UPDATE ON "ReasoningRunArtifact"
  FOR EACH ROW EXECUTE FUNCTION reasoning_run_artifact_reject_update();

CREATE OR REPLACE FUNCTION reasoning_replay_attempt_reject_update()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ReasoningReplayAttempt is append-only; UPDATE is not permitted';
END $$;
CREATE TRIGGER reasoning_replay_attempt_no_update_trg
  BEFORE UPDATE ON "ReasoningReplayAttempt"
  FOR EACH ROW EXECUTE FUNCTION reasoning_replay_attempt_reject_update();
