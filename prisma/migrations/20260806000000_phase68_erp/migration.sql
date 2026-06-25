-- Phase 68: Enterprise ERP & Operations Intelligence Platform
-- 16 new models, 7 new enums for full ERP coverage.

-- Enums
DO $$ BEGIN CREATE TYPE "ErpProjectStatus" AS ENUM ('PLANNED','ACTIVE','ON_HOLD','COMPLETED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ErpTaskStatus" AS ENUM ('TODO','IN_PROGRESS','BLOCKED','REVIEW','DONE','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ErpTaskPriority" AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ErpResourceType" AS ENUM ('HUMAN','EQUIPMENT','SOFTWARE','VEHICLE','FACILITY','TOOL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ErpInventoryMovementType" AS ENUM ('IN','OUT','TRANSFER','ADJUSTMENT','RESERVED','RELEASED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ErpWorkOrderStatus" AS ENUM ('OPEN','ASSIGNED','IN_PROGRESS','WAITING_APPROVAL','COMPLETED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ErpApprovalStatus" AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ErpProject
CREATE TABLE IF NOT EXISTS "ErpProject" (
  "id"               TEXT                NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId"   TEXT,
  "name"             TEXT                NOT NULL,
  "description"      TEXT,
  "status"           "ErpProjectStatus"  NOT NULL DEFAULT 'PLANNED',
  "startDate"        TIMESTAMPTZ,
  "endDate"          TIMESTAMPTZ,
  "budget"           DOUBLE PRECISION,
  "actualCost"       DOUBLE PRECISION    NOT NULL DEFAULT 0,
  "crmAccountId"     TEXT,
  "crmOpportunityId" TEXT,
  "managerId"        TEXT,
  "createdBy"        TEXT,
  "deletedAt"        TIMESTAMPTZ,
  "createdAt"        TIMESTAMPTZ         NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ         NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ErpProject_status_idx"         ON "ErpProject"("status");
CREATE INDEX IF NOT EXISTS "ErpProject_organizationId_idx" ON "ErpProject"("organizationId");
CREATE INDEX IF NOT EXISTS "ErpProject_managerId_idx"      ON "ErpProject"("managerId");
CREATE INDEX IF NOT EXISTS "ErpProject_createdAt_idx"      ON "ErpProject"("createdAt");

-- ErpProjectMilestone
CREATE TABLE IF NOT EXISTS "ErpProjectMilestone" (
  "id"          TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "projectId"   TEXT        NOT NULL REFERENCES "ErpProject"("id") ON DELETE CASCADE,
  "name"        TEXT        NOT NULL,
  "description" TEXT,
  "dueDate"     TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ErpProjectMilestone_projectId_idx" ON "ErpProjectMilestone"("projectId");

-- ErpTeam (before ErpTask because ErpTask references ErpTeam)
CREATE TABLE IF NOT EXISTS "ErpTeam" (
  "id"             TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT,
  "name"           TEXT        NOT NULL,
  "description"    TEXT,
  "leadId"         TEXT,
  "capacity"       INTEGER     NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ErpTeam_organizationId_idx" ON "ErpTeam"("organizationId");

-- ErpTeamMember
CREATE TABLE IF NOT EXISTS "ErpTeamMember" (
  "id"           TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "teamId"       TEXT        NOT NULL REFERENCES "ErpTeam"("id") ON DELETE CASCADE,
  "userId"       TEXT        NOT NULL,
  "role"         TEXT        NOT NULL DEFAULT 'member',
  "availability" INTEGER     NOT NULL DEFAULT 100,
  "joinedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ErpTeamMember_teamId_userId_key" ON "ErpTeamMember"("teamId","userId");
CREATE INDEX IF NOT EXISTS "ErpTeamMember_teamId_idx" ON "ErpTeamMember"("teamId");
CREATE INDEX IF NOT EXISTS "ErpTeamMember_userId_idx" ON "ErpTeamMember"("userId");

-- ErpTask
CREATE TABLE IF NOT EXISTS "ErpTask" (
  "id"             TEXT                NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "projectId"      TEXT                REFERENCES "ErpProject"("id"),
  "teamId"         TEXT                REFERENCES "ErpTeam"("id"),
  "assigneeId"     TEXT,
  "createdBy"      TEXT,
  "title"          TEXT                NOT NULL,
  "description"    TEXT,
  "status"         "ErpTaskStatus"     NOT NULL DEFAULT 'TODO',
  "priority"       "ErpTaskPriority"   NOT NULL DEFAULT 'MEDIUM',
  "dueDate"        TIMESTAMPTZ,
  "completedAt"    TIMESTAMPTZ,
  "estimatedHours" DOUBLE PRECISION,
  "actualHours"    DOUBLE PRECISION,
  "deletedAt"      TIMESTAMPTZ,
  "createdAt"      TIMESTAMPTZ         NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ         NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ErpTask_status_idx"     ON "ErpTask"("status");
CREATE INDEX IF NOT EXISTS "ErpTask_priority_idx"   ON "ErpTask"("priority");
CREATE INDEX IF NOT EXISTS "ErpTask_projectId_idx"  ON "ErpTask"("projectId");
CREATE INDEX IF NOT EXISTS "ErpTask_assigneeId_idx" ON "ErpTask"("assigneeId");
CREATE INDEX IF NOT EXISTS "ErpTask_dueDate_idx"    ON "ErpTask"("dueDate");

-- ErpTaskComment
CREATE TABLE IF NOT EXISTS "ErpTaskComment" (
  "id"        TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "taskId"    TEXT        NOT NULL REFERENCES "ErpTask"("id") ON DELETE CASCADE,
  "userId"    TEXT,
  "content"   TEXT        NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ErpTaskComment_taskId_idx" ON "ErpTaskComment"("taskId");

-- ErpResource
CREATE TABLE IF NOT EXISTS "ErpResource" (
  "id"             TEXT                NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT,
  "name"           TEXT                NOT NULL,
  "type"           "ErpResourceType"   NOT NULL DEFAULT 'HUMAN',
  "description"    TEXT,
  "costRate"       DOUBLE PRECISION,
  "currency"       TEXT                NOT NULL DEFAULT 'USD',
  "isAvailable"    BOOLEAN             NOT NULL DEFAULT true,
  "projectId"      TEXT,
  "workOrderId"    TEXT,
  "createdAt"      TIMESTAMPTZ         NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ         NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ErpResource_type_idx"           ON "ErpResource"("type");
CREATE INDEX IF NOT EXISTS "ErpResource_isAvailable_idx"    ON "ErpResource"("isAvailable");
CREATE INDEX IF NOT EXISTS "ErpResource_organizationId_idx" ON "ErpResource"("organizationId");

-- ErpInventoryItem
CREATE TABLE IF NOT EXISTS "ErpInventoryItem" (
  "id"             TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT,
  "sku"            TEXT        NOT NULL,
  "name"           TEXT        NOT NULL,
  "category"       TEXT,
  "description"    TEXT,
  "quantity"       INTEGER     NOT NULL DEFAULT 0,
  "reserved"       INTEGER     NOT NULL DEFAULT 0,
  "reorderLevel"   INTEGER     NOT NULL DEFAULT 0,
  "unitCost"       DOUBLE PRECISION,
  "currency"       TEXT        NOT NULL DEFAULT 'USD',
  "location"       TEXT,
  "deletedAt"      TIMESTAMPTZ,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ErpInventoryItem_sku_idx"            ON "ErpInventoryItem"("sku");
CREATE INDEX IF NOT EXISTS "ErpInventoryItem_category_idx"       ON "ErpInventoryItem"("category");
CREATE INDEX IF NOT EXISTS "ErpInventoryItem_organizationId_idx" ON "ErpInventoryItem"("organizationId");
CREATE INDEX IF NOT EXISTS "ErpInventoryItem_quantity_idx"       ON "ErpInventoryItem"("quantity");

-- ErpInventoryMovement
CREATE TABLE IF NOT EXISTS "ErpInventoryMovement" (
  "id"        TEXT                       NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "itemId"    TEXT                       NOT NULL REFERENCES "ErpInventoryItem"("id") ON DELETE CASCADE,
  "type"      "ErpInventoryMovementType" NOT NULL,
  "quantity"  INTEGER                    NOT NULL,
  "reason"    TEXT,
  "reference" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMPTZ                NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ErpInventoryMovement_itemId_idx"    ON "ErpInventoryMovement"("itemId");
CREATE INDEX IF NOT EXISTS "ErpInventoryMovement_type_idx"      ON "ErpInventoryMovement"("type");
CREATE INDEX IF NOT EXISTS "ErpInventoryMovement_createdAt_idx" ON "ErpInventoryMovement"("createdAt");

-- ErpWorkOrder
CREATE TABLE IF NOT EXISTS "ErpWorkOrder" (
  "id"               TEXT                  NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId"   TEXT,
  "projectId"        TEXT                  REFERENCES "ErpProject"("id"),
  "teamId"           TEXT                  REFERENCES "ErpTeam"("id"),
  "title"            TEXT                  NOT NULL,
  "description"      TEXT,
  "status"           "ErpWorkOrderStatus"  NOT NULL DEFAULT 'OPEN',
  "priority"         "ErpTaskPriority"     NOT NULL DEFAULT 'MEDIUM',
  "assigneeId"       TEXT,
  "createdBy"        TEXT,
  "dueDate"          TIMESTAMPTZ,
  "completedAt"      TIMESTAMPTZ,
  "completionNote"   TEXT,
  "requiresApproval" BOOLEAN               NOT NULL DEFAULT false,
  "deletedAt"        TIMESTAMPTZ,
  "createdAt"        TIMESTAMPTZ           NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ           NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ErpWorkOrder_status_idx"         ON "ErpWorkOrder"("status");
CREATE INDEX IF NOT EXISTS "ErpWorkOrder_projectId_idx"      ON "ErpWorkOrder"("projectId");
CREATE INDEX IF NOT EXISTS "ErpWorkOrder_teamId_idx"         ON "ErpWorkOrder"("teamId");
CREATE INDEX IF NOT EXISTS "ErpWorkOrder_organizationId_idx" ON "ErpWorkOrder"("organizationId");

-- ErpWorkOrderActivity
CREATE TABLE IF NOT EXISTS "ErpWorkOrderActivity" (
  "id"          TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "workOrderId" TEXT        NOT NULL REFERENCES "ErpWorkOrder"("id") ON DELETE CASCADE,
  "userId"      TEXT,
  "action"      TEXT        NOT NULL,
  "notes"       TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ErpWorkOrderActivity_workOrderId_idx" ON "ErpWorkOrderActivity"("workOrderId");

-- ErpOperationalKpi
CREATE TABLE IF NOT EXISTS "ErpOperationalKpi" (
  "id"          TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "projectId"   TEXT        REFERENCES "ErpProject"("id"),
  "name"        TEXT        NOT NULL,
  "value"       DOUBLE PRECISION NOT NULL,
  "target"      DOUBLE PRECISION,
  "unit"        TEXT,
  "category"    TEXT        NOT NULL,
  "periodStart" TIMESTAMPTZ,
  "periodEnd"   TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ErpOperationalKpi_projectId_idx" ON "ErpOperationalKpi"("projectId");
CREATE INDEX IF NOT EXISTS "ErpOperationalKpi_category_idx"  ON "ErpOperationalKpi"("category");
CREATE INDEX IF NOT EXISTS "ErpOperationalKpi_createdAt_idx" ON "ErpOperationalKpi"("createdAt");

-- ErpProjectCost
CREATE TABLE IF NOT EXISTS "ErpProjectCost" (
  "id"          TEXT             NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "projectId"   TEXT             NOT NULL REFERENCES "ErpProject"("id") ON DELETE CASCADE,
  "description" TEXT             NOT NULL,
  "amount"      DOUBLE PRECISION NOT NULL,
  "currency"    TEXT             NOT NULL DEFAULT 'USD',
  "category"    TEXT,
  "date"        TIMESTAMPTZ      NOT NULL,
  "createdBy"   TEXT,
  "createdAt"   TIMESTAMPTZ      NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ErpProjectCost_projectId_idx" ON "ErpProjectCost"("projectId");
CREATE INDEX IF NOT EXISTS "ErpProjectCost_date_idx"      ON "ErpProjectCost"("date");

-- ErpApprovalRequest
CREATE TABLE IF NOT EXISTS "ErpApprovalRequest" (
  "id"             TEXT                NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT,
  "projectId"      TEXT                REFERENCES "ErpProject"("id"),
  "workOrderId"    TEXT                REFERENCES "ErpWorkOrder"("id"),
  "requestedBy"    TEXT,
  "title"          TEXT                NOT NULL,
  "description"    TEXT,
  "status"         "ErpApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "decidedAt"      TIMESTAMPTZ,
  "decidedBy"      TEXT,
  "decision"       TEXT,
  "createdAt"      TIMESTAMPTZ         NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ         NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ErpApprovalRequest_status_idx"         ON "ErpApprovalRequest"("status");
CREATE INDEX IF NOT EXISTS "ErpApprovalRequest_organizationId_idx" ON "ErpApprovalRequest"("organizationId");
CREATE INDEX IF NOT EXISTS "ErpApprovalRequest_projectId_idx"      ON "ErpApprovalRequest"("projectId");
CREATE INDEX IF NOT EXISTS "ErpApprovalRequest_workOrderId_idx"    ON "ErpApprovalRequest"("workOrderId");

-- ErpApprovalStep
CREATE TABLE IF NOT EXISTS "ErpApprovalStep" (
  "id"           TEXT                NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "requestId"    TEXT                NOT NULL REFERENCES "ErpApprovalRequest"("id") ON DELETE CASCADE,
  "order"        INTEGER             NOT NULL,
  "approverRole" TEXT                NOT NULL,
  "status"       "ErpApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "decidedBy"    TEXT,
  "decidedAt"    TIMESTAMPTZ,
  "notes"        TEXT,
  "createdAt"    TIMESTAMPTZ         NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ErpApprovalStep_requestId_idx" ON "ErpApprovalStep"("requestId");

-- ErpAuditEvent
CREATE TABLE IF NOT EXISTS "ErpAuditEvent" (
  "id"             TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT,
  "entityType"     TEXT        NOT NULL,
  "entityId"       TEXT,
  "userId"         TEXT,
  "eventType"      TEXT        NOT NULL,
  "description"    TEXT        NOT NULL,
  "before"         JSONB,
  "after"          JSONB,
  "metadata"       JSONB       NOT NULL DEFAULT '{}',
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ErpAuditEvent_entityType_idx" ON "ErpAuditEvent"("entityType");
CREATE INDEX IF NOT EXISTS "ErpAuditEvent_entityId_idx"   ON "ErpAuditEvent"("entityId");
CREATE INDEX IF NOT EXISTS "ErpAuditEvent_userId_idx"     ON "ErpAuditEvent"("userId");
CREATE INDEX IF NOT EXISTS "ErpAuditEvent_createdAt_idx"  ON "ErpAuditEvent"("createdAt");
