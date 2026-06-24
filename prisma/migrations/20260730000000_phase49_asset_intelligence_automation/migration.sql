-- Phase 49: Asset Intelligence Automation
-- Adds AssetAlert and AssetIntelligenceSnapshot tables.
-- Safe to run on a live database — only CREATE statements, no ALTER to existing tables.

CREATE TYPE "AssetAlertType" AS ENUM (
  'CRITICAL_RISK',
  'HEALTH_DEGRADATION',
  'COMMUNICATION_FAILURE',
  'KNOWLEDGE_COVERAGE_LOW'
);

CREATE TYPE "AssetAlertSeverity" AS ENUM (
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW'
);

CREATE TABLE "AssetAlert" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId"        TEXT NOT NULL,
    "alertType"      "AssetAlertType" NOT NULL,
    "severity"       "AssetAlertSeverity" NOT NULL,
    "title"          TEXT NOT NULL,
    "description"    TEXT NOT NULL,
    "metadata"       JSONB NOT NULL DEFAULT '{}',
    "dismissed"      BOOLEAN NOT NULL DEFAULT false,
    "dismissedAt"    TIMESTAMP(3),
    "dismissedBy"    TEXT,
    "resolvedAt"     TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetIntelligenceSnapshot" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId"        TEXT NOT NULL,
    "riskScore"      DOUBLE PRECISION,
    "riskLevel"      TEXT NOT NULL DEFAULT 'UNKNOWN',
    "healthScore"    DOUBLE PRECISION,
    "healthStatus"   TEXT NOT NULL DEFAULT 'unknown',
    "healthTrend"    TEXT NOT NULL DEFAULT 'unknown',
    "tagCount"       INT  NOT NULL DEFAULT 0,
    "knowledgeTotal" INT  NOT NULL DEFAULT 0,
    "deltaRiskScore" DOUBLE PRECISION,
    "deltaHealth"    DOUBLE PRECISION,
    "metadata"       JSONB NOT NULL DEFAULT '{}',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetIntelligenceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssetAlert_organizationId_assetId_createdAt_idx"
    ON "AssetAlert"("organizationId", "assetId", "createdAt");
CREATE INDEX "AssetAlert_organizationId_alertType_createdAt_idx"
    ON "AssetAlert"("organizationId", "alertType", "createdAt");
CREATE INDEX "AssetAlert_organizationId_dismissed_createdAt_idx"
    ON "AssetAlert"("organizationId", "dismissed", "createdAt");
CREATE INDEX "AssetIntelligenceSnapshot_organizationId_assetId_createdAt_idx"
    ON "AssetIntelligenceSnapshot"("organizationId", "assetId", "createdAt");

ALTER TABLE "AssetAlert"
    ADD CONSTRAINT "AssetAlert_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssetIntelligenceSnapshot"
    ADD CONSTRAINT "AssetIntelligenceSnapshot_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
