-- Phase 31: SaaS Billing Engine Foundation
-- Adds Organization, OrganizationMember, Plan, Subscription, Invoice, Payment, UsageRecord

-- Enums
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'VOID', 'OVERDUE');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');
CREATE TYPE "Currency" AS ENUM ('IRR', 'GBP', 'USD', 'EUR');

-- Organization
CREATE TABLE "Organization" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "slug"      TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- OrganizationMember
CREATE TABLE "OrganizationMember" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "role"           "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- Plan
CREATE TABLE "Plan" (
    "id"           TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "slug"         TEXT NOT NULL,
    "description"  TEXT NOT NULL,
    "monthlyPrice" DECIMAL(20,4) NOT NULL,
    "yearlyPrice"  DECIMAL(20,4) NOT NULL,
    "currency"     "Currency" NOT NULL DEFAULT 'USD',
    "features"     JSONB NOT NULL DEFAULT '[]',
    "limits"       JSONB NOT NULL DEFAULT '{}',
    "isActive"     BOOLEAN NOT NULL DEFAULT true,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Plan_slug_key" ON "Plan"("slug");

-- Subscription
CREATE TABLE "Subscription" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId"         TEXT NOT NULL,
    "status"         "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "billingCycle"   "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "startsAt"       TIMESTAMP(3) NOT NULL,
    "expiresAt"      TIMESTAMP(3) NOT NULL,
    "autoRenew"      BOOLEAN NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Subscription_organizationId_idx" ON "Subscription"("organizationId");
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- Invoice
CREATE TABLE "Invoice" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "invoiceNumber"  TEXT NOT NULL,
    "currency"       "Currency" NOT NULL,
    "subtotal"       DECIMAL(20,4) NOT NULL,
    "tax"            DECIMAL(20,4) NOT NULL DEFAULT 0,
    "total"          DECIMAL(20,4) NOT NULL,
    "status"         "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedAt"       TIMESTAMP(3) NOT NULL,
    "paidAt"         TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE INDEX "Invoice_organizationId_idx" ON "Invoice"("organizationId");
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- Payment
CREATE TABLE "Payment" (
    "id"                TEXT NOT NULL,
    "invoiceId"         TEXT NOT NULL,
    "provider"          TEXT NOT NULL,
    "providerReference" TEXT,
    "amount"            DECIMAL(20,4) NOT NULL,
    "currency"          "Currency" NOT NULL,
    "status"            "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Payment_providerReference_key" ON "Payment"("providerReference");
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- UsageRecord
CREATE TABLE "UsageRecord" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "metric"         TEXT NOT NULL,
    "value"          DECIMAL(20,4) NOT NULL,
    "recordedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UsageRecord_organizationId_idx" ON "UsageRecord"("organizationId");
CREATE INDEX "UsageRecord_metric_idx" ON "UsageRecord"("metric");

-- Foreign keys: OrganizationMember
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign keys: Subscription
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign keys: Invoice
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign keys: Payment
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign keys: UsageRecord
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
