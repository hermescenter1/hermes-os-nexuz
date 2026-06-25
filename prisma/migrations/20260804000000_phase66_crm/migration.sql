-- Phase 66: CRM & Customer Success Intelligence Platform
-- Adds 13 new models for lead management, opportunity pipeline, account management,
-- customer health scoring, journey tracking, success managers, renewals, and expansion.

-- Enums
DO $$ BEGIN
  CREATE TYPE "CrmLeadStatus" AS ENUM ('NEW','CONTACTED','QUALIFIED','PROPOSAL','NEGOTIATION','CONVERTED','LOST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CrmLeadSource" AS ENUM ('WEBSITE','LINKEDIN','REFERRAL','VENDOR','ACADEMY','ATS','MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CrmOpportunityStage" AS ENUM ('DISCOVERY','QUALIFICATION','PROPOSAL','TECHNICAL_REVIEW','COMMERCIAL_REVIEW','NEGOTIATION','WON','LOST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CrmHealthCategory" AS ENUM ('HEALTHY','WATCH','AT_RISK','CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CrmJourneyEventType" AS ENUM ('LEAD_CREATED','LEAD_QUALIFIED','DEMO_REQUESTED','PROPOSAL_SENT','CUSTOMER_WON','PORTAL_ACTIVATED','ACADEMY_ENROLLED','SUPPORT_TICKET_CREATED','RENEWAL_STARTED','RENEWAL_COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CrmLead
CREATE TABLE IF NOT EXISTS "CrmLead" (
  "id"             TEXT         NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT,
  "firstName"      TEXT         NOT NULL,
  "lastName"       TEXT         NOT NULL,
  "email"          TEXT         NOT NULL,
  "phone"          TEXT,
  "company"        TEXT,
  "jobTitle"       TEXT,
  "status"         "CrmLeadStatus"  NOT NULL DEFAULT 'NEW',
  "source"         "CrmLeadSource"  NOT NULL DEFAULT 'MANUAL',
  "score"          INTEGER      NOT NULL DEFAULT 0,
  "ownerId"        TEXT,
  "notes"          TEXT,
  "convertedAt"    TIMESTAMPTZ,
  "convertedToId"  TEXT,
  "deletedAt"      TIMESTAMPTZ,
  "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CrmLead_status_idx"         ON "CrmLead"("status");
CREATE INDEX IF NOT EXISTS "CrmLead_source_idx"         ON "CrmLead"("source");
CREATE INDEX IF NOT EXISTS "CrmLead_ownerId_idx"        ON "CrmLead"("ownerId");
CREATE INDEX IF NOT EXISTS "CrmLead_email_idx"          ON "CrmLead"("email");
CREATE INDEX IF NOT EXISTS "CrmLead_organizationId_idx" ON "CrmLead"("organizationId");

-- CrmLeadActivity
CREATE TABLE IF NOT EXISTS "CrmLeadActivity" (
  "id"        TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "leadId"    TEXT        NOT NULL REFERENCES "CrmLead"("id") ON DELETE CASCADE,
  "userId"    TEXT,
  "type"      TEXT        NOT NULL,
  "summary"   TEXT        NOT NULL,
  "metadata"  JSONB       NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CrmLeadActivity_leadId_idx"    ON "CrmLeadActivity"("leadId");
CREATE INDEX IF NOT EXISTS "CrmLeadActivity_createdAt_idx" ON "CrmLeadActivity"("createdAt");

-- CrmLeadNote
CREATE TABLE IF NOT EXISTS "CrmLeadNote" (
  "id"        TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "leadId"    TEXT        NOT NULL REFERENCES "CrmLead"("id") ON DELETE CASCADE,
  "authorId"  TEXT,
  "body"      TEXT        NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CrmLeadNote_leadId_idx" ON "CrmLeadNote"("leadId");

-- CrmAccount
CREATE TABLE IF NOT EXISTS "CrmAccount" (
  "id"             TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT        UNIQUE,
  "name"           TEXT        NOT NULL,
  "industry"       TEXT,
  "website"        TEXT,
  "phone"          TEXT,
  "address"        TEXT,
  "country"        TEXT,
  "tier"           TEXT        NOT NULL DEFAULT 'STANDARD',
  "status"         TEXT        NOT NULL DEFAULT 'ACTIVE',
  "annualRevenue"  DOUBLE PRECISION,
  "employeeCount"  INTEGER,
  "ownerId"        TEXT,
  "notes"          TEXT,
  "deletedAt"      TIMESTAMPTZ,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CrmAccount_status_idx"  ON "CrmAccount"("status");
CREATE INDEX IF NOT EXISTS "CrmAccount_ownerId_idx" ON "CrmAccount"("ownerId");
CREATE INDEX IF NOT EXISTS "CrmAccount_tier_idx"    ON "CrmAccount"("tier");

-- CrmAccountContact
CREATE TABLE IF NOT EXISTS "CrmAccountContact" (
  "id"        TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "accountId" TEXT        NOT NULL REFERENCES "CrmAccount"("id") ON DELETE CASCADE,
  "firstName" TEXT        NOT NULL,
  "lastName"  TEXT        NOT NULL,
  "email"     TEXT        NOT NULL,
  "phone"     TEXT,
  "jobTitle"  TEXT,
  "isPrimary" BOOLEAN     NOT NULL DEFAULT false,
  "deletedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CrmAccountContact_accountId_idx" ON "CrmAccountContact"("accountId");
CREATE INDEX IF NOT EXISTS "CrmAccountContact_email_idx"     ON "CrmAccountContact"("email");

-- CrmOpportunity
CREATE TABLE IF NOT EXISTS "CrmOpportunity" (
  "id"                TEXT                   NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "accountId"         TEXT                   REFERENCES "CrmAccount"("id"),
  "leadId"            TEXT,
  "title"             TEXT                   NOT NULL,
  "stage"             "CrmOpportunityStage"  NOT NULL DEFAULT 'DISCOVERY',
  "value"             DOUBLE PRECISION       NOT NULL DEFAULT 0,
  "probability"       INTEGER                NOT NULL DEFAULT 0,
  "expectedCloseDate" TIMESTAMPTZ,
  "ownerId"           TEXT,
  "teamIds"           JSONB                  NOT NULL DEFAULT '[]',
  "notes"             TEXT,
  "wonAt"             TIMESTAMPTZ,
  "lostAt"            TIMESTAMPTZ,
  "lostReason"        TEXT,
  "deletedAt"         TIMESTAMPTZ,
  "createdAt"         TIMESTAMPTZ            NOT NULL DEFAULT now(),
  "updatedAt"         TIMESTAMPTZ            NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CrmOpportunity_stage_idx"             ON "CrmOpportunity"("stage");
CREATE INDEX IF NOT EXISTS "CrmOpportunity_accountId_idx"         ON "CrmOpportunity"("accountId");
CREATE INDEX IF NOT EXISTS "CrmOpportunity_ownerId_idx"           ON "CrmOpportunity"("ownerId");
CREATE INDEX IF NOT EXISTS "CrmOpportunity_expectedCloseDate_idx" ON "CrmOpportunity"("expectedCloseDate");

-- CrmOpportunityActivity
CREATE TABLE IF NOT EXISTS "CrmOpportunityActivity" (
  "id"            TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "opportunityId" TEXT        NOT NULL REFERENCES "CrmOpportunity"("id") ON DELETE CASCADE,
  "userId"        TEXT,
  "type"          TEXT        NOT NULL,
  "summary"       TEXT        NOT NULL,
  "metadata"      JSONB       NOT NULL DEFAULT '{}',
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CrmOpportunityActivity_opportunityId_idx" ON "CrmOpportunityActivity"("opportunityId");

-- CrmDeal
CREATE TABLE IF NOT EXISTS "CrmDeal" (
  "id"            TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "accountId"     TEXT        REFERENCES "CrmAccount"("id"),
  "opportunityId" TEXT,
  "title"         TEXT        NOT NULL,
  "value"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status"        TEXT        NOT NULL DEFAULT 'OPEN',
  "closedAt"      TIMESTAMPTZ,
  "deletedAt"     TIMESTAMPTZ,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CrmDeal_accountId_idx" ON "CrmDeal"("accountId");
CREATE INDEX IF NOT EXISTS "CrmDeal_status_idx"    ON "CrmDeal"("status");

-- CrmDealNote
CREATE TABLE IF NOT EXISTS "CrmDealNote" (
  "id"        TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "dealId"    TEXT        NOT NULL REFERENCES "CrmDeal"("id") ON DELETE CASCADE,
  "authorId"  TEXT,
  "body"      TEXT        NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CrmDealNote_dealId_idx" ON "CrmDealNote"("dealId");

-- CrmHealthScore
CREATE TABLE IF NOT EXISTS "CrmHealthScore" (
  "id"           TEXT               NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "accountId"    TEXT               NOT NULL REFERENCES "CrmAccount"("id") ON DELETE CASCADE,
  "score"        INTEGER            NOT NULL DEFAULT 0,
  "category"     "CrmHealthCategory" NOT NULL DEFAULT 'HEALTHY',
  "loginScore"   INTEGER            NOT NULL DEFAULT 0,
  "projectScore" INTEGER            NOT NULL DEFAULT 0,
  "ticketScore"  INTEGER            NOT NULL DEFAULT 0,
  "academyScore" INTEGER            NOT NULL DEFAULT 0,
  "billingScore" INTEGER            NOT NULL DEFAULT 0,
  "adoptionScore" INTEGER           NOT NULL DEFAULT 0,
  "metadata"     JSONB              NOT NULL DEFAULT '{}',
  "computedAt"   TIMESTAMPTZ        NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CrmHealthScore_accountId_idx"  ON "CrmHealthScore"("accountId");
CREATE INDEX IF NOT EXISTS "CrmHealthScore_category_idx"   ON "CrmHealthScore"("category");
CREATE INDEX IF NOT EXISTS "CrmHealthScore_computedAt_idx" ON "CrmHealthScore"("computedAt");

-- CrmJourneyEvent
CREATE TABLE IF NOT EXISTS "CrmJourneyEvent" (
  "id"          TEXT                  NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "accountId"   TEXT                  REFERENCES "CrmAccount"("id"),
  "leadId"      TEXT,
  "eventType"   "CrmJourneyEventType" NOT NULL,
  "description" TEXT,
  "metadata"    JSONB                 NOT NULL DEFAULT '{}',
  "occurredAt"  TIMESTAMPTZ           NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CrmJourneyEvent_accountId_idx"  ON "CrmJourneyEvent"("accountId");
CREATE INDEX IF NOT EXISTS "CrmJourneyEvent_leadId_idx"     ON "CrmJourneyEvent"("leadId");
CREATE INDEX IF NOT EXISTS "CrmJourneyEvent_eventType_idx"  ON "CrmJourneyEvent"("eventType");
CREATE INDEX IF NOT EXISTS "CrmJourneyEvent_occurredAt_idx" ON "CrmJourneyEvent"("occurredAt");

-- CrmSuccessManager
CREATE TABLE IF NOT EXISTS "CrmSuccessManager" (
  "id"          TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"      TEXT        NOT NULL UNIQUE,
  "displayName" TEXT        NOT NULL,
  "email"       TEXT        NOT NULL,
  "accountIds"  JSONB       NOT NULL DEFAULT '[]',
  "capacity"    INTEGER     NOT NULL DEFAULT 20,
  "isActive"    BOOLEAN     NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CrmSuccessManager_userId_idx"   ON "CrmSuccessManager"("userId");
CREATE INDEX IF NOT EXISTS "CrmSuccessManager_isActive_idx" ON "CrmSuccessManager"("isActive");

-- CrmRenewalForecast
CREATE TABLE IF NOT EXISTS "CrmRenewalForecast" (
  "id"          TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "accountId"   TEXT        NOT NULL REFERENCES "CrmAccount"("id") ON DELETE CASCADE,
  "renewalDate" TIMESTAMPTZ NOT NULL,
  "value"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "probability" INTEGER     NOT NULL DEFAULT 50,
  "status"      TEXT        NOT NULL DEFAULT 'PENDING',
  "notes"       TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CrmRenewalForecast_accountId_idx"   ON "CrmRenewalForecast"("accountId");
CREATE INDEX IF NOT EXISTS "CrmRenewalForecast_renewalDate_idx" ON "CrmRenewalForecast"("renewalDate");
CREATE INDEX IF NOT EXISTS "CrmRenewalForecast_status_idx"      ON "CrmRenewalForecast"("status");

-- CrmExpansionOpportunity
CREATE TABLE IF NOT EXISTS "CrmExpansionOpportunity" (
  "id"          TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "accountId"   TEXT        NOT NULL REFERENCES "CrmAccount"("id") ON DELETE CASCADE,
  "title"       TEXT        NOT NULL,
  "description" TEXT,
  "value"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status"      TEXT        NOT NULL DEFAULT 'IDENTIFIED',
  "type"        TEXT        NOT NULL DEFAULT 'UPSELL',
  "dueDate"     TIMESTAMPTZ,
  "deletedAt"   TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CrmExpansionOpportunity_accountId_idx" ON "CrmExpansionOpportunity"("accountId");
CREATE INDEX IF NOT EXISTS "CrmExpansionOpportunity_status_idx"    ON "CrmExpansionOpportunity"("status");
CREATE INDEX IF NOT EXISTS "CrmExpansionOpportunity_type_idx"      ON "CrmExpansionOpportunity"("type");
