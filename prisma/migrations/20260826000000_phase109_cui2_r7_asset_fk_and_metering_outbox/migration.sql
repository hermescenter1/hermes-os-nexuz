-- PHASE 109-C-UI.2-R7 — referential integrity for analysis output, and a
-- durable metering outbox.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1 — THE DEFECT (FINDING-R6-001)
-- ─────────────────────────────────────────────────────────────────────────────
-- The five tables the intelligence automation engine writes all carry an
-- `assetId`, and not one of them constrains it:
--
--   AssetAlert · AssetRiskScore · AssetIntelligenceSnapshot ·
--   AssetHealthHistory · MaintenanceRecommendation
--
-- Twelve other tables in this database DO constrain their `assetId`
-- (AssetTag, AutomationTag, TelemetryRecord, DigitalTwinNode, OtDeviceProfile,
-- IndustrialNetworkNode, AlarmDefinition and five RegistryAsset links). The
-- engine's own output is the exception, so a risk score naming a deleted asset,
-- or an asset in another tenant, is a state the database will accept. The
-- application is careful; "the application is careful" is a habit, not an
-- invariant.
--
-- WHAT IS ADDED, AND WHY COMPOSITE
-- A single-column FK would fix the dangling reference and leave the tenant hole
-- open: an org-A alert could still point at an org-B asset. So the constraint
-- carries the tenant, exactly as Phase 102 did for the Media Hub:
--
--   FOREIGN KEY ("organizationId", "assetId")
--     REFERENCES "IndustrialAsset" ("organizationId", "id")
--
-- A cross-tenant analysis row is now unwritable, not merely unwritten.
--
-- ON DELETE RESTRICT, NOT CASCADE, NOT SET NULL
--   * CASCADE is forbidden by the owner and would be wrong regardless: these
--     rows are the historical record of what the plant was doing. Deleting an
--     asset must not silently erase its alarm and risk history.
--   * SET NULL is impossible here and would be wrong if it were possible.
--     `assetId` is already NOT NULL in all five tables (verified in the live
--     catalogue, not assumed), and a composite SET NULL would try to null
--     `organizationId` too. An analysis record that no longer names its asset
--     is not history, it is noise.
--   * RESTRICT states the real rule: an asset with analysis history cannot be
--     deleted until that history is dealt with deliberately.
--
-- `assetId` is NOT NULL already, so no column is altered. This migration adds
-- constraints and one table. It changes no existing row.
--
-- PREFLIGHT: FAIL CLOSED, AND SAY WHY
-- Adding a validating constraint already fails on a violating row, but the
-- error names one key and stops. The DO block below runs FIRST, counts every
-- orphan and every cross-tenant row across all five relations, and raises ONE
-- exception listing each table with its two counts. Prisma runs a migration in
-- a transaction, so the raise rolls the whole thing back: no constraint added,
-- no row touched, and the operator gets an auditable inventory instead of a
-- mystery. Nothing is repaired automatically — deciding which side of a bad
-- link is the mistake is a data-ownership question, not a migration's call.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2 — DURABLE METERING (FINDING-R6-002)
-- ─────────────────────────────────────────────────────────────────────────────
-- `IndustrialMeteringOutbox` is written inside the run's own transaction, so it
-- commits exactly when the run commits and never when it does not. A separate
-- worker delivers it to `UsageRecord` with bounded retries, backoff and a
-- dead-letter state. The unique key makes the SOURCE exactly-once; the status
-- transition makes DELIVERY exactly-once.
--
-- ROLLBACK
--   DROP TABLE "IndustrialMeteringOutbox";
--   DROP TYPE "IndustrialMeteringOutboxStatus";
--   ALTER TABLE "AssetAlert"                DROP CONSTRAINT "AssetAlert_org_assetId_fkey";
--   ALTER TABLE "AssetRiskScore"            DROP CONSTRAINT "AssetRiskScore_org_assetId_fkey";
--   ALTER TABLE "AssetIntelligenceSnapshot" DROP CONSTRAINT "AssetIntelligenceSnapshot_org_assetId_fkey";
--   ALTER TABLE "AssetHealthHistory"        DROP CONSTRAINT "AssetHealthHistory_org_assetId_fkey";
--   ALTER TABLE "MaintenanceRecommendation" DROP CONSTRAINT "MaintenanceRecommendation_org_assetId_fkey";
--   ALTER TABLE "IndustrialAsset"           DROP CONSTRAINT "IndustrialAsset_organizationId_id_key";
-- Every statement below is guarded, so re-running the migration is a no-op.

-- ── 1. Preflight inventory ───────────────────────────────────────────────────
DO $r7_preflight$
DECLARE
  rec        record;
  orphans    bigint;
  crossers   bigint;
  problems   text := '';
  total      bigint := 0;
BEGIN
  FOR rec IN
    SELECT unnest(ARRAY[
      'AssetAlert', 'AssetRiskScore', 'AssetIntelligenceSnapshot',
      'AssetHealthHistory', 'MaintenanceRecommendation'
    ]) AS t
  LOOP
    -- An assetId naming no asset at all.
    EXECUTE format(
      'SELECT count(*) FROM %I c WHERE NOT EXISTS '
      '(SELECT 1 FROM "IndustrialAsset" a WHERE a.id = c."assetId")', rec.t)
      INTO orphans;
    -- An assetId naming an asset that belongs to a DIFFERENT organisation.
    EXECUTE format(
      'SELECT count(*) FROM %I c JOIN "IndustrialAsset" a ON a.id = c."assetId" '
      'WHERE a."organizationId" <> c."organizationId"', rec.t)
      INTO crossers;

    IF orphans > 0 OR crossers > 0 THEN
      problems := problems || format('%s: orphan=%s cross_tenant=%s; ', rec.t, orphans, crossers);
      total := total + orphans + crossers;
    END IF;
  END LOOP;

  IF total > 0 THEN
    RAISE EXCEPTION
      'PHASE109_R7_PREFLIGHT_FAILED: % rows violate the asset relation. %'
      '-- Reconcile these rows, then re-run. This migration repairs nothing on '
      'its own: which side of a bad link is the mistake is an ownership decision.',
      total, problems;
  END IF;

  RAISE NOTICE 'PHASE109_R7_PREFLIGHT_CLEAN: 0 orphan and 0 cross-tenant rows across 5 tables';
END
$r7_preflight$;

-- ── 2. The referencable key on the parent ────────────────────────────────────
-- Redundant as a uniqueness claim, since `id` is already the primary key. It is
-- what a composite foreign key needs in order to reference the pair.
DO $r7_parent_key$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'IndustrialAsset_organizationId_id_key'
  ) THEN
    ALTER TABLE "IndustrialAsset"
      ADD CONSTRAINT "IndustrialAsset_organizationId_id_key"
      UNIQUE ("organizationId", "id");
  END IF;
END
$r7_parent_key$;

-- ── 3. The five composite foreign keys ───────────────────────────────────────
DO $r7_child_fks$
DECLARE
  rec  record;
  name text;
BEGIN
  FOR rec IN
    SELECT unnest(ARRAY[
      'AssetAlert', 'AssetRiskScore', 'AssetIntelligenceSnapshot',
      'AssetHealthHistory', 'MaintenanceRecommendation'
    ]) AS t
  LOOP
    name := rec.t || '_org_assetId_fkey';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = name) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I '
        'FOREIGN KEY ("organizationId", "assetId") '
        'REFERENCES "IndustrialAsset" ("organizationId", "id") '
        'ON UPDATE CASCADE ON DELETE RESTRICT', rec.t, name);
    END IF;
  END LOOP;
END
$r7_child_fks$;

-- ── 4. The metering outbox ───────────────────────────────────────────────────
DO $r7_outbox_enum$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IndustrialMeteringOutboxStatus') THEN
    CREATE TYPE "IndustrialMeteringOutboxStatus" AS ENUM
      ('PENDING', 'RETRYING', 'DELIVERED', 'FAILED', 'DEAD_LETTER');
  END IF;
END
$r7_outbox_enum$;

CREATE TABLE IF NOT EXISTS "IndustrialMeteringOutbox" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId"         TEXT,
    "scopeMode"      "IndustrialAutomationScopeMode" NOT NULL,
    "actorId"        TEXT,
    "actorRole"      VARCHAR(64) NOT NULL,
    "authMethod"     VARCHAR(16) NOT NULL,
    "operation"      VARCHAR(64) NOT NULL,
    "metric"         VARCHAR(64) NOT NULL,
    "value"          DECIMAL(20,4) NOT NULL,
    "runId"          VARCHAR(64) NOT NULL,
    "requestId"      VARCHAR(64) NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "status"         "IndustrialMeteringOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts"       INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode"  VARCHAR(64),
    "nextAttemptAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt"      TIMESTAMP(3),
    "deliveredAt"    TIMESTAMP(3),
    "usageRecordId"  TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndustrialMeteringOutbox_pkey" PRIMARY KEY ("id")
);

-- Exactly-once at the source: one run, one metering event per metric, however
-- many times the request is replayed or retried.
CREATE UNIQUE INDEX IF NOT EXISTS "IndustrialMeteringOutbox_org_key_metric_key"
    ON "IndustrialMeteringOutbox"("organizationId", "idempotencyKey", "metric");

-- The worker's claim query.
CREATE INDEX IF NOT EXISTS "IndustrialMeteringOutbox_status_nextAttemptAt_idx"
    ON "IndustrialMeteringOutbox"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "IndustrialMeteringOutbox_org_status_createdAt_idx"
    ON "IndustrialMeteringOutbox"("organizationId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "IndustrialMeteringOutbox_org_runId_idx"
    ON "IndustrialMeteringOutbox"("organizationId", "runId");

DO $r7_outbox_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'IndustrialMeteringOutbox_organizationId_fkey'
  ) THEN
    ALTER TABLE "IndustrialMeteringOutbox"
      ADD CONSTRAINT "IndustrialMeteringOutbox_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END
$r7_outbox_fk$;
