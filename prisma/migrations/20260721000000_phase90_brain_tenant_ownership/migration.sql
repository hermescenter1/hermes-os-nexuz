-- PHASE 90 — Industrial Brain tenant ownership (additive, non-destructive).
-- Existing rows keep NULL owner columns and are treated as the legacy shared
-- pool; no data is modified or removed.

-- AlterTable
ALTER TABLE "AnalysisRecord" ADD COLUMN "userId" TEXT;
ALTER TABLE "AnalysisRecord" ADD COLUMN "organizationId" TEXT;

-- AlterTable
ALTER TABLE "EngineeringCase" ADD COLUMN "userId" TEXT;
ALTER TABLE "EngineeringCase" ADD COLUMN "organizationId" TEXT;

-- CreateIndex
CREATE INDEX "AnalysisRecord_userId_createdAt_idx" ON "AnalysisRecord"("userId", "createdAt");
CREATE INDEX "AnalysisRecord_organizationId_createdAt_idx" ON "AnalysisRecord"("organizationId", "createdAt");
CREATE INDEX "EngineeringCase_userId_createdAt_idx" ON "EngineeringCase"("userId", "createdAt");
CREATE INDEX "EngineeringCase_organizationId_createdAt_idx" ON "EngineeringCase"("organizationId", "createdAt");
