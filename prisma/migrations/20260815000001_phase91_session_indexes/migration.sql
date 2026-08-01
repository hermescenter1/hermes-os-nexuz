-- PHASE 91 — session-store query index (additive, non-destructive).
--
-- The owner-scoped session-inventory and revoke-* paths all filter on
-- ("userId", "revokedAt"). This composite index serves those auth-hot-path
-- queries directly. Kept in a SEPARATE migration from 20260815000000 so the
-- original Phase 91 migration is never rewritten (its deployment state elsewhere
-- is treated as unknown). CREATE INDEX only — no table rewrite, no data change.
--
-- Rollback: DROP INDEX "RefreshToken_userId_revokedAt_idx";

-- CreateIndex
CREATE INDEX "RefreshToken_userId_revokedAt_idx" ON "RefreshToken"("userId", "revokedAt");
