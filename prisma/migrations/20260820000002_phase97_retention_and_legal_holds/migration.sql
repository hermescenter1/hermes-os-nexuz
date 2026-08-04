-- Phase 97 — Compliance, Privacy & Legal Readiness (Part E+F: Retention & Legal holds).
--
-- ADDITIVE ONLY — two brand-new organization-owned tables. No existing table,
-- column or enum is touched. Retention is dry-run and disabled by default
-- (dryRunOnly=true, enabled=false); durations/approvals default to fail-closed
-- sentinels so nothing is deleted or anonymised without explicit owner action. A
-- legal hold overrides retention deletion (enforced in application logic + tests).

-- CreateTable: RetentionPolicy — org-owned retention governance (planning only).
CREATE TABLE "RetentionPolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dataClass" TEXT NOT NULL,
    "targetResource" TEXT NOT NULL,
    "retentionTrigger" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "retentionDays" INTEGER,
    "action" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "reviewOwner" TEXT,
    "approvalState" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "legalHoldAware" BOOLEAN NOT NULL DEFAULT true,
    "dryRunOnly" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable: LegalHold — org-owned hold that protects data from retention.
CREATE TABLE "LegalHold" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reasonClass" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "scopeType" TEXT NOT NULL,
    "subjectId" TEXT,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "processingActivityId" TEXT,
    "incidentId" TEXT,
    "rangeStart" TIMESTAMP(3),
    "rangeEnd" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "reviewDate" TIMESTAMP(3),
    "releaseApprovedBy" TEXT,
    "releasedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetentionPolicy_organizationId_enabled_idx" ON "RetentionPolicy"("organizationId", "enabled");
CREATE INDEX "RetentionPolicy_organizationId_approvalState_idx" ON "RetentionPolicy"("organizationId", "approvalState");
CREATE INDEX "RetentionPolicy_organizationId_updatedAt_idx" ON "RetentionPolicy"("organizationId", "updatedAt");

CREATE INDEX "LegalHold_organizationId_status_idx" ON "LegalHold"("organizationId", "status");
CREATE INDEX "LegalHold_organizationId_scopeType_idx" ON "LegalHold"("organizationId", "scopeType");
CREATE INDEX "LegalHold_organizationId_subjectId_idx" ON "LegalHold"("organizationId", "subjectId");
