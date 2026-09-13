-- PHASE 109-C-UI.2-R3 — site-scoped industrial automation execution.
--
-- STRICTLY ADDITIVE. Two new types and one new table. This migration:
--   * creates nothing that any existing row depends on;
--   * alters no existing table, column, index, constraint or default;
--   * rewrites no data and reads no data;
--   * is safe to apply while the application is serving traffic.
--
-- It exists because F-04 and F-05 cannot be closed without durable state:
-- idempotency has to survive a retry that lands on a different replica, and a
-- concurrency guard has to survive a crash. The knowledge-graph rebuild guards
-- itself with an in-process Set, which is per-replica; this deliberately does
-- not copy that.
--
-- Rollback (reverse order, non-destructive to all pre-existing data):
--   DROP INDEX "IndustrialAutomationRun_active_scope_key";
--   DROP TABLE "IndustrialAutomationRun";
--   DROP TYPE "IndustrialAutomationRunStatus";
--   DROP TYPE "IndustrialAutomationScopeMode";

-- ── vocabularies ────────────────────────────────────────────────────────────
CREATE TYPE "IndustrialAutomationScopeMode" AS ENUM ('SITE', 'ORGANISATION');
CREATE TYPE "IndustrialAutomationRunStatus" AS ENUM ('ACCEPTED', 'RUNNING', 'COMPLETED', 'FAILED', 'EXPIRED');

-- ── the execution record ────────────────────────────────────────────────────
CREATE TABLE "IndustrialAutomationRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT,
    "siteScopeKey" VARCHAR(191) NOT NULL,
    "scopeMode" "IndustrialAutomationScopeMode" NOT NULL DEFAULT 'SITE',
    "status" "IndustrialAutomationRunStatus" NOT NULL DEFAULT 'ACCEPTED',
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "requestId" VARCHAR(64) NOT NULL,
    "actorId" TEXT,
    "actorRole" VARCHAR(32) NOT NULL,
    "authMethod" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(500),
    "sitesIncluded" JSONB NOT NULL DEFAULT '[]',
    "sitesExcluded" JSONB NOT NULL DEFAULT '[]',
    "assetsDiscovered" INTEGER NOT NULL DEFAULT 0,
    "assetsAttempted" INTEGER NOT NULL DEFAULT 0,
    "assetsProcessed" INTEGER NOT NULL DEFAULT 0,
    "assetsFailed" INTEGER NOT NULL DEFAULT 0,
    "snapshotsCreated" INTEGER NOT NULL DEFAULT 0,
    "riskScoresCreated" INTEGER NOT NULL DEFAULT 0,
    "alertsCreated" INTEGER NOT NULL DEFAULT 0,
    "recommendationsCreated" INTEGER NOT NULL DEFAULT 0,
    "failureCode" VARCHAR(64),
    "failures" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndustrialAutomationRun_pkey" PRIMARY KEY ("id")
);

-- ── idempotency, scoped to the tenant ───────────────────────────────────────
-- Tenant-scoped on purpose: one organisation's key can neither collide with nor
-- reveal another's. This constraint IS the replay guard — the second insert of
-- the same key loses, reads the winner's row, and returns the winner's result.
CREATE UNIQUE INDEX "IndustrialAutomationRun_organizationId_idempotencyKey_key"
    ON "IndustrialAutomationRun"("organizationId", "idempotencyKey");

-- ── the distributed concurrency guard ───────────────────────────────────────
-- One live run per scope, enforced by the database rather than by a process.
--
-- PARTIAL, over the live statuses only: a completed run must not block the next
-- one. Prisma cannot express a partial unique index, which is why it is written
-- here and why "siteScopeKey" exists at all — a UNIQUE over a NULLable "siteId"
-- would let two ORGANISATION-mode runs both pass, because PostgreSQL treats
-- NULLs as distinct. "siteScopeKey" holds the site id in SITE mode and '*' in
-- ORGANISATION mode, so both modes are guarded by this one index.
CREATE UNIQUE INDEX "IndustrialAutomationRun_active_scope_key"
    ON "IndustrialAutomationRun"("organizationId", "siteScopeKey")
    WHERE "status" IN ('ACCEPTED', 'RUNNING');

CREATE INDEX "IndustrialAutomationRun_organizationId_status_startedAt_idx"
    ON "IndustrialAutomationRun"("organizationId", "status", "startedAt");
CREATE INDEX "IndustrialAutomationRun_organizationId_siteId_status_idx"
    ON "IndustrialAutomationRun"("organizationId", "siteId", "status");
CREATE INDEX "IndustrialAutomationRun_organizationId_requestId_idx"
    ON "IndustrialAutomationRun"("organizationId", "requestId");

-- ── ownership ───────────────────────────────────────────────────────────────
-- CASCADE from the organisation: execution history is tenant data and dies with
-- the tenant. SET NULL from the site: losing a site must not erase the record
-- that a run happened, and "scopeMode" still says what the run covered.
ALTER TABLE "IndustrialAutomationRun"
    ADD CONSTRAINT "IndustrialAutomationRun_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IndustrialAutomationRun"
    ADD CONSTRAINT "IndustrialAutomationRun_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "IndustrialSite"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
