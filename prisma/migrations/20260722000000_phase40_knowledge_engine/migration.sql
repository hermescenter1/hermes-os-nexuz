-- Phase 40: Industrial Knowledge Engine
-- Additive migration: 2 new enums + 7 new tables.
-- SAFETY: Knowledge Engine is READ/OBSERVE/EXPLAIN ONLY. No PLC write path.
-- BILINGUAL: titleNorm/nameNorm columns store pre-normalized FA/EN text.
-- CONFIDENCE: IndustrialRootCause.confidenceWeight is 0.0–1.0 float.
-- INTEGRITY: AssetKnowledgeLink EXACTLY ONE FK check constraint enforced here.

CREATE TYPE "KnowledgeSourceType" AS ENUM (
    'MANUAL',
    'ENGINEERING_STANDARD',
    'MAINTENANCE_HISTORY',
    'FAILURE_ANALYSIS',
    'VENDOR_DOCUMENTATION',
    'INTERNAL_CASE'
);

CREATE TYPE "FailureSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TABLE "KnowledgeCategory" (
    "id"             TEXT        NOT NULL,
    "organizationId" TEXT        NOT NULL,
    "name"           TEXT        NOT NULL,
    "description"    TEXT,
    "parentId"       TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KnowledgeCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndustrialKnowledgeArticle" (
    "id"             TEXT                  NOT NULL,
    "organizationId" TEXT                  NOT NULL,
    "categoryId"     TEXT,
    "title"          TEXT                  NOT NULL,
    "titleNorm"      TEXT                  NOT NULL,
    "summary"        TEXT                  NOT NULL,
    "content"        TEXT                  NOT NULL,
    "keywords"       JSONB                 NOT NULL DEFAULT '[]',
    "sourceType"     "KnowledgeSourceType" NOT NULL DEFAULT 'MANUAL',
    "version"        INTEGER               NOT NULL DEFAULT 1,
    "status"         TEXT                  NOT NULL DEFAULT 'draft',
    "authorId"       TEXT,
    "createdAt"      TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)          NOT NULL,
    CONSTRAINT "IndustrialKnowledgeArticle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndustrialFailureMode" (
    "id"             TEXT                  NOT NULL,
    "organizationId" TEXT                  NOT NULL,
    "categoryId"     TEXT,
    "name"           TEXT                  NOT NULL,
    "nameNorm"       TEXT                  NOT NULL,
    "description"    TEXT                  NOT NULL,
    "severity"       "FailureSeverity"     NOT NULL DEFAULT 'MEDIUM',
    "symptoms"       JSONB                 NOT NULL DEFAULT '[]',
    "assetTypes"     JSONB                 NOT NULL DEFAULT '[]',
    "keywords"       JSONB                 NOT NULL DEFAULT '[]',
    "sourceType"     "KnowledgeSourceType" NOT NULL DEFAULT 'MANUAL',
    "createdAt"      TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)          NOT NULL,
    CONSTRAINT "IndustrialFailureMode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndustrialRootCause" (
    "id"                 TEXT                  NOT NULL,
    "organizationId"     TEXT                  NOT NULL,
    "failureModeId"      TEXT                  NOT NULL,
    "description"        TEXT                  NOT NULL,
    "confidenceWeight"   DOUBLE PRECISION      NOT NULL DEFAULT 0.5,
    "supportingEvidence" JSONB                 NOT NULL DEFAULT '[]',
    "sourceType"         "KnowledgeSourceType" NOT NULL DEFAULT 'MANUAL',
    "createdAt"          TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3)          NOT NULL,
    CONSTRAINT "IndustrialRootCause_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndustrialMaintenanceProcedure" (
    "id"             TEXT                  NOT NULL,
    "organizationId" TEXT                  NOT NULL,
    "categoryId"     TEXT,
    "title"          TEXT                  NOT NULL,
    "titleNorm"      TEXT                  NOT NULL,
    "description"    TEXT                  NOT NULL,
    "steps"          JSONB                 NOT NULL DEFAULT '[]',
    "assetTypes"     JSONB                 NOT NULL DEFAULT '[]',
    "estimatedHours" DOUBLE PRECISION,
    "requiredRoles"  JSONB                 NOT NULL DEFAULT '[]',
    "safetyNotes"    TEXT,
    "sourceType"     "KnowledgeSourceType" NOT NULL DEFAULT 'MANUAL',
    "version"        INTEGER               NOT NULL DEFAULT 1,
    "status"         TEXT                  NOT NULL DEFAULT 'draft',
    "approvedById"   TEXT,
    "approvedAt"     TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)          NOT NULL,
    CONSTRAINT "IndustrialMaintenanceProcedure_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndustrialEngineeringCase" (
    "id"             TEXT              NOT NULL,
    "organizationId" TEXT              NOT NULL,
    "title"          TEXT              NOT NULL,
    "titleNorm"      TEXT              NOT NULL,
    "symptoms"       JSONB             NOT NULL DEFAULT '[]',
    "diagnosis"      TEXT,
    "resolution"     TEXT,
    "lessonsLearned" TEXT,
    "assetTypes"     JSONB             NOT NULL DEFAULT '[]',
    "assetId"        TEXT,
    "siteId"         TEXT,
    "failureModeId"  TEXT,
    "keywords"       JSONB             NOT NULL DEFAULT '[]',
    "status"         TEXT              NOT NULL DEFAULT 'open',
    "severity"       "FailureSeverity" NOT NULL DEFAULT 'MEDIUM',
    "reportedById"   TEXT,
    "resolvedAt"     TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)      NOT NULL,
    CONSTRAINT "IndustrialEngineeringCase_pkey" PRIMARY KEY ("id")
);

-- EXACTLY ONE FK invariant enforced here via CHECK constraint.
-- (CASE WHEN col IS NOT NULL THEN 1 ELSE 0 END) sum must equal 1.
CREATE TABLE "AssetKnowledgeLink" (
    "id"             TEXT         NOT NULL,
    "organizationId" TEXT         NOT NULL,
    "assetId"        TEXT         NOT NULL,
    "articleId"      TEXT,
    "failureModeId"  TEXT,
    "procedureId"    TEXT,
    "caseId"         TEXT,
    "notes"          TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetKnowledgeLink_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AssetKnowledgeLink_exactly_one_fk" CHECK (
        (CASE WHEN "articleId"     IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN "failureModeId" IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN "procedureId"   IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN "caseId"        IS NOT NULL THEN 1 ELSE 0 END) = 1
    )
);

-- Indexes
CREATE UNIQUE INDEX "KnowledgeCategory_organizationId_name_key"
    ON "KnowledgeCategory"("organizationId", "name");
CREATE INDEX "KnowledgeCategory_organizationId_createdAt_idx"
    ON "KnowledgeCategory"("organizationId", "createdAt");

CREATE INDEX "IndustrialKnowledgeArticle_organizationId_createdAt_idx"
    ON "IndustrialKnowledgeArticle"("organizationId", "createdAt");
CREATE INDEX "IndustrialKnowledgeArticle_organizationId_title_idx"
    ON "IndustrialKnowledgeArticle"("organizationId", "title");

CREATE INDEX "IndustrialFailureMode_organizationId_createdAt_idx"
    ON "IndustrialFailureMode"("organizationId", "createdAt");
CREATE INDEX "IndustrialFailureMode_organizationId_name_idx"
    ON "IndustrialFailureMode"("organizationId", "name");

CREATE INDEX "IndustrialRootCause_organizationId_createdAt_idx"
    ON "IndustrialRootCause"("organizationId", "createdAt");
CREATE INDEX "IndustrialRootCause_organizationId_failureModeId_idx"
    ON "IndustrialRootCause"("organizationId", "failureModeId");

CREATE INDEX "IndustrialMaintenanceProcedure_organizationId_createdAt_idx"
    ON "IndustrialMaintenanceProcedure"("organizationId", "createdAt");
CREATE INDEX "IndustrialMaintenanceProcedure_organizationId_title_idx"
    ON "IndustrialMaintenanceProcedure"("organizationId", "title");

CREATE INDEX "IndustrialEngineeringCase_organizationId_createdAt_idx"
    ON "IndustrialEngineeringCase"("organizationId", "createdAt");
CREATE INDEX "IndustrialEngineeringCase_organizationId_assetId_idx"
    ON "IndustrialEngineeringCase"("organizationId", "assetId");
CREATE INDEX "IndustrialEngineeringCase_organizationId_title_idx"
    ON "IndustrialEngineeringCase"("organizationId", "title");

CREATE INDEX "AssetKnowledgeLink_organizationId_assetId_idx"
    ON "AssetKnowledgeLink"("organizationId", "assetId");
CREATE INDEX "AssetKnowledgeLink_organizationId_createdAt_idx"
    ON "AssetKnowledgeLink"("organizationId", "createdAt");

-- Foreign keys
ALTER TABLE "KnowledgeCategory"
    ADD CONSTRAINT "KnowledgeCategory_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeCategory"
    ADD CONSTRAINT "KnowledgeCategory_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "KnowledgeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IndustrialKnowledgeArticle"
    ADD CONSTRAINT "IndustrialKnowledgeArticle_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IndustrialKnowledgeArticle"
    ADD CONSTRAINT "IndustrialKnowledgeArticle_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "KnowledgeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IndustrialFailureMode"
    ADD CONSTRAINT "IndustrialFailureMode_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IndustrialFailureMode"
    ADD CONSTRAINT "IndustrialFailureMode_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "KnowledgeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IndustrialRootCause"
    ADD CONSTRAINT "IndustrialRootCause_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IndustrialRootCause"
    ADD CONSTRAINT "IndustrialRootCause_failureModeId_fkey"
    FOREIGN KEY ("failureModeId") REFERENCES "IndustrialFailureMode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IndustrialMaintenanceProcedure"
    ADD CONSTRAINT "IndustrialMaintenanceProcedure_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IndustrialMaintenanceProcedure"
    ADD CONSTRAINT "IndustrialMaintenanceProcedure_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "KnowledgeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IndustrialEngineeringCase"
    ADD CONSTRAINT "IndustrialEngineeringCase_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssetKnowledgeLink"
    ADD CONSTRAINT "AssetKnowledgeLink_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetKnowledgeLink"
    ADD CONSTRAINT "AssetKnowledgeLink_articleId_fkey"
    FOREIGN KEY ("articleId") REFERENCES "IndustrialKnowledgeArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetKnowledgeLink"
    ADD CONSTRAINT "AssetKnowledgeLink_failureModeId_fkey"
    FOREIGN KEY ("failureModeId") REFERENCES "IndustrialFailureMode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetKnowledgeLink"
    ADD CONSTRAINT "AssetKnowledgeLink_procedureId_fkey"
    FOREIGN KEY ("procedureId") REFERENCES "IndustrialMaintenanceProcedure"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetKnowledgeLink"
    ADD CONSTRAINT "AssetKnowledgeLink_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "IndustrialEngineeringCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
