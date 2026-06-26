-- Phase 70 — Enterprise CMMS (Computerized Maintenance Management System)
-- Idempotent: IF NOT EXISTS + duplicate_object exception guards

-- ── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "MaintenancePriority" AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL','EMERGENCY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MaintenanceStatus" AS ENUM ('DRAFT','PLANNED','SCHEDULED','IN_PROGRESS','ON_HOLD','COMPLETED','CANCELLED','OVERDUE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MaintenanceType" AS ENUM ('PREVENTIVE','PREDICTIVE','CORRECTIVE','EMERGENCY','SHUTDOWN','INSPECTION','LUBRICATION','CALIBRATION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CmmsFailureSeverity" AS ENUM ('MINOR','MODERATE','MAJOR','CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CmmsFailureCategory" AS ENUM ('MECHANICAL','ELECTRICAL','INSTRUMENTATION','SOFTWARE','HYDRAULIC','PNEUMATIC','STRUCTURAL','OPERATIONAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WorkOrderType" AS ENUM ('PLANNED','UNPLANNED','EMERGENCY','PROJECT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DowntimeReason" AS ENUM ('PLANNED_MAINTENANCE','BREAKDOWN','SETUP','WAITING_PARTS','WAITING_APPROVAL','EXTERNAL','UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CmmsApprovalStatus" AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "MaintenancePlan" (
  "id"              TEXT                  NOT NULL PRIMARY KEY,
  "organizationId"  TEXT,
  "assetId"         TEXT,
  "workCenterId"    TEXT,
  "name"            TEXT                  NOT NULL,
  "description"     TEXT,
  "maintenanceType" "MaintenanceType"     NOT NULL DEFAULT 'PREVENTIVE',
  "priority"        "MaintenancePriority" NOT NULL DEFAULT 'MEDIUM',
  "frequencyDays"   INTEGER               NOT NULL DEFAULT 30,
  "estimatedHours"  DOUBLE PRECISION      NOT NULL DEFAULT 2,
  "leadTimeDays"    INTEGER               NOT NULL DEFAULT 7,
  "isActive"        BOOLEAN               NOT NULL DEFAULT true,
  "lastExecutedAt"  TIMESTAMP(3),
  "nextDueAt"       TIMESTAMP(3),
  "createdBy"       TEXT,
  "createdAt"       TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "MaintenanceSchedule" (
  "id"             TEXT                  NOT NULL PRIMARY KEY,
  "organizationId" TEXT,
  "planId"         TEXT,
  "assetId"        TEXT,
  "taskId"         TEXT,
  "name"           TEXT                  NOT NULL,
  "scheduledDate"  TIMESTAMP(3)          NOT NULL,
  "estimatedHours" DOUBLE PRECISION      NOT NULL DEFAULT 2,
  "priority"       "MaintenancePriority" NOT NULL DEFAULT 'MEDIUM',
  "status"         "MaintenanceStatus"   NOT NULL DEFAULT 'PLANNED',
  "technicianId"   TEXT,
  "teamId"         TEXT,
  "notes"          TEXT,
  "completedAt"    TIMESTAMP(3),
  "createdBy"      TEXT,
  "createdAt"      TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceSchedule_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MaintenancePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "MaintenanceTask" (
  "id"               TEXT                  NOT NULL PRIMARY KEY,
  "organizationId"   TEXT,
  "planId"           TEXT,
  "assetId"          TEXT,
  "workCenterId"     TEXT,
  "failureId"        TEXT,
  "workOrderType"    "WorkOrderType"       NOT NULL DEFAULT 'PLANNED',
  "title"            TEXT                  NOT NULL,
  "description"      TEXT,
  "maintenanceType"  "MaintenanceType"     NOT NULL DEFAULT 'PREVENTIVE',
  "priority"         "MaintenancePriority" NOT NULL DEFAULT 'MEDIUM',
  "status"           "MaintenanceStatus"   NOT NULL DEFAULT 'DRAFT',
  "scheduledDate"    TIMESTAMP(3),
  "dueDate"          TIMESTAMP(3),
  "startedAt"        TIMESTAMP(3),
  "completedAt"      TIMESTAMP(3),
  "estimatedHours"   DOUBLE PRECISION,
  "actualHours"      DOUBLE PRECISION,
  "technicianId"     TEXT,
  "teamId"           TEXT,
  "workCenterCode"   TEXT,
  "erpWorkOrderId"   TEXT,
  "vendorId"         TEXT,
  "requiresApproval" BOOLEAN               NOT NULL DEFAULT false,
  "approvalStatus"   "CmmsApprovalStatus",
  "createdBy"        TEXT,
  "deletedAt"        TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceTask_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MaintenancePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "MaintenanceExecution" (
  "id"           TEXT         NOT NULL PRIMARY KEY,
  "taskId"       TEXT         NOT NULL,
  "technicianId" TEXT,
  "startedAt"    TIMESTAMP(3) NOT NULL,
  "completedAt"  TIMESTAMP(3),
  "actualHours"  DOUBLE PRECISION,
  "notes"        TEXT,
  "outcome"      TEXT,
  "meterReading" DOUBLE PRECISION,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceExecution_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MaintenanceTask"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "MaintenanceChecklist" (
  "id"          TEXT         NOT NULL PRIMARY KEY,
  "taskId"      TEXT,
  "templateId"  TEXT,
  "name"        TEXT         NOT NULL,
  "description" TEXT,
  "isTemplate"  BOOLEAN      NOT NULL DEFAULT false,
  "assetType"   TEXT,
  "createdBy"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceChecklist_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MaintenanceTask"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ChecklistItem" (
  "id"            TEXT         NOT NULL PRIMARY KEY,
  "checklistId"   TEXT         NOT NULL,
  "order"         INTEGER      NOT NULL,
  "description"   TEXT         NOT NULL,
  "isRequired"    BOOLEAN      NOT NULL DEFAULT true,
  "expectedValue" TEXT,
  "actualValue"   TEXT,
  "isCompleted"   BOOLEAN      NOT NULL DEFAULT false,
  "completedBy"   TEXT,
  "completedAt"   TIMESTAMP(3),
  "notes"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "MaintenanceChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "MaintenanceTechnician" (
  "id"             TEXT         NOT NULL PRIMARY KEY,
  "organizationId" TEXT,
  "userId"         TEXT,
  "name"           TEXT         NOT NULL,
  "employeeId"     TEXT,
  "specialty"      TEXT,
  "skills"         TEXT[]       NOT NULL DEFAULT '{}',
  "certifications" TEXT[]       NOT NULL DEFAULT '{}',
  "teamId"         TEXT,
  "isAvailable"    BOOLEAN      NOT NULL DEFAULT true,
  "laborRate"      DOUBLE PRECISION,
  "phone"          TEXT,
  "email"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "MaintenanceTeam" (
  "id"             TEXT         NOT NULL PRIMARY KEY,
  "organizationId" TEXT,
  "name"           TEXT         NOT NULL,
  "description"    TEXT,
  "leadId"         TEXT,
  "specialty"      TEXT,
  "capacity"       INTEGER      NOT NULL DEFAULT 5,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "MaintenanceWorkCenter" (
  "id"             TEXT         NOT NULL PRIMARY KEY,
  "organizationId" TEXT,
  "code"           TEXT         NOT NULL,
  "name"           TEXT         NOT NULL,
  "description"    TEXT,
  "location"       TEXT,
  "costCenter"     TEXT,
  "isActive"       BOOLEAN      NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "MaintenanceCalendar" (
  "id"             TEXT                  NOT NULL PRIMARY KEY,
  "organizationId" TEXT,
  "taskId"         TEXT,
  "title"          TEXT                  NOT NULL,
  "description"    TEXT,
  "startDate"      TIMESTAMP(3)          NOT NULL,
  "endDate"        TIMESTAMP(3),
  "allDay"         BOOLEAN               NOT NULL DEFAULT false,
  "eventType"      TEXT                  NOT NULL DEFAULT 'maintenance',
  "assetId"        TEXT,
  "technicianId"   TEXT,
  "priority"       "MaintenancePriority" NOT NULL DEFAULT 'MEDIUM',
  "color"          TEXT,
  "createdBy"      TEXT,
  "createdAt"      TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "MaintenanceDowntime" (
  "id"              TEXT             NOT NULL PRIMARY KEY,
  "organizationId"  TEXT,
  "assetId"         TEXT,
  "taskId"          TEXT,
  "reason"          "DowntimeReason" NOT NULL DEFAULT 'UNKNOWN',
  "startedAt"       TIMESTAMP(3)     NOT NULL,
  "endedAt"         TIMESTAMP(3),
  "durationMinutes" INTEGER,
  "description"     TEXT,
  "impact"          TEXT,
  "productionLoss"  DOUBLE PRECISION,
  "currency"        TEXT             NOT NULL DEFAULT 'USD',
  "reportedBy"      TEXT,
  "createdAt"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "MaintenanceFailure" (
  "id"              TEXT              NOT NULL PRIMARY KEY,
  "organizationId"  TEXT,
  "assetId"         TEXT,
  "taskId"          TEXT,
  "failureCodeId"   TEXT,
  "title"           TEXT              NOT NULL,
  "description"     TEXT              NOT NULL,
  "severity"        "CmmsFailureSeverity" NOT NULL DEFAULT 'MODERATE',
  "category"        "CmmsFailureCategory" NOT NULL DEFAULT 'MECHANICAL',
  "occurredAt"      TIMESTAMP(3)      NOT NULL,
  "detectedAt"      TIMESTAMP(3),
  "resolvedAt"      TIMESTAMP(3),
  "downtimeMinutes" INTEGER,
  "reportedBy"      TEXT,
  "createdAt"       TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "FailureCode" (
  "id"          TEXT              NOT NULL PRIMARY KEY,
  "code"        TEXT              NOT NULL,
  "name"        TEXT              NOT NULL,
  "category"    "CmmsFailureCategory" NOT NULL DEFAULT 'MECHANICAL',
  "description" TEXT,
  "severity"    "CmmsFailureSeverity" NOT NULL DEFAULT 'MODERATE',
  "isActive"    BOOLEAN           NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FailureCode_code_key" UNIQUE ("code")
);

CREATE TABLE IF NOT EXISTS "FailureCause" (
  "id"          TEXT             NOT NULL PRIMARY KEY,
  "failureId"   TEXT             NOT NULL,
  "cause"       TEXT             NOT NULL,
  "probability" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "isConfirmed" BOOLEAN          NOT NULL DEFAULT false,
  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FailureCause_failureId_fkey" FOREIGN KEY ("failureId") REFERENCES "MaintenanceFailure"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "CorrectiveAction" (
  "id"          TEXT         NOT NULL PRIMARY KEY,
  "failureId"   TEXT         NOT NULL,
  "action"      TEXT         NOT NULL,
  "assignedTo"  TEXT,
  "dueDate"     TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "status"      TEXT         NOT NULL DEFAULT 'OPEN',
  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CorrectiveAction_failureId_fkey" FOREIGN KEY ("failureId") REFERENCES "MaintenanceFailure"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "MaintenanceCost" (
  "id"          TEXT             NOT NULL PRIMARY KEY,
  "taskId"      TEXT             NOT NULL,
  "category"    TEXT             NOT NULL,
  "description" TEXT             NOT NULL,
  "amount"      DOUBLE PRECISION NOT NULL,
  "currency"    TEXT             NOT NULL DEFAULT 'USD',
  "date"        TIMESTAMP(3)     NOT NULL,
  "invoiceRef"  TEXT,
  "vendorId"    TEXT,
  "createdBy"   TEXT,
  "createdAt"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceCost_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MaintenanceTask"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "MaintenanceSparePart" (
  "id"             TEXT             NOT NULL PRIMARY KEY,
  "organizationId" TEXT,
  "partNumber"     TEXT             NOT NULL,
  "name"           TEXT             NOT NULL,
  "description"    TEXT,
  "category"       TEXT,
  "manufacturer"   TEXT,
  "unitCost"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currency"       TEXT             NOT NULL DEFAULT 'USD',
  "stockQty"       INTEGER          NOT NULL DEFAULT 0,
  "minStockQty"    INTEGER          NOT NULL DEFAULT 1,
  "unit"           TEXT             NOT NULL DEFAULT 'pcs',
  "location"       TEXT,
  "erpItemId"      TEXT,
  "vendorId"       TEXT,
  "isActive"       BOOLEAN          NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "MaintenanceSpareUsage" (
  "id"        TEXT             NOT NULL PRIMARY KEY,
  "taskId"    TEXT             NOT NULL,
  "partId"    TEXT             NOT NULL,
  "quantity"  DOUBLE PRECISION NOT NULL,
  "unitCost"  DOUBLE PRECISION NOT NULL,
  "totalCost" DOUBLE PRECISION NOT NULL,
  "usedBy"    TEXT,
  "notes"     TEXT,
  "usedAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceSpareUsage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MaintenanceTask"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceSpareUsage_partId_fkey" FOREIGN KEY ("partId") REFERENCES "MaintenanceSparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "MaintenancePhoto" (
  "id"       TEXT         NOT NULL PRIMARY KEY,
  "taskId"   TEXT         NOT NULL,
  "fileName" TEXT         NOT NULL,
  "filePath" TEXT         NOT NULL,
  "caption"  TEXT,
  "takenAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "takenBy"  TEXT,
  "fileSize" INTEGER,
  "mimeType" TEXT,
  CONSTRAINT "MaintenancePhoto_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MaintenanceTask"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "MaintenanceAttachment" (
  "id"          TEXT         NOT NULL PRIMARY KEY,
  "taskId"      TEXT         NOT NULL,
  "fileName"    TEXT         NOT NULL,
  "filePath"    TEXT         NOT NULL,
  "fileSize"    INTEGER,
  "mimeType"    TEXT,
  "description" TEXT,
  "uploadedBy"  TEXT,
  "uploadedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MaintenanceTask"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "MaintenanceComment" (
  "id"         TEXT         NOT NULL PRIMARY KEY,
  "taskId"     TEXT         NOT NULL,
  "userId"     TEXT,
  "content"    TEXT         NOT NULL,
  "isInternal" BOOLEAN      NOT NULL DEFAULT false,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MaintenanceTask"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "MaintenanceApproval" (
  "id"           TEXT                 NOT NULL PRIMARY KEY,
  "taskId"       TEXT                 NOT NULL,
  "stage"        INTEGER              NOT NULL DEFAULT 1,
  "approverRole" TEXT                 NOT NULL DEFAULT 'admin',
  "assignedTo"   TEXT,
  "status"       "CmmsApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "comment"      TEXT,
  "decidedAt"    TIMESTAMP(3),
  "decidedBy"    TEXT,
  "dueDate"      TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceApproval_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MaintenanceTask"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "MaintenanceHistory" (
  "id"          TEXT         NOT NULL PRIMARY KEY,
  "taskId"      TEXT         NOT NULL,
  "userId"      TEXT,
  "action"      TEXT         NOT NULL,
  "description" TEXT,
  "before"      JSONB,
  "after"       JSONB,
  "metadata"    JSONB        NOT NULL DEFAULT '{}',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceHistory_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MaintenanceTask"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "MaintenanceNotification" (
  "id"      TEXT         NOT NULL PRIMARY KEY,
  "taskId"  TEXT,
  "userId"  TEXT,
  "type"    TEXT         NOT NULL,
  "title"   TEXT         NOT NULL,
  "message" TEXT         NOT NULL,
  "isRead"  BOOLEAN      NOT NULL DEFAULT false,
  "readAt"  TIMESTAMP(3),
  "sentAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceNotification_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MaintenanceTask"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "MaintenancePlan_organizationId_idx" ON "MaintenancePlan"("organizationId");
CREATE INDEX IF NOT EXISTS "MaintenancePlan_assetId_idx"        ON "MaintenancePlan"("assetId");
CREATE INDEX IF NOT EXISTS "MaintenancePlan_maintenanceType_idx" ON "MaintenancePlan"("maintenanceType");
CREATE INDEX IF NOT EXISTS "MaintenancePlan_nextDueAt_idx"      ON "MaintenancePlan"("nextDueAt");

CREATE INDEX IF NOT EXISTS "MaintenanceSchedule_organizationId_idx" ON "MaintenanceSchedule"("organizationId");
CREATE INDEX IF NOT EXISTS "MaintenanceSchedule_planId_idx"         ON "MaintenanceSchedule"("planId");
CREATE INDEX IF NOT EXISTS "MaintenanceSchedule_assetId_idx"        ON "MaintenanceSchedule"("assetId");
CREATE INDEX IF NOT EXISTS "MaintenanceSchedule_scheduledDate_idx"  ON "MaintenanceSchedule"("scheduledDate");
CREATE INDEX IF NOT EXISTS "MaintenanceSchedule_status_idx"         ON "MaintenanceSchedule"("status");

CREATE INDEX IF NOT EXISTS "MaintenanceTask_organizationId_idx" ON "MaintenanceTask"("organizationId");
CREATE INDEX IF NOT EXISTS "MaintenanceTask_planId_idx"         ON "MaintenanceTask"("planId");
CREATE INDEX IF NOT EXISTS "MaintenanceTask_assetId_idx"        ON "MaintenanceTask"("assetId");
CREATE INDEX IF NOT EXISTS "MaintenanceTask_status_idx"         ON "MaintenanceTask"("status");
CREATE INDEX IF NOT EXISTS "MaintenanceTask_priority_idx"       ON "MaintenanceTask"("priority");
CREATE INDEX IF NOT EXISTS "MaintenanceTask_scheduledDate_idx"  ON "MaintenanceTask"("scheduledDate");
CREATE INDEX IF NOT EXISTS "MaintenanceTask_technicianId_idx"   ON "MaintenanceTask"("technicianId");

CREATE INDEX IF NOT EXISTS "MaintenanceExecution_taskId_idx"       ON "MaintenanceExecution"("taskId");
CREATE INDEX IF NOT EXISTS "MaintenanceExecution_technicianId_idx" ON "MaintenanceExecution"("technicianId");

CREATE INDEX IF NOT EXISTS "MaintenanceChecklist_taskId_idx"    ON "MaintenanceChecklist"("taskId");
CREATE INDEX IF NOT EXISTS "MaintenanceChecklist_isTemplate_idx" ON "MaintenanceChecklist"("isTemplate");

CREATE INDEX IF NOT EXISTS "ChecklistItem_checklistId_idx" ON "ChecklistItem"("checklistId");

CREATE INDEX IF NOT EXISTS "MaintenanceTechnician_organizationId_idx" ON "MaintenanceTechnician"("organizationId");
CREATE INDEX IF NOT EXISTS "MaintenanceTechnician_teamId_idx"         ON "MaintenanceTechnician"("teamId");

CREATE INDEX IF NOT EXISTS "MaintenanceTeam_organizationId_idx" ON "MaintenanceTeam"("organizationId");

CREATE INDEX IF NOT EXISTS "MaintenanceWorkCenter_organizationId_idx" ON "MaintenanceWorkCenter"("organizationId");
CREATE INDEX IF NOT EXISTS "MaintenanceWorkCenter_code_idx"           ON "MaintenanceWorkCenter"("code");

CREATE INDEX IF NOT EXISTS "MaintenanceCalendar_organizationId_idx" ON "MaintenanceCalendar"("organizationId");
CREATE INDEX IF NOT EXISTS "MaintenanceCalendar_taskId_idx"         ON "MaintenanceCalendar"("taskId");
CREATE INDEX IF NOT EXISTS "MaintenanceCalendar_startDate_idx"      ON "MaintenanceCalendar"("startDate");
CREATE INDEX IF NOT EXISTS "MaintenanceCalendar_assetId_idx"        ON "MaintenanceCalendar"("assetId");

CREATE INDEX IF NOT EXISTS "MaintenanceDowntime_organizationId_idx" ON "MaintenanceDowntime"("organizationId");
CREATE INDEX IF NOT EXISTS "MaintenanceDowntime_assetId_idx"        ON "MaintenanceDowntime"("assetId");
CREATE INDEX IF NOT EXISTS "MaintenanceDowntime_startedAt_idx"      ON "MaintenanceDowntime"("startedAt");
CREATE INDEX IF NOT EXISTS "MaintenanceDowntime_reason_idx"         ON "MaintenanceDowntime"("reason");

CREATE INDEX IF NOT EXISTS "MaintenanceFailure_organizationId_idx" ON "MaintenanceFailure"("organizationId");
CREATE INDEX IF NOT EXISTS "MaintenanceFailure_assetId_idx"        ON "MaintenanceFailure"("assetId");
CREATE INDEX IF NOT EXISTS "MaintenanceFailure_severity_idx"       ON "MaintenanceFailure"("severity");
CREATE INDEX IF NOT EXISTS "MaintenanceFailure_occurredAt_idx"     ON "MaintenanceFailure"("occurredAt");

CREATE INDEX IF NOT EXISTS "FailureCode_category_idx" ON "FailureCode"("category");
CREATE INDEX IF NOT EXISTS "FailureCode_code_idx"     ON "FailureCode"("code");

CREATE INDEX IF NOT EXISTS "FailureCause_failureId_idx" ON "FailureCause"("failureId");

CREATE INDEX IF NOT EXISTS "CorrectiveAction_failureId_idx" ON "CorrectiveAction"("failureId");

CREATE INDEX IF NOT EXISTS "MaintenanceCost_taskId_idx"   ON "MaintenanceCost"("taskId");
CREATE INDEX IF NOT EXISTS "MaintenanceCost_category_idx" ON "MaintenanceCost"("category");
CREATE INDEX IF NOT EXISTS "MaintenanceCost_date_idx"     ON "MaintenanceCost"("date");

CREATE INDEX IF NOT EXISTS "MaintenanceSparePart_organizationId_idx" ON "MaintenanceSparePart"("organizationId");
CREATE INDEX IF NOT EXISTS "MaintenanceSparePart_partNumber_idx"     ON "MaintenanceSparePart"("partNumber");
CREATE INDEX IF NOT EXISTS "MaintenanceSparePart_category_idx"       ON "MaintenanceSparePart"("category");

CREATE INDEX IF NOT EXISTS "MaintenanceSpareUsage_taskId_idx" ON "MaintenanceSpareUsage"("taskId");
CREATE INDEX IF NOT EXISTS "MaintenanceSpareUsage_partId_idx" ON "MaintenanceSpareUsage"("partId");

CREATE INDEX IF NOT EXISTS "MaintenancePhoto_taskId_idx"      ON "MaintenancePhoto"("taskId");
CREATE INDEX IF NOT EXISTS "MaintenanceAttachment_taskId_idx" ON "MaintenanceAttachment"("taskId");
CREATE INDEX IF NOT EXISTS "MaintenanceComment_taskId_idx"    ON "MaintenanceComment"("taskId");

CREATE INDEX IF NOT EXISTS "MaintenanceApproval_taskId_idx" ON "MaintenanceApproval"("taskId");
CREATE INDEX IF NOT EXISTS "MaintenanceApproval_status_idx" ON "MaintenanceApproval"("status");

CREATE INDEX IF NOT EXISTS "MaintenanceHistory_taskId_idx"   ON "MaintenanceHistory"("taskId");
CREATE INDEX IF NOT EXISTS "MaintenanceHistory_createdAt_idx" ON "MaintenanceHistory"("createdAt");

CREATE INDEX IF NOT EXISTS "MaintenanceNotification_taskId_idx" ON "MaintenanceNotification"("taskId");
CREATE INDEX IF NOT EXISTS "MaintenanceNotification_userId_idx" ON "MaintenanceNotification"("isRead");
CREATE INDEX IF NOT EXISTS "MaintenanceNotification_isRead_idx" ON "MaintenanceNotification"("userId");

-- Foreign key for MaintenanceFailure → FailureCode (deferred to avoid ordering issues)
DO $$ BEGIN
  ALTER TABLE "MaintenanceFailure"
    ADD CONSTRAINT "MaintenanceFailure_failureCodeId_fkey"
    FOREIGN KEY ("failureCodeId") REFERENCES "FailureCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
