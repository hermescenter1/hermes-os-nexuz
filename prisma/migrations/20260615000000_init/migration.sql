-- CreateTable
CREATE TABLE "EngineeringCase" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "rootCause" TEXT NOT NULL,
    "secondaryCauses" JSONB NOT NULL,
    "verificationSteps" JSONB NOT NULL,
    "correctiveActions" JSONB NOT NULL,
    "safetyNotes" TEXT NOT NULL,
    "tags" JSONB NOT NULL,
    "confidence" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngineeringCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "vendor" TEXT,
    "summary" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "failureModes" JSONB NOT NULL,
    "diagnosticGuidance" JSONB NOT NULL,
    "verificationSteps" JSONB NOT NULL,
    "correctiveActions" JSONB NOT NULL,
    "safetyNotes" TEXT NOT NULL,
    "tags" JSONB NOT NULL,
    "confidence" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisRecord" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "domains" JSONB NOT NULL,
    "vendors" JSONB NOT NULL,
    "cases" JSONB NOT NULL,
    "knowledge" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "isUnknown" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnknownAnalysis" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "suggestedDomains" JSONB NOT NULL,
    "suggestedVendors" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnknownAnalysis_pkey" PRIMARY KEY ("id")
);
