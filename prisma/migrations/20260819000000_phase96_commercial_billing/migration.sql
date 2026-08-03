-- Phase 96 — Commercialisation, Billing & Entitlements.
--
-- ADDITIVE ONLY. No DROP TABLE, no DROP COLUMN, no destructive enum recreation.
-- New enum values are appended; new subscription/plan/payment columns are
-- nullable or defaulted so existing rows survive unchanged; three new tables are
-- created for webhook idempotency, entitlement overrides and trial history.

-- AlterEnum: extend the subscription lifecycle vocabulary (append-only). The new
-- values are NOT referenced by any statement in this migration, so they are safe
-- to add within the migration transaction.
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'INCOMPLETE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_FAILED';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'GRACE_PERIOD';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'CANCEL_AT_PERIOD_END';

-- AlterTable: Plan — canonical commercial plan key (owner-backfilled).
ALTER TABLE "Plan" ADD COLUMN "planKey" TEXT;

-- AlterTable: Subscription — deterministic lifecycle metadata.
ALTER TABLE "Subscription" ADD COLUMN "trialStartedAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "currentPeriodStart" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Subscription" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "graceEndsAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "expiredAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'stripe';
ALTER TABLE "Subscription" ADD COLUMN "providerSubscriptionId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "lastProviderEventCreatedAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "lastProviderEventId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "stateVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: Payment — bounded, audited manual refunds.
ALTER TABLE "Payment" ADD COLUMN "refundedAmount" DECIMAL(20,4) NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN "refundedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "refundReason" TEXT;
ALTER TABLE "Payment" ADD COLUMN "refundedById" TEXT;

-- CreateTable: BillingWebhookEvent (idempotency / replay / out-of-order store).
CREATE TABLE "BillingWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "providerCreatedAt" TIMESTAMP(3) NOT NULL,
    "eventType" TEXT NOT NULL,
    "objectReferenceHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStartedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "failureCode" TEXT,

    CONSTRAINT "BillingWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable: OrganizationEntitlementOverride (time-bounded, audited).
CREATE TABLE "OrganizationEntitlementOverride" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entitlementKey" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "limitOverride" INTEGER,
    "reason" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationEntitlementOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable: OrganizationTrial (one automatic trial per organisation).
CREATE TABLE "OrganizationTrial" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planKey" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'AUTOMATIC',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "grantedBy" TEXT,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationTrial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingWebhookEvent_provider_providerEventId_key" ON "BillingWebhookEvent"("provider", "providerEventId");
CREATE INDEX "BillingWebhookEvent_eventType_idx" ON "BillingWebhookEvent"("eventType");
CREATE INDEX "BillingWebhookEvent_status_idx" ON "BillingWebhookEvent"("status");

CREATE INDEX "OrganizationEntitlementOverride_organizationId_entitlementK_idx" ON "OrganizationEntitlementOverride"("organizationId", "entitlementKey");
CREATE INDEX "OrganizationEntitlementOverride_expiresAt_idx" ON "OrganizationEntitlementOverride"("expiresAt");

CREATE UNIQUE INDEX "OrganizationTrial_organizationId_key" ON "OrganizationTrial"("organizationId");
CREATE INDEX "OrganizationTrial_endsAt_idx" ON "OrganizationTrial"("endsAt");

-- AddForeignKey
ALTER TABLE "OrganizationEntitlementOverride" ADD CONSTRAINT "OrganizationEntitlementOverride_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationTrial" ADD CONSTRAINT "OrganizationTrial_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
