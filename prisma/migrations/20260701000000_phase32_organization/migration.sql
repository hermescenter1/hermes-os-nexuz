-- Phase 32: Organization Management Foundation
-- Extends Organization + OrganizationMember, adds new enums + models.
-- IMPORTANT: ALTER TYPE ... ADD VALUE cannot run inside a transaction in
-- PostgreSQL < 12. This migration targets PostgreSQL 12+ where it is allowed.

-- ── Extend OrgRole enum ───────────────────────────────────────────────────────
ALTER TYPE "OrgRole" ADD VALUE IF NOT EXISTS 'MANAGER';
ALTER TYPE "OrgRole" ADD VALUE IF NOT EXISTS 'ENGINEER';
ALTER TYPE "OrgRole" ADD VALUE IF NOT EXISTS 'VIEWER';
ALTER TYPE "OrgRole" ADD VALUE IF NOT EXISTS 'BILLING_ADMIN';

-- ── New enums ─────────────────────────────────────────────────────────────────
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- ── Extend Organization ───────────────────────────────────────────────────────
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "website"     TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "logoUrl"     TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "settings"    JSONB NOT NULL DEFAULT '{}';

-- ── Extend OrganizationMember ─────────────────────────────────────────────────
ALTER TABLE "OrganizationMember"
  ADD COLUMN IF NOT EXISTS "status"       "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "departmentId" TEXT,
  ADD COLUMN IF NOT EXISTS "invitedById"  TEXT,
  ADD COLUMN IF NOT EXISTS "joinedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Migrate existing MEMBER rows to ENGINEER, then update the column default
UPDATE "OrganizationMember" SET "role" = 'ENGINEER' WHERE "role" = 'MEMBER';
ALTER TABLE "OrganizationMember" ALTER COLUMN "role" SET DEFAULT 'ENGINEER';

-- Additional indexes for new columns
CREATE INDEX IF NOT EXISTS "OrganizationMember_organizationId_idx" ON "OrganizationMember"("organizationId");
CREATE INDEX IF NOT EXISTS "OrganizationMember_departmentId_idx"   ON "OrganizationMember"("departmentId");

-- ── Department ────────────────────────────────────────────────────────────────
CREATE TABLE "Department" (
    "id"             TEXT         NOT NULL,
    "organizationId" TEXT         NOT NULL,
    "name"           TEXT         NOT NULL,
    "description"    TEXT,
    "type"           TEXT         NOT NULL,
    "managerId"      TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Department_organizationId_name_key" ON "Department"("organizationId", "name");
CREATE INDEX "Department_organizationId_idx" ON "Department"("organizationId");

-- ── OrganizationInvitation ────────────────────────────────────────────────────
CREATE TABLE "OrganizationInvitation" (
    "id"             TEXT               NOT NULL,
    "organizationId" TEXT               NOT NULL,
    "email"          TEXT               NOT NULL,
    "role"           "OrgRole"          NOT NULL DEFAULT 'ENGINEER',
    "token"          TEXT               NOT NULL,
    "status"         "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedById"    TEXT,
    "expiresAt"      TIMESTAMP(3)       NOT NULL,
    "createdAt"      TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)       NOT NULL,
    CONSTRAINT "OrganizationInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrganizationInvitation_token_key" ON "OrganizationInvitation"("token");
CREATE INDEX "OrganizationInvitation_organizationId_idx" ON "OrganizationInvitation"("organizationId");
CREATE INDEX "OrganizationInvitation_email_idx"          ON "OrganizationInvitation"("email");

-- ── Foreign keys ─────────────────────────────────────────────────────────────
ALTER TABLE "Department" ADD CONSTRAINT "Department_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Department" ADD CONSTRAINT "Department_managerId_fkey"
    FOREIGN KEY ("managerId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
