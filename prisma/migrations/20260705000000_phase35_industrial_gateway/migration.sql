-- Phase 35: Industrial Edge Gateway Foundation
-- Adds 6 enums and 5 industrial models.
-- SAFETY: Hermes Cloud is READ/OBSERVE only. No write-back command paths to PLCs.

-- ── Enums ─────────────────────────────────────────────────────────────────────

CREATE TYPE "IndustrialSiteStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');
CREATE TYPE "IndustrialGatewayStatus" AS ENUM ('ONLINE', 'OFFLINE', 'DEGRADED', 'REVOKED');
CREATE TYPE "IndustrialAssetType" AS ENUM ('PLC', 'SCADA', 'HMI', 'MOTOR', 'PUMP', 'COMPRESSOR', 'CONVEYOR', 'SENSOR', 'DRIVE', 'PANEL', 'OTHER');
CREATE TYPE "IndustrialProtocol" AS ENUM ('OPC_UA', 'MQTT', 'MODBUS_TCP', 'SIEMENS_S7', 'SCADA', 'HISTORIAN', 'MANUAL', 'OTHER');
CREATE TYPE "TelemetryQuality" AS ENUM ('GOOD', 'BAD', 'UNCERTAIN', 'STALE');
CREATE TYPE "ConnectorType" AS ENUM ('OPC_UA', 'MQTT', 'MODBUS_TCP', 'SIEMENS_S7', 'SCADA', 'HISTORIAN');

-- ── IndustrialSite ────────────────────────────────────────────────────────────

CREATE TABLE "IndustrialSite" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "slug"           TEXT NOT NULL,
    "location"       TEXT,
    "description"    TEXT,
    "status"         "IndustrialSiteStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IndustrialSite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IndustrialSite_organizationId_slug_key" ON "IndustrialSite"("organizationId", "slug");
CREATE INDEX "IndustrialSite_organizationId_idx" ON "IndustrialSite"("organizationId");

ALTER TABLE "IndustrialSite" ADD CONSTRAINT "IndustrialSite_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── IndustrialGateway ─────────────────────────────────────────────────────────

CREATE TABLE "IndustrialGateway" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId"         TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "gatewayId"      TEXT NOT NULL,
    "status"         "IndustrialGatewayStatus" NOT NULL DEFAULT 'OFFLINE',
    "version"        TEXT,
    "apiKeyId"       TEXT,
    "lastSeenAt"     TIMESTAMP(3),
    "metadata"       JSONB NOT NULL DEFAULT '{}',
    "revokedAt"      TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IndustrialGateway_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IndustrialGateway_gatewayId_key" ON "IndustrialGateway"("gatewayId");
CREATE INDEX "IndustrialGateway_organizationId_idx" ON "IndustrialGateway"("organizationId");
CREATE INDEX "IndustrialGateway_siteId_idx"         ON "IndustrialGateway"("siteId");
CREATE INDEX "IndustrialGateway_apiKeyId_idx"        ON "IndustrialGateway"("apiKeyId");

ALTER TABLE "IndustrialGateway" ADD CONSTRAINT "IndustrialGateway_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IndustrialGateway" ADD CONSTRAINT "IndustrialGateway_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "IndustrialSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndustrialGateway" ADD CONSTRAINT "IndustrialGateway_apiKeyId_fkey"
    FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── IndustrialAsset ───────────────────────────────────────────────────────────

CREATE TABLE "IndustrialAsset" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId"         TEXT NOT NULL,
    "gatewayId"      TEXT,
    "name"           TEXT NOT NULL,
    "assetType"      "IndustrialAssetType" NOT NULL DEFAULT 'OTHER',
    "manufacturer"   TEXT,
    "model"          TEXT,
    "protocol"       "IndustrialProtocol" NOT NULL DEFAULT 'OTHER',
    "tagPrefix"      TEXT,
    "status"         TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata"       JSONB NOT NULL DEFAULT '{}',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IndustrialAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IndustrialAsset_organizationId_idx" ON "IndustrialAsset"("organizationId");
CREATE INDEX "IndustrialAsset_siteId_idx"         ON "IndustrialAsset"("siteId");
CREATE INDEX "IndustrialAsset_gatewayId_idx"       ON "IndustrialAsset"("gatewayId");

ALTER TABLE "IndustrialAsset" ADD CONSTRAINT "IndustrialAsset_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IndustrialAsset" ADD CONSTRAINT "IndustrialAsset_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "IndustrialSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndustrialAsset" ADD CONSTRAINT "IndustrialAsset_gatewayId_fkey"
    FOREIGN KEY ("gatewayId") REFERENCES "IndustrialGateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── TelemetryRecord ───────────────────────────────────────────────────────────
-- PARTITION CANDIDATE: partition by receivedAt in Phase 36+.
-- See schema.prisma TelemetryRecord scaling comment for details.

CREATE TABLE "TelemetryRecord" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId"         TEXT NOT NULL,
    "gatewayId"      TEXT NOT NULL,
    "assetId"        TEXT,
    "tag"            TEXT NOT NULL,
    "value"          JSONB NOT NULL,
    "numericValue"   DOUBLE PRECISION,
    "quality"        "TelemetryQuality" NOT NULL DEFAULT 'GOOD',
    "unit"           TEXT,
    "source"         TEXT NOT NULL,
    "timestamp"      TIMESTAMP(3) NOT NULL,
    "receivedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sequenceId"     TEXT,
    CONSTRAINT "TelemetryRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TelemetryRecord_orgId_assetId_ts_idx" ON "TelemetryRecord"("organizationId", "assetId", "timestamp");
CREATE INDEX "TelemetryRecord_gatewayId_ts_idx"      ON "TelemetryRecord"("gatewayId", "timestamp");
CREATE INDEX "TelemetryRecord_orgId_tag_ts_idx"      ON "TelemetryRecord"("organizationId", "tag", "timestamp");
CREATE INDEX "TelemetryRecord_orgId_receivedAt_idx"  ON "TelemetryRecord"("organizationId", "receivedAt");

ALTER TABLE "TelemetryRecord" ADD CONSTRAINT "TelemetryRecord_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelemetryRecord" ADD CONSTRAINT "TelemetryRecord_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "IndustrialSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TelemetryRecord" ADD CONSTRAINT "TelemetryRecord_gatewayId_fkey"
    FOREIGN KEY ("gatewayId") REFERENCES "IndustrialGateway"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TelemetryRecord" ADD CONSTRAINT "TelemetryRecord_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "IndustrialAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── IndustrialConnectorConfig ─────────────────────────────────────────────────

CREATE TABLE "IndustrialConnectorConfig" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId"         TEXT NOT NULL,
    "gatewayId"      TEXT NOT NULL,
    "connectorType"  "ConnectorType" NOT NULL,
    "name"           TEXT NOT NULL,
    "enabled"        BOOLEAN NOT NULL DEFAULT false,
    "config"         JSONB NOT NULL DEFAULT '{}',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IndustrialConnectorConfig_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IndustrialConnectorConfig_organizationId_idx" ON "IndustrialConnectorConfig"("organizationId");
CREATE INDEX "IndustrialConnectorConfig_gatewayId_idx"      ON "IndustrialConnectorConfig"("gatewayId");

ALTER TABLE "IndustrialConnectorConfig" ADD CONSTRAINT "IndustrialConnectorConfig_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IndustrialConnectorConfig" ADD CONSTRAINT "IndustrialConnectorConfig_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "IndustrialSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndustrialConnectorConfig" ADD CONSTRAINT "IndustrialConnectorConfig_gatewayId_fkey"
    FOREIGN KEY ("gatewayId") REFERENCES "IndustrialGateway"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
