-- Phase 18A: Engineering Memory Foundation
-- Adds EngineeringMemory and MemoryFeedback tables for persistent diagnosis storage.

-- CreateTable
CREATE TABLE "EngineeringMemory" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "analysisSummary" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "relatedCaseIds" JSONB NOT NULL DEFAULT '[]',
    "relatedDocumentIds" JSONB NOT NULL DEFAULT '[]',
    "outcome" TEXT NOT NULL DEFAULT 'unknown',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngineeringMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryFeedback" (
    "id" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "notes" TEXT,
    "submittedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EngineeringMemory_domain_idx" ON "EngineeringMemory"("domain");

-- CreateIndex
CREATE INDEX "EngineeringMemory_outcome_idx" ON "EngineeringMemory"("outcome");

-- CreateIndex
CREATE INDEX "MemoryFeedback_memoryId_idx" ON "MemoryFeedback"("memoryId");

-- AddForeignKey
ALTER TABLE "MemoryFeedback" ADD CONSTRAINT "MemoryFeedback_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "EngineeringMemory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
