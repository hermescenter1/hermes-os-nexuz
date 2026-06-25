-- Phase 36: Digital Twin Engine
-- Adds 2 enums and 4 models: DigitalTwinNode, DigitalTwinRelation,
-- DigitalTwinLayout, AssetTag.
--
-- READ/OBSERVE ONLY: No control-command paths to industrial hardware.

-- ── Enums ─────────────────────────────────────────────────────────────────────

CREATE TYPE "DigitalTwinNodeType" AS ENUM ('SITE', 'AREA', 'LINE', 'CELL', 'ASSET', 'SYSTEM');

-- Direction semantics (enforced in graph traversal code, not SQL):
--   CONNECTED_TO  = bidirectional
--   FEEDS / CONTROLS / PART_OF / MONITORS / BACKUP_FOR = directed (source → target)
CREATE TYPE "DigitalTwinRelationType" AS ENUM (
    'PART_OF', 'CONNECTED_TO', 'CONTROLS', 'MONITORS', 'FEEDS', 'BACKUP_FOR'
);

-- ── DigitalTwinNode ───────────────────────────────────────────────────────────

CREATE TABLE "DigitalTwinNode" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId"         TEXT NOT NULL,
    "assetId"        TEXT,
    "parentNodeId"   TEXT,
    "displayName"    TEXT NOT NULL,
    "nodeType"       "DigitalTwinNodeType" NOT NULL,
    "metadata"       JSONB NOT NULL DEFAULT '{}',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DigitalTwinNode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DigitalTwinNode_organizationId_siteId_idx" ON "DigitalTwinNode"("organizationId", "siteId");
CREATE INDEX "DigitalTwinNode_organizationId_idx"         ON "DigitalTwinNode"("organizationId");
CREATE INDEX "DigitalTwinNode_assetId_idx"                ON "DigitalTwinNode"("assetId");

ALTER TABLE "DigitalTwinNode" ADD CONSTRAINT "DigitalTwinNode_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DigitalTwinNode" ADD CONSTRAINT "DigitalTwinNode_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "IndustrialSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DigitalTwinNode" ADD CONSTRAINT "DigitalTwinNode_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "IndustrialAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DigitalTwinNode" ADD CONSTRAINT "DigitalTwinNode_parentNodeId_fkey"
    FOREIGN KEY ("parentNodeId") REFERENCES "DigitalTwinNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── DigitalTwinRelation ───────────────────────────────────────────────────────

CREATE TABLE "DigitalTwinRelation" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceNodeId"   TEXT NOT NULL,
    "targetNodeId"   TEXT NOT NULL,
    "relationType"   "DigitalTwinRelationType" NOT NULL,
    "metadata"       JSONB NOT NULL DEFAULT '{}',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DigitalTwinRelation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DigitalTwinRelation_src_tgt_type_key" ON "DigitalTwinRelation"("sourceNodeId", "targetNodeId", "relationType");
CREATE INDEX "DigitalTwinRelation_organizationId_sourceNodeId_idx" ON "DigitalTwinRelation"("organizationId", "sourceNodeId");
CREATE INDEX "DigitalTwinRelation_organizationId_targetNodeId_idx" ON "DigitalTwinRelation"("organizationId", "targetNodeId");

ALTER TABLE "DigitalTwinRelation" ADD CONSTRAINT "DigitalTwinRelation_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DigitalTwinRelation" ADD CONSTRAINT "DigitalTwinRelation_sourceNodeId_fkey"
    FOREIGN KEY ("sourceNodeId") REFERENCES "DigitalTwinNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DigitalTwinRelation" ADD CONSTRAINT "DigitalTwinRelation_targetNodeId_fkey"
    FOREIGN KEY ("targetNodeId") REFERENCES "DigitalTwinNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── DigitalTwinLayout ─────────────────────────────────────────────────────────

CREATE TABLE "DigitalTwinLayout" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId"         TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "layoutData"     JSONB NOT NULL DEFAULT '{}',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DigitalTwinLayout_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DigitalTwinLayout_organizationId_siteId_idx" ON "DigitalTwinLayout"("organizationId", "siteId");

ALTER TABLE "DigitalTwinLayout" ADD CONSTRAINT "DigitalTwinLayout_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DigitalTwinLayout" ADD CONSTRAINT "DigitalTwinLayout_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "IndustrialSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── AssetTag ──────────────────────────────────────────────────────────────────
-- tagPath mirrors TelemetryRecord.tag format.
-- @@unique([assetId, tagPath]) prevents duplicate tag registrations per asset.

CREATE TABLE "AssetTag" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId"        TEXT NOT NULL,
    "tagName"        TEXT NOT NULL,
    "tagPath"        TEXT NOT NULL,
    "unit"           TEXT,
    "dataType"       TEXT NOT NULL DEFAULT 'float',
    "description"    TEXT,
    "metadata"       JSONB NOT NULL DEFAULT '{}',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssetTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssetTag_assetId_tagPath_key" ON "AssetTag"("assetId", "tagPath");
CREATE INDEX "AssetTag_organizationId_assetId_idx" ON "AssetTag"("organizationId", "assetId");

ALTER TABLE "AssetTag" ADD CONSTRAINT "AssetTag_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetTag" ADD CONSTRAINT "AssetTag_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "IndustrialAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
