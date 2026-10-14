-- Executive Management Center — the frozen priority list in the nightly report.
--
-- One NULLABLE column. No backfill, no row rewritten, no default evaluated:
-- adding a nullable column without a default does not rewrite the table in
-- PostgreSQL, so this is a catalogue change and nothing more.
--
-- NULL is meaningful and permanent for older rows: every report written before
-- CALC_VERSION `exec-report-3` has no priority list, and a reader must not
-- read that absence as "nothing was due that night".
--
-- Rollback is DROP COLUMN; it loses only data this release introduced.

ALTER TABLE "ExecutiveDailyReport"
    ADD COLUMN "prioritySnapshot" JSONB;
