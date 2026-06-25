-- Phase 65 — Customer Portal & Account Workspace
-- Migration: 20260803000000_phase65_customer_portal

-- ── Enums ─────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "TicketStatus" AS ENUM (
    'OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "CustomerDocCategory" AS ENUM (
    'CONTRACT', 'PROPOSAL', 'REPORT', 'INVOICE', 'TECHNICAL', 'COMPLIANCE', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── CustomerAccount ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CustomerAccount" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accountNumber"  TEXT NOT NULL,
    "displayName"    TEXT NOT NULL,
    "industry"       TEXT,
    "region"         TEXT,
    "tier"           TEXT NOT NULL DEFAULT 'STANDARD',
    "csManagerId"    TEXT,
    "status"         TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes"          TEXT,
    "healthScore"    DOUBLE PRECISION,
    "contractStart"  TIMESTAMP(3),
    "contractEnd"    TIMESTAMP(3),
    "onboardedAt"    TIMESTAMP(3),
    "deletedAt"      TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerAccount_organizationId_key" ON "CustomerAccount"("organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerAccount_accountNumber_key"  ON "CustomerAccount"("accountNumber");
CREATE INDEX IF NOT EXISTS "CustomerAccount_status_createdAt_idx"      ON "CustomerAccount"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "CustomerAccount_csManagerId_idx"           ON "CustomerAccount"("csManagerId");

-- ── CustomerContact ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CustomerContact" (
    "id"          TEXT NOT NULL,
    "accountId"   TEXT NOT NULL,
    "userId"      TEXT,
    "fullName"    TEXT NOT NULL,
    "email"       TEXT NOT NULL,
    "phone"       TEXT,
    "title"       TEXT,
    "isPrimary"   BOOLEAN NOT NULL DEFAULT false,
    "isBilling"   BOOLEAN NOT NULL DEFAULT false,
    "isTechnical" BOOLEAN NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CustomerContact_accountId_idx" ON "CustomerContact"("accountId");
CREATE INDEX IF NOT EXISTS "CustomerContact_email_idx"     ON "CustomerContact"("email");

-- ── CustomerProject ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CustomerProject" (
    "id"            TEXT NOT NULL,
    "accountId"     TEXT NOT NULL,
    "title"         TEXT NOT NULL,
    "descriptionEn" TEXT,
    "descriptionFa" TEXT,
    "status"        "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority"      TEXT NOT NULL DEFAULT 'MEDIUM',
    "managerName"   TEXT,
    "teamMembers"   TEXT[] NOT NULL DEFAULT '{}',
    "tags"          TEXT[] NOT NULL DEFAULT '{}',
    "startDate"     TIMESTAMP(3),
    "endDate"       TIMESTAMP(3),
    "completedAt"   TIMESTAMP(3),
    "progress"      INTEGER NOT NULL DEFAULT 0,
    "milestones"    JSONB NOT NULL DEFAULT '[]',
    "deletedAt"     TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerProject_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CustomerProject_accountId_status_idx" ON "CustomerProject"("accountId", "status");
CREATE INDEX IF NOT EXISTS "CustomerProject_createdAt_idx"        ON "CustomerProject"("createdAt");

-- ── CustomerSupportTicket ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CustomerSupportTicket" (
    "id"              TEXT NOT NULL,
    "accountId"       TEXT NOT NULL,
    "projectId"       TEXT,
    "createdByUserId" TEXT,
    "assignedToId"    TEXT,
    "title"           TEXT NOT NULL,
    "descriptionEn"   TEXT NOT NULL,
    "priority"        "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "status"          "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "category"        TEXT NOT NULL DEFAULT 'GENERAL',
    "slaDeadline"     TIMESTAMP(3),
    "resolvedAt"      TIMESTAMP(3),
    "closedAt"        TIMESTAMP(3),
    "deletedAt"       TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerSupportTicket_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CustomerSupportTicket_accountId_status_idx"  ON "CustomerSupportTicket"("accountId", "status");
CREATE INDEX IF NOT EXISTS "CustomerSupportTicket_priority_status_idx"   ON "CustomerSupportTicket"("priority", "status");
CREATE INDEX IF NOT EXISTS "CustomerSupportTicket_createdAt_idx"         ON "CustomerSupportTicket"("createdAt");

-- ── CustomerSupportMessage ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CustomerSupportMessage" (
    "id"             TEXT NOT NULL,
    "ticketId"       TEXT NOT NULL,
    "authorId"       TEXT,
    "authorName"     TEXT NOT NULL,
    "authorRole"     TEXT NOT NULL DEFAULT 'customer',
    "body"           TEXT NOT NULL,
    "isInternal"     BOOLEAN NOT NULL DEFAULT false,
    "attachmentUrls" TEXT[] NOT NULL DEFAULT '{}',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerSupportMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CustomerSupportMessage_ticketId_createdAt_idx" ON "CustomerSupportMessage"("ticketId", "createdAt");
CREATE INDEX IF NOT EXISTS "CustomerSupportMessage_isInternal_idx"         ON "CustomerSupportMessage"("isInternal");

-- ── CustomerDocument ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CustomerDocument" (
    "id"            TEXT NOT NULL,
    "accountId"     TEXT NOT NULL,
    "projectId"     TEXT,
    "title"         TEXT NOT NULL,
    "category"      "CustomerDocCategory" NOT NULL DEFAULT 'OTHER',
    "fileUrl"       TEXT,
    "fileSizeBytes" INTEGER,
    "mimeType"      TEXT,
    "version"       TEXT NOT NULL DEFAULT '1.0',
    "isPublic"      BOOLEAN NOT NULL DEFAULT false,
    "uploadedBy"    TEXT,
    "expiresAt"     TIMESTAMP(3),
    "deletedAt"     TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CustomerDocument_accountId_category_idx" ON "CustomerDocument"("accountId", "category");
CREATE INDEX IF NOT EXISTS "CustomerDocument_createdAt_idx"          ON "CustomerDocument"("createdAt");

-- ── CustomerActivityLog ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CustomerActivityLog" (
    "id"          TEXT NOT NULL,
    "accountId"   TEXT NOT NULL,
    "userId"      TEXT,
    "eventType"   TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata"    JSONB NOT NULL DEFAULT '{}',
    "ipAddress"   TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerActivityLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CustomerActivityLog_accountId_createdAt_idx" ON "CustomerActivityLog"("accountId", "createdAt");
CREATE INDEX IF NOT EXISTS "CustomerActivityLog_eventType_idx"           ON "CustomerActivityLog"("eventType");

-- ── CustomerSubscriptionView ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CustomerSubscriptionView" (
    "id"                 TEXT NOT NULL,
    "accountId"          TEXT NOT NULL,
    "planName"           TEXT NOT NULL DEFAULT 'STARTER',
    "planTier"           TEXT NOT NULL DEFAULT 'STANDARD',
    "billingCycle"       TEXT NOT NULL DEFAULT 'MONTHLY',
    "status"             TEXT NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd"   TIMESTAMP(3),
    "usersCount"         INTEGER NOT NULL DEFAULT 0,
    "usersLimit"         INTEGER NOT NULL DEFAULT 10,
    "storageUsedGb"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storageLimitGb"     DOUBLE PRECISION NOT NULL DEFAULT 10,
    "apiCallsMonth"      INTEGER NOT NULL DEFAULT 0,
    "apiCallsLimit"      INTEGER NOT NULL DEFAULT 10000,
    "features"           TEXT[] NOT NULL DEFAULT '{}',
    "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerSubscriptionView_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerSubscriptionView_accountId_key" ON "CustomerSubscriptionView"("accountId");
CREATE INDEX IF NOT EXISTS "CustomerSubscriptionView_accountId_idx"        ON "CustomerSubscriptionView"("accountId");

-- ── CustomerPortalPreference ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CustomerPortalPreference" (
    "id"                 TEXT NOT NULL,
    "accountId"          TEXT NOT NULL,
    "userId"             TEXT,
    "language"           TEXT NOT NULL DEFAULT 'en',
    "timezone"           TEXT NOT NULL DEFAULT 'Asia/Tehran',
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "ticketUpdates"      BOOLEAN NOT NULL DEFAULT true,
    "projectUpdates"     BOOLEAN NOT NULL DEFAULT true,
    "documentAlerts"     BOOLEAN NOT NULL DEFAULT true,
    "marketingEmails"    BOOLEAN NOT NULL DEFAULT false,
    "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerPortalPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerPortalPreference_accountId_key" ON "CustomerPortalPreference"("accountId");
CREATE INDEX IF NOT EXISTS "CustomerPortalPreference_accountId_idx"        ON "CustomerPortalPreference"("accountId");

-- ── Foreign key constraints ───────────────────────────────────────────────────

ALTER TABLE "CustomerContact"
    ADD CONSTRAINT "CustomerContact_accountId_fkey"
        FOREIGN KEY ("accountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerProject"
    ADD CONSTRAINT "CustomerProject_accountId_fkey"
        FOREIGN KEY ("accountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerSupportTicket"
    ADD CONSTRAINT "CustomerSupportTicket_accountId_fkey"
        FOREIGN KEY ("accountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerSupportTicket"
    ADD CONSTRAINT "CustomerSupportTicket_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "CustomerProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerSupportMessage"
    ADD CONSTRAINT "CustomerSupportMessage_ticketId_fkey"
        FOREIGN KEY ("ticketId") REFERENCES "CustomerSupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerDocument"
    ADD CONSTRAINT "CustomerDocument_accountId_fkey"
        FOREIGN KEY ("accountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerDocument"
    ADD CONSTRAINT "CustomerDocument_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "CustomerProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerActivityLog"
    ADD CONSTRAINT "CustomerActivityLog_accountId_fkey"
        FOREIGN KEY ("accountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerSubscriptionView"
    ADD CONSTRAINT "CustomerSubscriptionView_accountId_fkey"
        FOREIGN KEY ("accountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerPortalPreference"
    ADD CONSTRAINT "CustomerPortalPreference_accountId_fkey"
        FOREIGN KEY ("accountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
