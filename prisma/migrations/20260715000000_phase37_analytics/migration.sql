-- Phase 37: Time Series Analytics Engine
-- Additive migration: 3 new tables, no changes to existing tables.

CREATE TABLE "AnalyticsSnapshot" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId"         TEXT,
    "assetId"        TEXT,
    "metric"         TEXT NOT NULL,
    "period"         TEXT NOT NULL,
    "value"          DOUBLE PRECISION NOT NULL,
    "metadata"       JSONB NOT NULL DEFAULT '{}',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KPIRecord" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId"         TEXT,
    "assetId"        TEXT,
    "kpiName"        TEXT NOT NULL,
    "value"          DOUBLE PRECISION NOT NULL,
    "period"         TEXT NOT NULL,
    "calculatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KPIRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetHealthHistory" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId"        TEXT NOT NULL,
    "healthScore"    DOUBLE PRECISION NOT NULL,
    "healthStatus"   TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetHealthHistory_pkey" PRIMARY KEY ("id")
);

-- Indexes optimised for analytics time-range queries
CREATE INDEX "AnalyticsSnapshot_organizationId_assetId_createdAt_idx"
    ON "AnalyticsSnapshot"("organizationId", "assetId", "createdAt");
CREATE INDEX "AnalyticsSnapshot_organizationId_metric_createdAt_idx"
    ON "AnalyticsSnapshot"("organizationId", "metric", "createdAt");

CREATE INDEX "KPIRecord_organizationId_kpiName_calculatedAt_idx"
    ON "KPIRecord"("organizationId", "kpiName", "calculatedAt");
CREATE INDEX "KPIRecord_organizationId_assetId_calculatedAt_idx"
    ON "KPIRecord"("organizationId", "assetId", "calculatedAt");

CREATE INDEX "AssetHealthHistory_organizationId_assetId_createdAt_idx"
    ON "AssetHealthHistory"("organizationId", "assetId", "createdAt");

-- FK to Organization (ON DELETE CASCADE — analytics records are org-owned)
ALTER TABLE "AnalyticsSnapshot"
    ADD CONSTRAINT "AnalyticsSnapshot_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KPIRecord"
    ADD CONSTRAINT "KPIRecord_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssetHealthHistory"
    ADD CONSTRAINT "AssetHealthHistory_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
