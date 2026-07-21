-- CreateEnum
CREATE TYPE "EdgeGatewayLifecycle" AS ENUM ('REGISTERED', 'ACTIVE', 'STALE', 'DISABLED', 'REVOKED', 'SIMULATOR');

-- CreateEnum
CREATE TYPE "EdgeGatewayEnvironment" AS ENUM ('PRODUCTION', 'STAGING', 'TEST', 'LAB');

-- CreateEnum
CREATE TYPE "EdgeGatewayCapability" AS ENUM ('PROJECT_METADATA_IMPORT', 'TAG_METADATA_IMPORT', 'ALARM_METADATA_IMPORT', 'NETWORK_METADATA_IMPORT', 'READ_ONLY_TELEMETRY', 'SIMULATION');

-- CreateEnum
CREATE TYPE "OtDeviceCategory" AS ENUM ('PLC', 'HMI', 'SCADA_SERVER', 'VFD', 'MCC', 'REMOTE_IO', 'INDUSTRIAL_PC', 'SAFETY_CONTROLLER', 'NETWORK_SWITCH', 'GATEWAY', 'SENSOR_AGGREGATOR', 'OTHER');

-- CreateEnum
CREATE TYPE "OtLifecycleState" AS ENUM ('PLANNED', 'COMMISSIONING', 'OPERATIONAL', 'MAINTENANCE', 'DECOMMISSIONED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "OtNetworkZone" AS ENUM ('ENTERPRISE', 'DMZ', 'SUPERVISORY', 'CONTROL', 'FIELD', 'SAFETY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "OtSafetyClass" AS ENUM ('NON_SAFETY', 'SAFETY_RELATED', 'SAFETY_CRITICAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EngineeringSourceType" AS ENUM ('TIA_EXPORT', 'PLC_EXPORT', 'HMI_EXPORT', 'SCADA_EXPORT', 'GENERIC', 'SIMULATOR');

-- CreateEnum
CREATE TYPE "EngineeringImportStatus" AS ENUM ('PENDING', 'VALIDATING', 'APPLIED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "EngineeringImportFailure" AS ENUM ('NONE', 'UNSUPPORTED_FORMAT', 'SCHEMA_INVALID', 'TOO_LARGE', 'TOO_MANY_RECORDS', 'DUPLICATE_IMPORT', 'CHECKSUM_MISMATCH', 'TENANT_MISMATCH', 'PARSE_ERROR', 'INTERNAL_ERROR');

-- CreateEnum
CREATE TYPE "EngineeringAnalysisState" AS ENUM ('NOT_ANALYSED', 'ANALYSING', 'ANALYSED', 'FAILED');

-- CreateEnum
CREATE TYPE "EngineeringValidationState" AS ENUM ('VALID', 'WARNING', 'INVALID');

-- CreateEnum
CREATE TYPE "EngineeringFindingSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "EngineeringFindingStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'ACCEPTED', 'REJECTED', 'RESOLVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "EngineeringArtifactType" AS ENUM ('PROJECT', 'DEVICE', 'TAG', 'ALARM', 'NETWORK_NODE');

-- CreateEnum
CREATE TYPE "AutomationTagAccessMode" AS ENUM ('READ', 'READ_WRITE', 'WRITE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "EdgeGatewayProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "lifecycle" "EdgeGatewayLifecycle" NOT NULL DEFAULT 'REGISTERED',
    "environment" "EdgeGatewayEnvironment" NOT NULL DEFAULT 'PRODUCTION',
    "capabilities" "EdgeGatewayCapability"[],
    "softwareVersion" VARCHAR(64),
    "readOnlyMode" BOOLEAN NOT NULL DEFAULT true,
    "simulatorMode" BOOLEAN NOT NULL DEFAULT false,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "signingKeyRef" VARCHAR(191),
    "lastEnvelopeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EdgeGatewayProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatewayEnvelopeNonce" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "nonce" VARCHAR(128) NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GatewayEnvelopeNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtDeviceProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "category" "OtDeviceCategory" NOT NULL DEFAULT 'OTHER',
    "lifecycleState" "OtLifecycleState" NOT NULL DEFAULT 'UNKNOWN',
    "networkZone" "OtNetworkZone" NOT NULL DEFAULT 'UNKNOWN',
    "safetyClass" "OtSafetyClass" NOT NULL DEFAULT 'UNKNOWN',
    "productFamily" VARCHAR(120),
    "firmwareVersion" VARCHAR(64),
    "engineeringId" VARCHAR(191),
    "lastImportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtDeviceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngineeringImport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT,
    "gatewayId" TEXT,
    "uploadedById" TEXT,
    "sourceType" "EngineeringSourceType" NOT NULL,
    "sourceFilename" VARCHAR(255) NOT NULL,
    "contentType" VARCHAR(120) NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "idempotencyKey" VARCHAR(128),
    "byteSize" INTEGER NOT NULL,
    "status" "EngineeringImportStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" "EngineeringImportFailure" NOT NULL DEFAULT 'NONE',
    "deviceCount" INTEGER NOT NULL DEFAULT 0,
    "tagCount" INTEGER NOT NULL DEFAULT 0,
    "alarmCount" INTEGER NOT NULL DEFAULT 0,
    "networkCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "EngineeringImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngineeringProject" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT,
    "importId" TEXT NOT NULL,
    "name" VARCHAR(191) NOT NULL,
    "normalizedName" VARCHAR(191) NOT NULL,
    "projectVersion" VARCHAR(64),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "supersededById" TEXT,
    "vendor" VARCHAR(120),
    "platform" VARCHAR(120),
    "sourceType" "EngineeringSourceType" NOT NULL,
    "schemaVersion" VARCHAR(16) NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "analysisState" "EngineeringAnalysisState" NOT NULL DEFAULT 'NOT_ANALYSED',
    "validationState" "EngineeringValidationState" NOT NULL DEFAULT 'VALID',
    "lastAnalysedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngineeringProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationTag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetId" TEXT,
    "name" VARCHAR(191) NOT NULL,
    "normalizedName" VARCHAR(191) NOT NULL,
    "dataType" VARCHAR(48) NOT NULL,
    "address" VARCHAR(120),
    "symbolicPath" VARCHAR(255),
    "unit" VARCHAR(32),
    "description" VARCHAR(500),
    "accessMode" "AutomationTagAccessMode" NOT NULL DEFAULT 'UNKNOWN',
    "safetyClass" "OtSafetyClass" NOT NULL DEFAULT 'UNKNOWN',
    "sourceReference" VARCHAR(255),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "validationState" "EngineeringValidationState" NOT NULL DEFAULT 'VALID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlarmDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetId" TEXT,
    "code" VARCHAR(64) NOT NULL,
    "normalizedCode" VARCHAR(64) NOT NULL,
    "severity" "EngineeringFindingSeverity" NOT NULL DEFAULT 'MEDIUM',
    "message" VARCHAR(500),
    "conditionReference" VARCHAR(255),
    "requiresAck" BOOLEAN NOT NULL DEFAULT false,
    "safetyClass" "OtSafetyClass" NOT NULL DEFAULT 'UNKNOWN',
    "productionRelevant" BOOLEAN NOT NULL DEFAULT false,
    "sourceReference" VARCHAR(255),
    "validationState" "EngineeringValidationState" NOT NULL DEFAULT 'VALID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlarmDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndustrialNetworkNode" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetId" TEXT,
    "nodeName" VARCHAR(191) NOT NULL,
    "normalizedName" VARCHAR(191) NOT NULL,
    "zone" "OtNetworkZone" NOT NULL DEFAULT 'UNKNOWN',
    "protocol" "IndustrialProtocol" NOT NULL DEFAULT 'OTHER',
    "address" VARCHAR(120),
    "subnet" VARCHAR(64),
    "stationId" VARCHAR(64),
    "conflictState" "EngineeringValidationState" NOT NULL DEFAULT 'VALID',
    "sourceReference" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndustrialNetworkNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngineeringFinding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ruleId" VARCHAR(64) NOT NULL,
    "ruleVersion" VARCHAR(16) NOT NULL,
    "category" VARCHAR(48) NOT NULL,
    "severity" "EngineeringFindingSeverity" NOT NULL DEFAULT 'MEDIUM',
    "title" VARCHAR(191) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "artifactType" "EngineeringArtifactType" NOT NULL,
    "artifactRef" VARCHAR(255) NOT NULL,
    "evidenceRefs" TEXT[],
    "recommendation" VARCHAR(1000) NOT NULL,
    "humanApprovalRequired" BOOLEAN NOT NULL DEFAULT true,
    "status" "EngineeringFindingStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngineeringFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EdgeGatewayProfile_gatewayId_key" ON "EdgeGatewayProfile"("gatewayId");

-- CreateIndex
CREATE INDEX "EdgeGatewayProfile_organizationId_lifecycle_idx" ON "EdgeGatewayProfile"("organizationId", "lifecycle");

-- CreateIndex
CREATE INDEX "GatewayEnvelopeNonce_organizationId_expiresAt_idx" ON "GatewayEnvelopeNonce"("organizationId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "GatewayEnvelopeNonce_gatewayId_nonce_key" ON "GatewayEnvelopeNonce"("gatewayId", "nonce");

-- CreateIndex
CREATE UNIQUE INDEX "OtDeviceProfile_assetId_key" ON "OtDeviceProfile"("assetId");

-- CreateIndex
CREATE INDEX "OtDeviceProfile_organizationId_category_idx" ON "OtDeviceProfile"("organizationId", "category");

-- CreateIndex
CREATE INDEX "OtDeviceProfile_organizationId_safetyClass_idx" ON "OtDeviceProfile"("organizationId", "safetyClass");

-- CreateIndex
CREATE UNIQUE INDEX "OtDeviceProfile_organizationId_engineeringId_key" ON "OtDeviceProfile"("organizationId", "engineeringId");

-- CreateIndex
CREATE INDEX "EngineeringImport_organizationId_status_startedAt_idx" ON "EngineeringImport"("organizationId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "EngineeringImport_organizationId_siteId_idx" ON "EngineeringImport"("organizationId", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "EngineeringImport_organizationId_checksum_key" ON "EngineeringImport"("organizationId", "checksum");

-- CreateIndex
CREATE UNIQUE INDEX "EngineeringImport_organizationId_idempotencyKey_key" ON "EngineeringImport"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "EngineeringProject_supersededById_key" ON "EngineeringProject"("supersededById");

-- CreateIndex
CREATE INDEX "EngineeringProject_organizationId_siteId_idx" ON "EngineeringProject"("organizationId", "siteId");

-- CreateIndex
CREATE INDEX "EngineeringProject_organizationId_analysisState_idx" ON "EngineeringProject"("organizationId", "analysisState");

-- CreateIndex
CREATE INDEX "EngineeringProject_importId_idx" ON "EngineeringProject"("importId");

-- CreateIndex
CREATE UNIQUE INDEX "EngineeringProject_organizationId_normalizedName_revision_key" ON "EngineeringProject"("organizationId", "normalizedName", "revision");

-- CreateIndex
CREATE INDEX "AutomationTag_organizationId_projectId_idx" ON "AutomationTag"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "AutomationTag_projectId_address_idx" ON "AutomationTag"("projectId", "address");

-- CreateIndex
CREATE INDEX "AutomationTag_organizationId_safetyClass_idx" ON "AutomationTag"("organizationId", "safetyClass");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationTag_projectId_normalizedName_key" ON "AutomationTag"("projectId", "normalizedName");

-- CreateIndex
CREATE INDEX "AlarmDefinition_organizationId_projectId_idx" ON "AlarmDefinition"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "AlarmDefinition_organizationId_severity_idx" ON "AlarmDefinition"("organizationId", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "AlarmDefinition_projectId_normalizedCode_key" ON "AlarmDefinition"("projectId", "normalizedCode");

-- CreateIndex
CREATE INDEX "IndustrialNetworkNode_organizationId_projectId_idx" ON "IndustrialNetworkNode"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "IndustrialNetworkNode_projectId_address_idx" ON "IndustrialNetworkNode"("projectId", "address");

-- CreateIndex
CREATE UNIQUE INDEX "IndustrialNetworkNode_projectId_normalizedName_key" ON "IndustrialNetworkNode"("projectId", "normalizedName");

-- CreateIndex
CREATE INDEX "EngineeringFinding_organizationId_projectId_severity_idx" ON "EngineeringFinding"("organizationId", "projectId", "severity");

-- CreateIndex
CREATE INDEX "EngineeringFinding_organizationId_status_idx" ON "EngineeringFinding"("organizationId", "status");

-- CreateIndex
CREATE INDEX "EngineeringFinding_projectId_humanApprovalRequired_idx" ON "EngineeringFinding"("projectId", "humanApprovalRequired");

-- CreateIndex
CREATE UNIQUE INDEX "EngineeringFinding_projectId_ruleId_artifactRef_key" ON "EngineeringFinding"("projectId", "ruleId", "artifactRef");

-- AddForeignKey
ALTER TABLE "EdgeGatewayProfile" ADD CONSTRAINT "EdgeGatewayProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdgeGatewayProfile" ADD CONSTRAINT "EdgeGatewayProfile_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "IndustrialGateway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatewayEnvelopeNonce" ADD CONSTRAINT "GatewayEnvelopeNonce_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatewayEnvelopeNonce" ADD CONSTRAINT "GatewayEnvelopeNonce_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "IndustrialGateway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtDeviceProfile" ADD CONSTRAINT "OtDeviceProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtDeviceProfile" ADD CONSTRAINT "OtDeviceProfile_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "IndustrialAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringImport" ADD CONSTRAINT "EngineeringImport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringImport" ADD CONSTRAINT "EngineeringImport_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "IndustrialSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringImport" ADD CONSTRAINT "EngineeringImport_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "IndustrialGateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringImport" ADD CONSTRAINT "EngineeringImport_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringProject" ADD CONSTRAINT "EngineeringProject_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringProject" ADD CONSTRAINT "EngineeringProject_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "IndustrialSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringProject" ADD CONSTRAINT "EngineeringProject_importId_fkey" FOREIGN KEY ("importId") REFERENCES "EngineeringImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringProject" ADD CONSTRAINT "EngineeringProject_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "EngineeringProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationTag" ADD CONSTRAINT "AutomationTag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationTag" ADD CONSTRAINT "AutomationTag_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EngineeringProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationTag" ADD CONSTRAINT "AutomationTag_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "IndustrialAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlarmDefinition" ADD CONSTRAINT "AlarmDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlarmDefinition" ADD CONSTRAINT "AlarmDefinition_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EngineeringProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlarmDefinition" ADD CONSTRAINT "AlarmDefinition_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "IndustrialAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndustrialNetworkNode" ADD CONSTRAINT "IndustrialNetworkNode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndustrialNetworkNode" ADD CONSTRAINT "IndustrialNetworkNode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EngineeringProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndustrialNetworkNode" ADD CONSTRAINT "IndustrialNetworkNode_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "IndustrialAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringFinding" ADD CONSTRAINT "EngineeringFinding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringFinding" ADD CONSTRAINT "EngineeringFinding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EngineeringProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringFinding" ADD CONSTRAINT "EngineeringFinding_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

