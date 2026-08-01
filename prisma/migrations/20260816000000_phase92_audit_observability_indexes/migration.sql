-- PHASE 92 — Observability & SRE foundation.
--
-- Additive, non-destructive indexes on AuditLog for the two new observability
-- query paths introduced this phase:
--   * createdAt     — bounded audit-retention sweeps (DELETE ... WHERE createdAt < cutoff
--                     LIMIT batch) and time-window operator queries;
--   * correlationId — incident timeline reconstruction (SELECT ... WHERE correlationId = $1).
--
-- No columns, tables, data or existing indexes are changed. Legacy rows keep
-- their existing (possibly NULL) correlationId; a NULL is simply not indexed by
-- these lookups. Safe to run on a populated table.
--
-- PRODUCTION NOTE (see docs/phase92-observability-runbook.md): on a large,
-- write-hot AuditLog, `prisma migrate deploy` builds these with a plain
-- CREATE INDEX, which takes a brief ACCESS EXCLUSIVE lock. Operators who cannot
-- accept that lock should instead create them out-of-band with
-- `CREATE INDEX CONCURRENTLY` during a low-traffic window and then
-- `prisma migrate resolve --applied 20260816000000_phase92_audit_observability_indexes`.

CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_correlationId_idx" ON "AuditLog"("correlationId");
