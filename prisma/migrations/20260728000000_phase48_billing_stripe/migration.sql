-- Phase 48: SaaS Billing Stripe Integration + Notification System
--
-- ADDITIVE ONLY. All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- so this migration is safe to replay on databases that already have partial state.
--
-- Adds:
--   Organization.stripeCustomerId    — Stripe customer reference
--   Subscription.stripeSubscriptionId — Stripe subscription reference
--   UsageRecord.userId               — optional per-user usage tracking
--   Notification table               — in-app notification store

-- ── Organization: Stripe customer ID ─────────────────────────────────────────

ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Organization_stripeCustomerId_key"
  ON "Organization"("stripeCustomerId");

-- ── Subscription: Stripe subscription ID ──────────────────────────────────────

ALTER TABLE "Subscription"
  ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_stripeSubscriptionId_key"
  ON "Subscription"("stripeSubscriptionId");

-- ── UsageRecord: optional per-user tracking ───────────────────────────────────

ALTER TABLE "UsageRecord"
  ADD COLUMN IF NOT EXISTS "userId" TEXT;

CREATE INDEX IF NOT EXISTS "UsageRecord_userId_idx"
  ON "UsageRecord"("userId");

-- ── Notification table ────────────────────────────────────────────────────────
--
-- Centralized in-app notification store. Notifications are always created even
-- if email delivery fails — the notification system is PRIMARY, email is
-- SECONDARY. All insertions are best-effort (never block business logic).
--
-- type: info | success | warning | error | security
-- isRead: false on creation; flipped by explicit user action

CREATE TABLE IF NOT EXISTS "Notification" (
  "id"        TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "type"      TEXT         NOT NULL DEFAULT 'info',
  "title"     TEXT         NOT NULL,
  "message"   TEXT         NOT NULL,
  "metadata"  JSONB        NOT NULL DEFAULT '{}',
  "isRead"    BOOLEAN      NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx"
  ON "Notification"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx"
  ON "Notification"("userId", "isRead");
