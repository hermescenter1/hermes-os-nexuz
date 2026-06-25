-- Phase 42: Multi-Site Industrial Intelligence
--
-- ACCESS MODEL: Organization-level only. All sites within an org are included.
-- Site-level RBAC is a Phase 43/44 hardening requirement.
--
-- SNAPSHOT LIFECYCLE: MultiSiteBenchmark.status RUNNING → SUCCESS | FAILED.
-- Child tables (SiteRiskSnapshot, SiteKPIComparison, CrossSiteFailurePattern)
-- are written atomically within the same transaction as the SUCCESS update.
--
-- KPI NORMALIZATION:
--   availability + efficiency + healthScore stored as 0–100 rates (means).
--   runtime/downtime counts excluded — not rate-normalized for cross-site use.
--
-- FAILURE PATTERN CRITERION (deterministic):
--   Same IndustrialFailureMode.id in IndustrialEngineeringCase rows with 2+
--   distinct non-null siteId values. No fuzzy matching, no ML.
--
-- ADDITIVE ONLY: no Phase 29–41 tables are modified.

CREATE TYPE "MultiSiteSnapshotStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- ── MultiSiteBenchmark ────────────────────────────────────────────────────────

CREATE TABLE "MultiSiteBenchmark" (
    "id"             TEXT         NOT NULL,
    "organizationId" TEXT         NOT NULL,
    "status"         "MultiSiteSnapshotStatus" NOT NULL DEFAULT 'SUCCESS',
    "periodLabel"    TEXT         NOT NULL,
    "siteCount"      INTEGER      NOT NULL,
    "summary"        JSONB        NOT NULL DEFAULT '{}',
    "errorMessage"   TEXT,
    "startedAt"      TIMESTAMP(3),
    "completedAt"    TIMESTAMP(3),
    "computedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MultiSiteBenchmark_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MultiSiteBenchmark"
    ADD CONSTRAINT "MultiSiteBenchmark_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "MultiSiteBenchmark_organizationId_computedAt_idx"
    ON "MultiSiteBenchmark" ("organizationId", "computedAt");
CREATE INDEX "MultiSiteBenchmark_organizationId_status_idx"
    ON "MultiSiteBenchmark" ("organizationId", "status");

-- ── SiteRiskSnapshot ──────────────────────────────────────────────────────────
--
-- avgRiskScore = MEAN of latest AssetRiskScore across qualifying assets.
-- maxRiskScore = worst single asset risk (for operational awareness).
-- null = dataStatus="insufficientData" (no qualifying assets).
-- riskDistribution = { "LOW": n, "MEDIUM": n, "HIGH": n }.

CREATE TABLE "SiteRiskSnapshot" (
    "id"                TEXT         NOT NULL,
    "organizationId"    TEXT         NOT NULL,
    "benchmarkId"       TEXT         NOT NULL,
    "siteId"            TEXT         NOT NULL,
    "siteName"          TEXT         NOT NULL,
    "assetCount"        INTEGER      NOT NULL,
    "assetsWithData"    INTEGER      NOT NULL,
    "avgRiskScore"      DOUBLE PRECISION,
    "maxRiskScore"      DOUBLE PRECISION,
    "minRiskScore"      DOUBLE PRECISION,
    "riskDistribution"  JSONB        NOT NULL DEFAULT '{}',
    "dataStatus"        TEXT         NOT NULL,
    "confidence"        TEXT         NOT NULL,
    "lastDataTimestamp" TIMESTAMP(3),
    "computedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SiteRiskSnapshot_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SiteRiskSnapshot"
    ADD CONSTRAINT "SiteRiskSnapshot_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteRiskSnapshot"
    ADD CONSTRAINT "SiteRiskSnapshot_benchmarkId_fkey"
    FOREIGN KEY ("benchmarkId") REFERENCES "MultiSiteBenchmark"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "SiteRiskSnapshot_organizationId_computedAt_idx"
    ON "SiteRiskSnapshot" ("organizationId", "computedAt");
CREATE INDEX "SiteRiskSnapshot_benchmarkId_idx"
    ON "SiteRiskSnapshot" ("benchmarkId");

-- ── SiteKPIComparison ─────────────────────────────────────────────────────────
--
-- avgAvailability / avgEfficiency / avgHealthScore: 0–100 rate means.
-- All directly comparable across sites of different sizes.
-- null = dataStatus="insufficientData".

CREATE TABLE "SiteKPIComparison" (
    "id"                TEXT         NOT NULL,
    "organizationId"    TEXT         NOT NULL,
    "benchmarkId"       TEXT         NOT NULL,
    "siteId"            TEXT         NOT NULL,
    "siteName"          TEXT         NOT NULL,
    "periodLabel"       TEXT         NOT NULL,
    "avgAvailability"   DOUBLE PRECISION,
    "avgEfficiency"     DOUBLE PRECISION,
    "avgHealthScore"    DOUBLE PRECISION,
    "assetCount"        INTEGER      NOT NULL,
    "assetsWithKpiData" INTEGER      NOT NULL,
    "dataStatus"        TEXT         NOT NULL,
    "lastDataTimestamp" TIMESTAMP(3),
    "computedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SiteKPIComparison_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SiteKPIComparison"
    ADD CONSTRAINT "SiteKPIComparison_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteKPIComparison"
    ADD CONSTRAINT "SiteKPIComparison_benchmarkId_fkey"
    FOREIGN KEY ("benchmarkId") REFERENCES "MultiSiteBenchmark"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "SiteKPIComparison_organizationId_computedAt_idx"
    ON "SiteKPIComparison" ("organizationId", "computedAt");
CREATE INDEX "SiteKPIComparison_benchmarkId_idx"
    ON "SiteKPIComparison" ("benchmarkId");

-- ── CrossSiteFailurePattern ───────────────────────────────────────────────────
--
-- Deterministic: same DB state → same patterns. No ML, no fuzzy matching.
-- Criterion: same failureModeId in IndustrialEngineeringCase across 2+ sites.
-- siteIds / affectedAssetTypes / evidence are JSONB arrays.

CREATE TABLE "CrossSiteFailurePattern" (
    "id"                 TEXT         NOT NULL,
    "organizationId"     TEXT         NOT NULL,
    "benchmarkId"        TEXT         NOT NULL,
    "failureModeId"      TEXT         NOT NULL,
    "failureModeName"    TEXT         NOT NULL,
    "severity"           TEXT         NOT NULL,
    "siteIds"            JSONB        NOT NULL,
    "siteCount"          INTEGER      NOT NULL,
    "caseCount"          INTEGER      NOT NULL,
    "affectedAssetTypes" JSONB        NOT NULL,
    "evidence"           JSONB        NOT NULL DEFAULT '{}',
    "computedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrossSiteFailurePattern_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CrossSiteFailurePattern"
    ADD CONSTRAINT "CrossSiteFailurePattern_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrossSiteFailurePattern"
    ADD CONSTRAINT "CrossSiteFailurePattern_benchmarkId_fkey"
    FOREIGN KEY ("benchmarkId") REFERENCES "MultiSiteBenchmark"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CrossSiteFailurePattern_organizationId_computedAt_idx"
    ON "CrossSiteFailurePattern" ("organizationId", "computedAt");
CREATE INDEX "CrossSiteFailurePattern_benchmarkId_idx"
    ON "CrossSiteFailurePattern" ("benchmarkId");
