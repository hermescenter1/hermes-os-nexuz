-- Phase 97 — Legal-hold ownership & lifecycle integrity hardening.
--
-- ADDITIVE ONLY. Adds two nullable columns and two foreign-key constraints. No
-- table/column is dropped and no row is read, rewritten or deleted. The new
-- tables have no production rows, so the foreign keys apply cleanly. LegalHold is
-- RESTRICT (fail-closed: an organization holding legal evidence cannot be hard-
-- deleted); RetentionPolicy is CASCADE (config-like, matching the repository
-- convention for required organization relations).

-- AlterTable: LegalHold — distinct CANCELLED attribution (proposal cancellation,
-- separate from release of an active hold).
ALTER TABLE "LegalHold" ADD COLUMN "cancelledBy" TEXT;
ALTER TABLE "LegalHold" ADD COLUMN "cancelledAt" TIMESTAMP(3);

-- AddForeignKey: organization ownership at the database layer (no orphan / no
-- invalid organizationId).
ALTER TABLE "RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
