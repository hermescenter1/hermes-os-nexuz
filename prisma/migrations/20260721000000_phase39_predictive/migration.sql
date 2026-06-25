-- Phase 39: Predictive Maintenance Engine
-- Additive migration: 3 new enums + 5 new tables. No changes to existing tables.
-- SAFETY: Predictive engine is READ/OBSERVE/ESTIMATE ONLY. No PLC write path.
-- DETERMINISTIC: No ML, no AI, no LLM. All formulas are rule-based and auditable.
-- DATA GATE: Engines refuse to compute when insufficient history exists.
-- UNCERTAINTY: RUL is a [minDays, maxDays] range — never a false-precise point.

-- ── Enums ─────────────────────────────────────────────────────────────────────

CREATE TYPE "PredictiveConfidence" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH'
);

CREATE TYPE "DegradationClass" AS ENUM (
    'IMPROVING',
    'STABLE',
    'DEGRADING',
    'RAPIDLY_DEGRADING',
    'INSUFFICIENT_DATA'
);

CREATE TYPE "FailureProbabilityLevel" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'INSUFFICIENT_DATA'
);

-- ── AssetBaseline ─────────────────────────────────────────────────────────────
-- Historical average statistics per asset over a configurable window
-- (30 / 90 / 180 days). Cannot be built without meeting the data-sufficiency
-- gate (MIN_HEALTH_POINTS_FOR_DEGRADATION + MIN_HISTORY_DAYS_FOR_DEGRADATION).

CREATE TABLE "AssetBaseline" (
    "id"                TEXT           NOT NULL,
    "organizationId"    TEXT           NOT NULL,
    "assetId"           TEXT           NOT NULL,
    "windowDays"        INTEGER        NOT NULL,
    "avgHealthScore"    DOUBLE PRECISION,
    "stdDevHealthScore" DOUBLE PRECISION,
    "avgEfficiency"     DOUBLE PRECISION,
    "avgAvailability"   DOUBLE PRECISION,
    "avgRuntime"        DOUBLE PRECISION,
    "avgDowntime"       DOUBLE PRECISION,
    "avgAlarmRate"      DOUBLE PRECISION,
    "sampleCount"       INTEGER        NOT NULL,
    "coverageDays"      DOUBLE PRECISION NOT NULL,
    "createdAt"         TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3)   NOT NULL,
    "metadata"          JSONB          NOT NULL DEFAULT '{}',
    CONSTRAINT "AssetBaseline_pkey" PRIMARY KEY ("id")
);

-- ── AssetRiskScore ────────────────────────────────────────────────────────────
-- Persisted composite risk score (0–100) per asset. Breakdown columns record
-- the contribution of each sub-score for full auditability.

CREATE TABLE "AssetRiskScore" (
    "id"                   TEXT                   NOT NULL,
    "organizationId"       TEXT                   NOT NULL,
    "assetId"              TEXT                   NOT NULL,
    "riskScore"            DOUBLE PRECISION       NOT NULL,
    "confidence"           "PredictiveConfidence" NOT NULL,
    "healthTrendScore"     DOUBLE PRECISION       NOT NULL,
    "alarmTrendScore"      DOUBLE PRECISION       NOT NULL,
    "kpiDegradationScore"  DOUBLE PRECISION       NOT NULL,
    "telQualityScore"      DOUBLE PRECISION       NOT NULL,
    "telFreshnessScore"    DOUBLE PRECISION       NOT NULL,
    "criticalityFactor"    DOUBLE PRECISION       NOT NULL,
    "createdAt"            TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata"             JSONB                  NOT NULL DEFAULT '{}',
    CONSTRAINT "AssetRiskScore_pkey" PRIMARY KEY ("id")
);

-- ── FailureIndicator ──────────────────────────────────────────────────────────
-- Failure probability classification at a point in time. Uses enum levels
-- rather than raw floats — deterministic classification is more defensible.

CREATE TABLE "FailureIndicator" (
    "id"               TEXT                      NOT NULL,
    "organizationId"   TEXT                      NOT NULL,
    "assetId"          TEXT                      NOT NULL,
    "probability"      "FailureProbabilityLevel" NOT NULL,
    "confidence"       "PredictiveConfidence"    NOT NULL,
    "riskScore"        DOUBLE PRECISION          NOT NULL,
    "degradationClass" "DegradationClass"        NOT NULL,
    "alarmTrend"       TEXT                      NOT NULL,
    "healthTrend"      TEXT                      NOT NULL,
    "evidence"         JSONB                     NOT NULL DEFAULT '[]',
    "createdAt"        TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata"         JSONB                     NOT NULL DEFAULT '{}',
    CONSTRAINT "FailureIndicator_pkey" PRIMARY KEY ("id")
);

-- ── RULSnapshot ───────────────────────────────────────────────────────────────
-- Remaining Useful Life estimate stored as range [minDays, maxDays] to reflect
-- projection uncertainty. state encodes special conditions (no_degradation,
-- at_threshold, insufficientData). Never returns negative values.

CREATE TABLE "RULSnapshot" (
    "id"               TEXT                   NOT NULL,
    "organizationId"   TEXT                   NOT NULL,
    "assetId"          TEXT                   NOT NULL,
    "state"            TEXT                   NOT NULL,
    "minDays"          DOUBLE PRECISION,
    "maxDays"          DOUBLE PRECISION,
    "currentScore"     DOUBLE PRECISION,
    "degradationRate"  DOUBLE PRECISION,
    "degradationClass" "DegradationClass"     NOT NULL,
    "confidence"       "PredictiveConfidence" NOT NULL,
    "createdAt"        TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata"         JSONB                  NOT NULL DEFAULT '{}',
    CONSTRAINT "RULSnapshot_pkey" PRIMARY KEY ("id")
);

-- ── MaintenanceRecommendation ─────────────────────────────────────────────────
-- Maintenance action recommended by the PM engine. Read-only outputs only.
-- No autonomous action. evidence and evidenceRecordIds link to real record IDs
-- for full traceability. dismissed = true means the operator has acknowledged.

CREATE TABLE "MaintenanceRecommendation" (
    "id"                 TEXT                   NOT NULL,
    "organizationId"     TEXT                   NOT NULL,
    "assetId"            TEXT                   NOT NULL,
    "recommendationType" TEXT                   NOT NULL,
    "priority"           TEXT                   NOT NULL DEFAULT 'MEDIUM',
    "title"              TEXT                   NOT NULL,
    "description"        TEXT                   NOT NULL,
    "confidence"         "PredictiveConfidence" NOT NULL,
    "evidence"           JSONB                  NOT NULL DEFAULT '[]',
    "evidenceRecordIds"  JSONB                  NOT NULL DEFAULT '[]',
    "dismissed"          BOOLEAN                NOT NULL DEFAULT false,
    "createdAt"          TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3)           NOT NULL,
    "metadata"           JSONB                  NOT NULL DEFAULT '{}',
    CONSTRAINT "MaintenanceRecommendation_pkey" PRIMARY KEY ("id")
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX "AssetBaseline_organizationId_assetId_createdAt_idx"
    ON "AssetBaseline"("organizationId", "assetId", "createdAt");

CREATE INDEX "AssetRiskScore_organizationId_assetId_createdAt_idx"
    ON "AssetRiskScore"("organizationId", "assetId", "createdAt");

CREATE INDEX "FailureIndicator_organizationId_assetId_createdAt_idx"
    ON "FailureIndicator"("organizationId", "assetId", "createdAt");

CREATE INDEX "RULSnapshot_organizationId_assetId_createdAt_idx"
    ON "RULSnapshot"("organizationId", "assetId", "createdAt");

CREATE INDEX "MaintenanceRecommendation_organizationId_assetId_createdAt_idx"
    ON "MaintenanceRecommendation"("organizationId", "assetId", "createdAt");

-- ── Foreign keys ──────────────────────────────────────────────────────────────

ALTER TABLE "AssetBaseline"
    ADD CONSTRAINT "AssetBaseline_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssetRiskScore"
    ADD CONSTRAINT "AssetRiskScore_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FailureIndicator"
    ADD CONSTRAINT "FailureIndicator_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RULSnapshot"
    ADD CONSTRAINT "RULSnapshot_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MaintenanceRecommendation"
    ADD CONSTRAINT "MaintenanceRecommendation_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
