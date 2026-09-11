-- PHASE 109-C-UI.2-R8 — the worker lease.
--
-- R7 built a metering outbox and proved delivery exactly-once, but nothing ran
-- the delivery. R8 connects it to a worker, and a worker that may run on several
-- replicas needs coordination.
--
-- WHY A LEASE ROW AND NOT AN ADVISORY LOCK
-- A session-level PostgreSQL advisory lock belongs to a CONNECTION. Prisma hands
-- out pooled connections, so the unlock can land on a different session than the
-- lock and leave the job wedged until the pool recycles. A transaction-scoped
-- advisory lock releases at commit — and the delivery pass commits once PER
-- EVENT on purpose, so that one poisonous row cannot roll back its neighbours.
-- Neither fits.
--
-- A lease row fits all three requirements at once: it is independent of
-- connection identity, it expires on its own when a holder crashes, and it is
-- VISIBLE — an operator can select it and see who holds the job and until when.
-- It is also the mechanism this repository already uses: the Phase 109 R3
-- automation run store leases a run scope exactly this way, and R5 proved that
-- lease against two independent OS processes.
--
-- WHAT THE LEASE IS NOT
-- It is not the correctness guarantee. Exactly-once delivery is enforced by the
-- conditional status transition on each outbox row (R7). The lease only stops
-- replicas from doing redundant work and from competing for the same rows. The
-- two are tested separately, and the R8 mutation matrix breaks them separately.
--
-- FENCING
-- `fencingToken` increments on every acquisition. A holder that was paused past
-- its expiry, and whose lease was taken by another replica, can compare the
-- token it holds against the row and discover it was superseded instead of
-- assuming it still owns the job.
--
-- Strictly additive: one table, no existing object touched, no data changed.
--
-- ROLLBACK
--   DROP TABLE "WorkerLease";
-- Every statement is guarded, so re-running this migration is a no-op.

CREATE TABLE IF NOT EXISTS "WorkerLease" (
    "name"         VARCHAR(64) NOT NULL,
    "holder"       VARCHAR(128) NOT NULL,
    "acquiredAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"    TIMESTAMP(3) NOT NULL,
    "fencingToken" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "WorkerLease_pkey" PRIMARY KEY ("name")
);

CREATE INDEX IF NOT EXISTS "WorkerLease_expiresAt_idx"
    ON "WorkerLease"("expiresAt");
