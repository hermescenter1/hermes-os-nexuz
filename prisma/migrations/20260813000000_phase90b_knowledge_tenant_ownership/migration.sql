-- PHASE 90B — extend Industrial Brain tenant ownership to the knowledge surface
-- (additive, non-destructive). Adds nullable owner columns + tenant-aware indexes
-- to EngineeringMemory, UnknownAnalysis and Project; a supporting index for the
-- public published-case read; and durable tenancy/traceability columns on AuditLog.
--
-- Existing rows keep NULL owner columns. The application QUARANTINES NULL-owner
-- rows on every ordinary read/write/delete/export (see owner-scope.ts): a row that
-- cannot be attributed to a tenant must not be served to an arbitrary one. Recovery
-- is a separate, permission-gated and audited administrative action.
--
-- No DROP / DELETE / TRUNCATE / RENAME, no ALTER COLUMN, no NOT NULL, no DEFAULT.

-- AlterTable
ALTER TABLE "EngineeringMemory" ADD COLUMN "userId" TEXT;
ALTER TABLE "EngineeringMemory" ADD COLUMN "organizationId" TEXT;

-- AlterTable
ALTER TABLE "UnknownAnalysis" ADD COLUMN "userId" TEXT;
ALTER TABLE "UnknownAnalysis" ADD COLUMN "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "userId" TEXT;
ALTER TABLE "Project" ADD COLUMN "organizationId" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "outcome" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "correlationId" TEXT;

-- CreateIndex
CREATE INDEX "EngineeringMemory_userId_createdAt_idx" ON "EngineeringMemory"("userId", "createdAt");
CREATE INDEX "EngineeringMemory_organizationId_createdAt_idx" ON "EngineeringMemory"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "UnknownAnalysis_userId_createdAt_idx" ON "UnknownAnalysis"("userId", "createdAt");
CREATE INDEX "UnknownAnalysis_organizationId_createdAt_idx" ON "UnknownAnalysis"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Project_userId_createdAt_idx" ON "Project"("userId", "createdAt");
CREATE INDEX "Project_organizationId_createdAt_idx" ON "Project"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "EngineeringCase_status_createdAt_idx" ON "EngineeringCase"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_idx" ON "AuditLog"("organizationId");
