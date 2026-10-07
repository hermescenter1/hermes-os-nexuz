-- HRIS-0.5 — ERP tenant isolation foundation (additive; no backfill).
--
-- What this migration does
--   * adds nullable "organizationId" to the ERP tables that lacked it;
--   * adds organization FKs (ON DELETE RESTRICT) to every ERP table;
--   * adds org-consistent composite FKs for team membership:
--       ErpTeamMember(organizationId, teamId)  -> ErpTeam(organizationId, id)
--       ErpTeamMember(organizationId, userId)  -> OrganizationMember(organizationId, userId)
--   * adds "version" to editable aggregates (ErpTeam, ErpResource, ErpProject,
--     ErpTask, ErpWorkOrder, ErpInventoryItem, ErpApprovalRequest) for
--     optimistic concurrency (default 1; existing rows get 1);
--   * adds the generic IdempotencyKey table (scope: org + operation + key hash);
--   * adds ActiveOrganizationSelection (server-side active organization keyed by
--     the session row id). It is a pointer only; membership is re-checked per request.
--
-- What this migration deliberately does NOT do
--   * no backfill: existing rows keep organizationId = NULL and are invisible to
--     every query path (fail closed on null scope);
--   * no SET NOT NULL on any organizationId column;
--   * no assignment of data to any organization;
--   * no outbox table: the repository has no generic outbox model yet. The
--     HRIS-0.5 scope publishes no integration events; ATS handoff (HRIS-2) will
--     need an outbox in its own migration.
--
-- Known trade-offs (documented, accepted for the transition)
--   * MATCH SIMPLE: a composite FK is not enforced while organizationId is NULL.
--     Such rows are unreachable through the application.
--   * The former single-column FK ErpTeamMember.teamId -> ErpTeam.id is replaced
--     by the composite FK above (see DROP below).
--   * Child-to-parent FKs for projects/tasks/work orders are NOT made composite
--     here; those modules filter by organizationId on every table they touch.
--
-- Rollback (manual; take a backup of organizationId/version columns first if
-- any rows were written with them)
--   DROP TABLE "ActiveOrganizationSelection";
--   DROP TABLE "IdempotencyKey";
--   ALTER TABLE "ErpTeamMember" DROP CONSTRAINT "ErpTeamMember_organizationId_teamId_fkey";
--   ALTER TABLE "ErpTeamMember" DROP CONSTRAINT "ErpTeamMember_organizationId_userId_fkey";
--   ALTER TABLE "ErpTeamMember" ADD CONSTRAINT "ErpTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "ErpTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--   then drop the organization FKs, indexes and the organizationId/version columns added below.

-- DropForeignKey
ALTER TABLE "ErpTeamMember" DROP CONSTRAINT "ErpTeamMember_teamId_fkey";

-- DropIndex
DROP INDEX "ErpTeam_organizationId_idx";

-- AlterTable
ALTER TABLE "ErpProject" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ErpProjectMilestone" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "ErpTask" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ErpTaskComment" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "ErpTeam" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ErpTeamMember" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "ErpResource" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ErpInventoryItem" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ErpInventoryMovement" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "ErpWorkOrder" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ErpWorkOrderActivity" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "ErpOperationalKpi" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "ErpProjectCost" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "ErpApprovalRequest" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ErpApprovalStep" ADD COLUMN     "organizationId" TEXT;

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "resultType" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActiveOrganizationSelection" (
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActiveOrganizationSelection_pkey" PRIMARY KEY ("sessionId")
);

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_organizationId_operation_keyHash_key" ON "IdempotencyKey"("organizationId", "operation", "keyHash");

-- CreateIndex
CREATE INDEX "ActiveOrganizationSelection_userId_idx" ON "ActiveOrganizationSelection"("userId");

-- CreateIndex
CREATE INDEX "ActiveOrganizationSelection_organizationId_idx" ON "ActiveOrganizationSelection"("organizationId");

-- CreateIndex
CREATE INDEX "ErpProjectMilestone_organizationId_idx" ON "ErpProjectMilestone"("organizationId");

-- CreateIndex
CREATE INDEX "ErpTask_organizationId_idx" ON "ErpTask"("organizationId");

-- CreateIndex
CREATE INDEX "ErpTaskComment_organizationId_idx" ON "ErpTaskComment"("organizationId");

-- CreateIndex
CREATE INDEX "ErpTeam_organizationId_createdAt_id_idx" ON "ErpTeam"("organizationId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ErpTeam_organizationId_id_key" ON "ErpTeam"("organizationId", "id");

-- CreateIndex
CREATE INDEX "ErpTeamMember_organizationId_idx" ON "ErpTeamMember"("organizationId");

-- CreateIndex
CREATE INDEX "ErpResource_organizationId_createdAt_id_idx" ON "ErpResource"("organizationId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ErpResource_organizationId_id_key" ON "ErpResource"("organizationId", "id");

-- CreateIndex
CREATE INDEX "ErpInventoryMovement_organizationId_idx" ON "ErpInventoryMovement"("organizationId");

-- CreateIndex
CREATE INDEX "ErpWorkOrderActivity_organizationId_idx" ON "ErpWorkOrderActivity"("organizationId");

-- CreateIndex
CREATE INDEX "ErpOperationalKpi_organizationId_idx" ON "ErpOperationalKpi"("organizationId");

-- CreateIndex
CREATE INDEX "ErpProjectCost_organizationId_idx" ON "ErpProjectCost"("organizationId");

-- CreateIndex
CREATE INDEX "ErpApprovalStep_organizationId_idx" ON "ErpApprovalStep"("organizationId");

-- CreateIndex
CREATE INDEX "ErpAuditEvent_organizationId_idx" ON "ErpAuditEvent"("organizationId");

-- AddForeignKey
ALTER TABLE "ErpProject" ADD CONSTRAINT "ErpProject_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpProjectMilestone" ADD CONSTRAINT "ErpProjectMilestone_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpTask" ADD CONSTRAINT "ErpTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpTaskComment" ADD CONSTRAINT "ErpTaskComment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpTeam" ADD CONSTRAINT "ErpTeam_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpTeamMember" ADD CONSTRAINT "ErpTeamMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpTeamMember" ADD CONSTRAINT "ErpTeamMember_organizationId_teamId_fkey" FOREIGN KEY ("organizationId", "teamId") REFERENCES "ErpTeam"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpTeamMember" ADD CONSTRAINT "ErpTeamMember_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "OrganizationMember"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpResource" ADD CONSTRAINT "ErpResource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpInventoryItem" ADD CONSTRAINT "ErpInventoryItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpInventoryMovement" ADD CONSTRAINT "ErpInventoryMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpWorkOrder" ADD CONSTRAINT "ErpWorkOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpWorkOrderActivity" ADD CONSTRAINT "ErpWorkOrderActivity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpOperationalKpi" ADD CONSTRAINT "ErpOperationalKpi_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpProjectCost" ADD CONSTRAINT "ErpProjectCost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpApprovalRequest" ADD CONSTRAINT "ErpApprovalRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpApprovalStep" ADD CONSTRAINT "ErpApprovalStep_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpAuditEvent" ADD CONSTRAINT "ErpAuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveOrganizationSelection" ADD CONSTRAINT "ActiveOrganizationSelection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

