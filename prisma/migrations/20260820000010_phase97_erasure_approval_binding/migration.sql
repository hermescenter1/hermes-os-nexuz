-- Phase 97 — Erasure approval-binding & retention-decision hardening.
--
-- ADDITIVE / STRENGTHENING ONLY. No table, column or ROW is dropped or rewritten;
-- migrations 20260820000000 through 20260820000009 are left untouched. This closes
-- three database-evidence gaps:
--   1. approval now binds to a DEDICATED snapshot pair (approvedPlanHash /
--      approvedPlanVersion) set inside the approval transaction, and APPROVED and
--      later states must carry a valid SHA-256 approvedPlanHash equal to planHash
--      and approvedPlanVersion equal to planVersion (so a regenerated plan can never
--      keep an old approval);
--   2. every plan-bearing state must carry attribution (plannedBy) and a positive
--      planVersion;
--   3. retention-policy selection is made governed: at most ONE live (enabled +
--      APPROVED) RetentionPolicy may exist per (organizationId, dataClass,
--      targetResource), so the planner can never face an ambiguous live policy.
--      Existing conflicting policies are NOT deleted or merged — the preflight
--      aborts with classification counts only and an operator must resolve them
--      deliberately.
--
-- reviewResolutions stores governed manual-review decisions (closed codes,
-- server-attributed) applied by the planner on regeneration.

-- New additive columns.
ALTER TABLE "DataDeletionRequest" ADD COLUMN "approvedPlanHash" TEXT;
ALTER TABLE "DataDeletionRequest" ADD COLUMN "approvedPlanVersion" INTEGER;
ALTER TABLE "DataDeletionRequest" ADD COLUMN "reviewResolutions" JSONB;

-- ── Preflight (fail-closed; classification counts only, no personal data) ─────
DO $$
DECLARE
  n_plan_attribution_missing bigint;
  n_approved_unbound         bigint;
  n_retention_conflicts      bigint;
BEGIN
  SELECT count(*) INTO n_plan_attribution_missing FROM "DataDeletionRequest"
    WHERE "lifecycle" IN ('PLAN_READY','IN_REVIEW','APPROVED','EXECUTION_PENDING','EXECUTING','COMPLETED')
      AND ("plannedBy" IS NULL OR "planVersion" IS NULL OR "planVersion" <= 0);

  -- approvedPlanHash was just added, so ANY pre-existing APPROVED-or-later row is
  -- unbound and must be resolved by an operator before this migration can apply
  -- (no approval binding is invented by a repair).
  SELECT count(*) INTO n_approved_unbound FROM "DataDeletionRequest"
    WHERE "lifecycle" IN ('APPROVED','EXECUTION_PENDING','EXECUTING','COMPLETED')
      AND ("approvedPlanHash" IS NULL OR "approvedPlanHash" !~ '^[a-f0-9]{64}$'
        OR "approvedPlanVersion" IS NULL OR "approvedPlanVersion" <= 0
        OR "approvedPlanHash" IS DISTINCT FROM "planHash"
        OR "approvedPlanVersion" IS DISTINCT FROM "planVersion");

  SELECT count(*) INTO n_retention_conflicts FROM (
    SELECT "organizationId", "dataClass", "targetResource"
    FROM "RetentionPolicy"
    WHERE "enabled" = true AND "approvalState" = 'APPROVED'
    GROUP BY "organizationId", "dataClass", "targetResource"
    HAVING count(*) > 1
  ) conflicts;

  IF n_plan_attribution_missing > 0 OR n_approved_unbound > 0 OR n_retention_conflicts > 0 THEN
    RAISE EXCEPTION 'Phase97 erasure approval-binding preflight failed (no data-repair policy is invented; resolve before applying): plan_attribution_missing=% approved_unbound=% retention_live_conflicts=%',
      n_plan_attribution_missing, n_approved_unbound, n_retention_conflicts;
  END IF;
END $$;

-- Plan-bearing lifecycle additionally requires attribution + a positive version.
ALTER TABLE "DataDeletionRequest" ADD CONSTRAINT "DataDeletionRequest_plan_attribution_check"
  CHECK ("lifecycle" NOT IN ('PLAN_READY','IN_REVIEW','APPROVED','EXECUTION_PENDING','EXECUTING','COMPLETED')
    OR ("plannedBy" IS NOT NULL AND "planVersion" > 0));

-- APPROVED and later require the approval binding to be present, well-formed and
-- EQUAL to the current snapshot (a regenerated plan therefore cannot retain an old
-- approval at the database layer).
ALTER TABLE "DataDeletionRequest" ADD CONSTRAINT "DataDeletionRequest_approved_plan_binding_check"
  CHECK ("lifecycle" NOT IN ('APPROVED','EXECUTION_PENDING','EXECUTING','COMPLETED')
    OR ("approvedPlanHash" IS NOT NULL AND "approvedPlanHash" ~ '^[a-f0-9]{64}$'
      AND "approvedPlanVersion" IS NOT NULL AND "approvedPlanVersion" > 0
      AND "approvedPlanHash" = "planHash"
      AND "approvedPlanVersion" = "planVersion"));

-- Governed retention-policy selection: at most one LIVE (enabled + APPROVED) policy
-- per (organization, dataClass, targetResource). Draft/pending/rejected/disabled
-- policies remain unrestricted.
CREATE UNIQUE INDEX "RetentionPolicy_live_selection_key"
  ON "RetentionPolicy" ("organizationId", "dataClass", "targetResource")
  WHERE ("enabled" = true AND "approvalState" = 'APPROVED');
