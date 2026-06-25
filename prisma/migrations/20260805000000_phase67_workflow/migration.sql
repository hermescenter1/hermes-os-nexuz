-- Phase 67: Enterprise Workflow & Automation Engine
-- 12 new models, 5 new enums for deterministic workflow management.

-- Enums
DO $$ BEGIN CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT','ACTIVE','PAUSED','ARCHIVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "WorkflowTriggerType" AS ENUM ('MANUAL','SCHEDULED','CRM_LEAD_CREATED','CRM_OPPORTUNITY_WON','CRM_CUSTOMER_AT_RISK','ATS_CANDIDATE_CREATED','ATS_APPLICATION_SUBMITTED','ACADEMY_COURSE_COMPLETED','VENDOR_ONBOARDING_REQUESTED','CUSTOMER_SUPPORT_TICKET_CREATED','INDUSTRIAL_ASSET_RISK_HIGH','KNOWLEDGE_ARTICLE_CREATED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "WorkflowConditionType" AS ENUM ('ALWAYS','FIELD_EQUALS','FIELD_NOT_EQUALS','FIELD_GREATER_THAN','FIELD_LESS_THAN','STATUS_IS','ROLE_IS','HEALTH_SCORE_BELOW','PRIORITY_IS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "WorkflowActionType" AS ENUM ('CREATE_NOTIFICATION','CREATE_TASK','CREATE_SUPPORT_TICKET','CREATE_CRM_ACTIVITY','UPDATE_RECORD_STATUS','ASSIGN_OWNER','CREATE_AUDIT_LOG','SEND_WEBHOOK','CREATE_KNOWLEDGE_NOTE','CREATE_MAINTENANCE_ALERT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "WorkflowExecutionStatus" AS ENUM ('QUEUED','RUNNING','SUCCESS','FAILED','PARTIAL','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- WorkflowDefinition
CREATE TABLE IF NOT EXISTS "WorkflowDefinition" (
  "id"             TEXT               NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT,
  "name"           TEXT               NOT NULL,
  "description"    TEXT,
  "status"         "WorkflowStatus"   NOT NULL DEFAULT 'DRAFT',
  "triggerType"    "WorkflowTriggerType" NOT NULL,
  "templateId"     TEXT,
  "createdBy"      TEXT,
  "updatedBy"      TEXT,
  "deletedAt"      TIMESTAMPTZ,
  "createdAt"      TIMESTAMPTZ        NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ        NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "WorkflowDefinition_status_idx"         ON "WorkflowDefinition"("status");
CREATE INDEX IF NOT EXISTS "WorkflowDefinition_triggerType_idx"    ON "WorkflowDefinition"("triggerType");
CREATE INDEX IF NOT EXISTS "WorkflowDefinition_organizationId_idx" ON "WorkflowDefinition"("organizationId");
CREATE INDEX IF NOT EXISTS "WorkflowDefinition_createdAt_idx"      ON "WorkflowDefinition"("createdAt");

-- WorkflowVersion
CREATE TABLE IF NOT EXISTS "WorkflowVersion" (
  "id"        TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "workflowId" TEXT       NOT NULL REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE,
  "version"   INTEGER     NOT NULL,
  "snapshot"  JSONB       NOT NULL DEFAULT '{}',
  "createdBy" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "WorkflowVersion_workflowId_idx" ON "WorkflowVersion"("workflowId");

-- WorkflowTrigger
CREATE TABLE IF NOT EXISTS "WorkflowTrigger" (
  "id"         TEXT                   NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "workflowId" TEXT                   NOT NULL REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE,
  "type"       "WorkflowTriggerType"  NOT NULL,
  "config"     JSONB                  NOT NULL DEFAULT '{}',
  "createdAt"  TIMESTAMPTZ            NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ            NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "WorkflowTrigger_workflowId_idx" ON "WorkflowTrigger"("workflowId");
CREATE INDEX IF NOT EXISTS "WorkflowTrigger_type_idx"       ON "WorkflowTrigger"("type");

-- WorkflowCondition
CREATE TABLE IF NOT EXISTS "WorkflowCondition" (
  "id"         TEXT                    NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "workflowId" TEXT                    NOT NULL REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE,
  "type"       "WorkflowConditionType" NOT NULL,
  "field"      TEXT,
  "operator"   TEXT,
  "value"      TEXT,
  "logicGroup" INTEGER                 NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMPTZ             NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ             NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "WorkflowCondition_workflowId_idx" ON "WorkflowCondition"("workflowId");

-- WorkflowAction
CREATE TABLE IF NOT EXISTS "WorkflowAction" (
  "id"         TEXT                 NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "workflowId" TEXT                 NOT NULL REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE,
  "type"       "WorkflowActionType" NOT NULL,
  "order"      INTEGER              NOT NULL DEFAULT 0,
  "config"     JSONB                NOT NULL DEFAULT '{}',
  "createdAt"  TIMESTAMPTZ          NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ          NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "WorkflowAction_workflowId_idx" ON "WorkflowAction"("workflowId");
CREATE INDEX IF NOT EXISTS "WorkflowAction_order_idx"      ON "WorkflowAction"("order");

-- WorkflowExecution
CREATE TABLE IF NOT EXISTS "WorkflowExecution" (
  "id"           TEXT                     NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "workflowId"   TEXT                     NOT NULL REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE,
  "status"       "WorkflowExecutionStatus" NOT NULL DEFAULT 'QUEUED',
  "triggeredBy"  TEXT,
  "triggerData"  JSONB                    NOT NULL DEFAULT '{}',
  "startedAt"    TIMESTAMPTZ,
  "finishedAt"   TIMESTAMPTZ,
  "durationMs"   INTEGER,
  "errorMessage" TEXT,
  "isSimulation" BOOLEAN                  NOT NULL DEFAULT false,
  "createdAt"    TIMESTAMPTZ              NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "WorkflowExecution_workflowId_idx" ON "WorkflowExecution"("workflowId");
CREATE INDEX IF NOT EXISTS "WorkflowExecution_status_idx"     ON "WorkflowExecution"("status");
CREATE INDEX IF NOT EXISTS "WorkflowExecution_createdAt_idx"  ON "WorkflowExecution"("createdAt");

-- WorkflowExecutionStep
CREATE TABLE IF NOT EXISTS "WorkflowExecutionStep" (
  "id"          TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "executionId" TEXT        NOT NULL REFERENCES "WorkflowExecution"("id") ON DELETE CASCADE,
  "stepType"    TEXT        NOT NULL,
  "stepOrder"   INTEGER     NOT NULL DEFAULT 0,
  "status"      TEXT        NOT NULL DEFAULT 'PENDING',
  "input"       JSONB       NOT NULL DEFAULT '{}',
  "output"      JSONB       NOT NULL DEFAULT '{}',
  "error"       TEXT,
  "durationMs"  INTEGER,
  "executedAt"  TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "WorkflowExecutionStep_executionId_idx" ON "WorkflowExecutionStep"("executionId");
CREATE INDEX IF NOT EXISTS "WorkflowExecutionStep_stepOrder_idx"   ON "WorkflowExecutionStep"("stepOrder");

-- WorkflowExecutionLog
CREATE TABLE IF NOT EXISTS "WorkflowExecutionLog" (
  "id"          TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "executionId" TEXT        NOT NULL REFERENCES "WorkflowExecution"("id") ON DELETE CASCADE,
  "level"       TEXT        NOT NULL DEFAULT 'INFO',
  "message"     TEXT        NOT NULL,
  "metadata"    JSONB       NOT NULL DEFAULT '{}',
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "WorkflowExecutionLog_executionId_idx" ON "WorkflowExecutionLog"("executionId");
CREATE INDEX IF NOT EXISTS "WorkflowExecutionLog_createdAt_idx"   ON "WorkflowExecutionLog"("createdAt");

-- WorkflowTemplate
CREATE TABLE IF NOT EXISTS "WorkflowTemplate" (
  "id"          TEXT                   NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "name"        TEXT                   NOT NULL,
  "description" TEXT,
  "category"    TEXT                   NOT NULL DEFAULT 'GENERAL',
  "triggerType" "WorkflowTriggerType"  NOT NULL,
  "definition"  JSONB                  NOT NULL DEFAULT '{}',
  "isBuiltIn"   BOOLEAN                NOT NULL DEFAULT false,
  "usageCount"  INTEGER                NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMPTZ            NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ            NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "WorkflowTemplate_category_idx"   ON "WorkflowTemplate"("category");
CREATE INDEX IF NOT EXISTS "WorkflowTemplate_triggerType_idx" ON "WorkflowTemplate"("triggerType");
CREATE INDEX IF NOT EXISTS "WorkflowTemplate_isBuiltIn_idx"  ON "WorkflowTemplate"("isBuiltIn");

-- WorkflowSchedule
CREATE TABLE IF NOT EXISTS "WorkflowSchedule" (
  "id"         TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "workflowId" TEXT        NOT NULL REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE,
  "cronExpr"   TEXT        NOT NULL,
  "timezone"   TEXT        NOT NULL DEFAULT 'Asia/Tehran',
  "isActive"   BOOLEAN     NOT NULL DEFAULT true,
  "lastRunAt"  TIMESTAMPTZ,
  "nextRunAt"  TIMESTAMPTZ,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "WorkflowSchedule_workflowId_idx" ON "WorkflowSchedule"("workflowId");
CREATE INDEX IF NOT EXISTS "WorkflowSchedule_isActive_idx"   ON "WorkflowSchedule"("isActive");
CREATE INDEX IF NOT EXISTS "WorkflowSchedule_nextRunAt_idx"  ON "WorkflowSchedule"("nextRunAt");

-- WorkflowWebhookEndpoint
CREATE TABLE IF NOT EXISTS "WorkflowWebhookEndpoint" (
  "id"              TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "workflowId"      TEXT,
  "organizationId"  TEXT,
  "name"            TEXT        NOT NULL,
  "url"             TEXT        NOT NULL,
  "isActive"        BOOLEAN     NOT NULL DEFAULT true,
  "lastDeliveredAt" TIMESTAMPTZ,
  "failureCount"    INTEGER     NOT NULL DEFAULT 0,
  "retryCount"      INTEGER     NOT NULL DEFAULT 0,
  "deletedAt"       TIMESTAMPTZ,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "WorkflowWebhookEndpoint_workflowId_idx"     ON "WorkflowWebhookEndpoint"("workflowId");
CREATE INDEX IF NOT EXISTS "WorkflowWebhookEndpoint_isActive_idx"        ON "WorkflowWebhookEndpoint"("isActive");
CREATE INDEX IF NOT EXISTS "WorkflowWebhookEndpoint_organizationId_idx"  ON "WorkflowWebhookEndpoint"("organizationId");

-- WorkflowAuditEvent
CREATE TABLE IF NOT EXISTS "WorkflowAuditEvent" (
  "id"          TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "workflowId"  TEXT        REFERENCES "WorkflowDefinition"("id"),
  "userId"      TEXT,
  "eventType"   TEXT        NOT NULL,
  "description" TEXT        NOT NULL,
  "before"      JSONB,
  "after"       JSONB,
  "metadata"    JSONB       NOT NULL DEFAULT '{}',
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "WorkflowAuditEvent_workflowId_idx" ON "WorkflowAuditEvent"("workflowId");
CREATE INDEX IF NOT EXISTS "WorkflowAuditEvent_eventType_idx"  ON "WorkflowAuditEvent"("eventType");
CREATE INDEX IF NOT EXISTS "WorkflowAuditEvent_createdAt_idx"  ON "WorkflowAuditEvent"("createdAt");
