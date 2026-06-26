-- Phase 72: Enterprise Asset Registry
CREATE TYPE "AssetStatus" AS ENUM ('PLANNED','COMMISSIONED','IN_SERVICE','DEGRADED','UNDER_MAINTENANCE','STANDBY','RETIRED','REPLACED','DECOMMISSIONED');
CREATE TYPE "AssetCriticality" AS ENUM ('NON_CRITICAL','LOW','MEDIUM','HIGH','CRITICAL');
CREATE TYPE "AssetRiskState" AS ENUM ('HEALTHY','MONITOR','AT_RISK','CRITICAL','UNKNOWN');
CREATE TYPE "AssetLifecycleState" AS ENUM ('DESIGN','PROCUREMENT','INSTALLATION','COMMISSIONING','IN_SERVICE','DEGRADED','DECOMMISSIONING','RETIRED');
CREATE TYPE "RegistryAssetType" AS ENUM ('PRODUCTION_LINE','MACHINE','PLC','HMI','SCADA_NODE','ELECTRICAL_PANEL','MCC_PANEL','VFD','MOTOR','PUMP','VALVE','SENSOR','INSTRUMENT','ROBOT','CONVEYOR','COMPRESSOR','UTILITY_SYSTEM','SAFETY_SYSTEM','NETWORK_DEVICE','INDUSTRIAL_PC');

CREATE TABLE "AssetLocation" (
  "id" TEXT NOT NULL, "organizationId" TEXT, "siteId" TEXT, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "nameEn" TEXT, "nameFa" TEXT, "description" TEXT, "locationType" TEXT NOT NULL DEFAULT 'AREA', "parentId" TEXT, "gpsLat" DOUBLE PRECISION, "gpsLon" DOUBLE PRECISION, "building" TEXT, "floor" TEXT, "room" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetLocation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssetLocation_organizationId_idx" ON "AssetLocation"("organizationId");
CREATE INDEX "AssetLocation_siteId_idx" ON "AssetLocation"("siteId");
CREATE INDEX "AssetLocation_code_idx" ON "AssetLocation"("code");

CREATE TABLE "RegistryAsset" (
  "id" TEXT NOT NULL, "organizationId" TEXT, "siteId" TEXT, "assetNumber" TEXT NOT NULL, "name" TEXT NOT NULL, "nameEn" TEXT, "nameFa" TEXT, "description" TEXT, "assetType" "RegistryAssetType" NOT NULL, "status" "AssetStatus" NOT NULL DEFAULT 'IN_SERVICE', "criticality" "AssetCriticality" NOT NULL DEFAULT 'MEDIUM', "riskState" "AssetRiskState" NOT NULL DEFAULT 'HEALTHY', "lifecycleState" "AssetLifecycleState" NOT NULL DEFAULT 'IN_SERVICE', "healthScore" DOUBLE PRECISION NOT NULL DEFAULT 100, "parentAssetId" TEXT, "locationId" TEXT, "manufacturer" TEXT, "model" TEXT, "serialNumber" TEXT, "firmwareVersion" TEXT, "installationDate" TIMESTAMP(3), "commissionDate" TIMESTAMP(3), "warrantyExpiry" TIMESTAMP(3), "expectedLifeYears" INTEGER, "lastInspectionAt" TIMESTAMP(3), "nextInspectionAt" TIMESTAMP(3), "technicalSpecs" JSONB NOT NULL DEFAULT '{}', "tags" TEXT[], "isActive" BOOLEAN NOT NULL DEFAULT true, "createdBy" TEXT, "updatedBy" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RegistryAsset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RegistryAsset_organizationId_idx" ON "RegistryAsset"("organizationId");
CREATE INDEX "RegistryAsset_siteId_idx" ON "RegistryAsset"("siteId");
CREATE INDEX "RegistryAsset_assetType_idx" ON "RegistryAsset"("assetType");
CREATE INDEX "RegistryAsset_status_idx" ON "RegistryAsset"("status");
CREATE INDEX "RegistryAsset_criticality_idx" ON "RegistryAsset"("criticality");
CREATE INDEX "RegistryAsset_parentAssetId_idx" ON "RegistryAsset"("parentAssetId");
CREATE INDEX "RegistryAsset_locationId_idx" ON "RegistryAsset"("locationId");

CREATE TABLE "AssetCriticalityAssessment" (
  "id" TEXT NOT NULL, "assetId" TEXT NOT NULL, "assessedBy" TEXT, "safetyImpact" INTEGER NOT NULL DEFAULT 1, "productionImpact" INTEGER NOT NULL DEFAULT 1, "maintenanceImpact" INTEGER NOT NULL DEFAULT 1, "downtimeRisk" INTEGER NOT NULL DEFAULT 1, "replacementDifficulty" INTEGER NOT NULL DEFAULT 1, "spareAvailability" INTEGER NOT NULL DEFAULT 5, "overallScore" DOUBLE PRECISION NOT NULL DEFAULT 0, "criticality" "AssetCriticality" NOT NULL DEFAULT 'MEDIUM', "notes" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetCriticalityAssessment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssetCriticalityAssessment_assetId_idx" ON "AssetCriticalityAssessment"("assetId");

CREATE TABLE "AssetHealthSnapshot" (
  "id" TEXT NOT NULL, "assetId" TEXT NOT NULL, "healthScore" DOUBLE PRECISION NOT NULL, "riskState" "AssetRiskState" NOT NULL, "vibrationRms" DOUBLE PRECISION, "temperature" DOUBLE PRECISION, "pressure" DOUBLE PRECISION, "currentDraw" DOUBLE PRECISION, "notes" TEXT, "takenBy" TEXT, "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetHealthSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssetHealthSnapshot_assetId_idx" ON "AssetHealthSnapshot"("assetId");
CREATE INDEX "AssetHealthSnapshot_takenAt_idx" ON "AssetHealthSnapshot"("takenAt");

CREATE TABLE "AssetLifecycleEvent" (
  "id" TEXT NOT NULL, "assetId" TEXT NOT NULL, "eventType" TEXT NOT NULL, "fromState" "AssetLifecycleState", "toState" "AssetLifecycleState" NOT NULL, "performedBy" TEXT, "notes" TEXT, "documents" TEXT[], "metadata" JSONB NOT NULL DEFAULT '{}', "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetLifecycleEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssetLifecycleEvent_assetId_idx" ON "AssetLifecycleEvent"("assetId");
CREATE INDEX "AssetLifecycleEvent_occurredAt_idx" ON "AssetLifecycleEvent"("occurredAt");

CREATE TABLE "AssetMaintenanceLink" (
  "id" TEXT NOT NULL, "assetId" TEXT NOT NULL, "workOrderId" TEXT, "planId" TEXT, "linkType" TEXT NOT NULL DEFAULT 'WORK_ORDER', "notes" TEXT, "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetMaintenanceLink_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssetMaintenanceLink_assetId_idx" ON "AssetMaintenanceLink"("assetId");
CREATE INDEX "AssetMaintenanceLink_workOrderId_idx" ON "AssetMaintenanceLink"("workOrderId");

CREATE TABLE "AssetDocumentLink" (
  "id" TEXT NOT NULL, "assetId" TEXT NOT NULL, "documentId" TEXT, "docType" TEXT NOT NULL DEFAULT 'MANUAL', "title" TEXT NOT NULL, "description" TEXT, "fileRef" TEXT, "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetDocumentLink_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssetDocumentLink_assetId_idx" ON "AssetDocumentLink"("assetId");
CREATE INDEX "AssetDocumentLink_documentId_idx" ON "AssetDocumentLink"("documentId");

CREATE TABLE "AssetTelemetryLink" (
  "id" TEXT NOT NULL, "assetId" TEXT NOT NULL, "tagPath" TEXT NOT NULL, "protocol" TEXT NOT NULL DEFAULT 'OPC_UA', "description" TEXT, "unit" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetTelemetryLink_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssetTelemetryLink_assetId_idx" ON "AssetTelemetryLink"("assetId");
CREATE INDEX "AssetTelemetryLink_tagPath_idx" ON "AssetTelemetryLink"("tagPath");

CREATE TABLE "RegistryAssetTag" (
  "id" TEXT NOT NULL, "assetId" TEXT NOT NULL, "key" TEXT NOT NULL, "value" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegistryAssetTag_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RegistryAssetTag_assetId_idx" ON "RegistryAssetTag"("assetId");
CREATE INDEX "RegistryAssetTag_key_idx" ON "RegistryAssetTag"("key");

ALTER TABLE "RegistryAsset" ADD CONSTRAINT "RegistryAsset_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "AssetLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RegistryAsset" ADD CONSTRAINT "RegistryAsset_parentAssetId_fkey" FOREIGN KEY ("parentAssetId") REFERENCES "RegistryAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetCriticalityAssessment" ADD CONSTRAINT "AssetCriticalityAssessment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "RegistryAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetHealthSnapshot" ADD CONSTRAINT "AssetHealthSnapshot_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "RegistryAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetLifecycleEvent" ADD CONSTRAINT "AssetLifecycleEvent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "RegistryAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetMaintenanceLink" ADD CONSTRAINT "AssetMaintenanceLink_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "RegistryAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetDocumentLink" ADD CONSTRAINT "AssetDocumentLink_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "RegistryAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetTelemetryLink" ADD CONSTRAINT "AssetTelemetryLink_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "RegistryAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegistryAssetTag" ADD CONSTRAINT "RegistryAssetTag_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "RegistryAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
