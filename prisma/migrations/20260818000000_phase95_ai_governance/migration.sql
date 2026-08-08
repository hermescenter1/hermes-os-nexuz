
-- CreateTable
CREATE TABLE "AiProviderPolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "providerRegistryId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "allowedDataClasses" TEXT[],
    "allowedWorkflows" TEXT[],
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "policyVersion" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiExecutionTrace" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "organizationId" TEXT,
    "siteId" TEXT,
    "userId" TEXT,
    "workflow" TEXT NOT NULL,
    "executionMode" TEXT NOT NULL,
    "providerRegistryId" TEXT,
    "modelId" TEXT,
    "policyVersion" TEXT,
    "deterministicResultVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "outputHash" TEXT NOT NULL,
    "sourceReferenceIds" TEXT[],
    "citationVerificationStatus" TEXT NOT NULL,
    "evidenceSufficiency" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "safetyDecision" TEXT NOT NULL,
    "humanApprovalRequired" BOOLEAN NOT NULL,
    "fallbackReason" TEXT,
    "providerAttempted" BOOLEAN NOT NULL,
    "providerSucceeded" BOOLEAN NOT NULL,
    "latencyMs" INTEGER,
    "inputTokenCount" INTEGER,
    "outputTokenCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiExecutionTrace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiProviderPolicy_organizationId_idx" ON "AiProviderPolicy"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderPolicy_organizationId_providerRegistryId_key" ON "AiProviderPolicy"("organizationId", "providerRegistryId");

-- CreateIndex
CREATE UNIQUE INDEX "AiExecutionTrace_traceId_key" ON "AiExecutionTrace"("traceId");

-- CreateIndex
CREATE INDEX "AiExecutionTrace_organizationId_createdAt_idx" ON "AiExecutionTrace"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiExecutionTrace_workflow_createdAt_idx" ON "AiExecutionTrace"("workflow", "createdAt");

-- AddForeignKey
ALTER TABLE "AiProviderPolicy" ADD CONSTRAINT "AiProviderPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiExecutionTrace" ADD CONSTRAINT "AiExecutionTrace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

