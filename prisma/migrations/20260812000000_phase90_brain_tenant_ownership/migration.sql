-- PHASE 90 — Industrial Brain tenant ownership (additive, non-destructive).
-- Existing rows keep NULL owner columns. No data is modified or removed.
-- The application QUARANTINES NULL-owner rows: they are unreachable through
-- every ordinary read, write, delete and export, because a row that cannot be
-- attributed to a tenant must not be shown to an arbitrary one. Recovery is a
-- separate, permission-gated and audited administrative action.

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
