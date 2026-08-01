-- PHASE 91 — Enterprise IAM hardening.
--
-- Additive and non-destructive. Three columns, no data dropped, renamed, or
-- rewritten. Every existing row receives a safe default and no session is
-- invalidated on upgrade (see the backward-compatibility notes per column).
--
--  1. RefreshToken.lastUsedAt (nullable)  — powers the owner-facing active-session
--     inventory "last active" column. Existing rows get NULL ("not observed since
--     upgrade"). Read-only for authorization.
--
--  2. User.tokenVersion (NOT NULL DEFAULT 0) — monotonic session generation. A
--     "revoke all sessions" increments it; a session is active only while its
--     stamped RefreshToken.userTokenVersion equals it. Existing users default to
--     0, matching the default stamp below, so current sessions stay valid.
--
--  3. RefreshToken.userTokenVersion (NOT NULL DEFAULT 0) — the User.tokenVersion
--     captured when the session was minted. Existing rows default to 0 == the
--     users' default tokenVersion, so no session is cut short by the upgrade.
--
-- Rollback (safe; all three are additive and read-only for legacy behaviour):
--   ALTER TABLE "RefreshToken" DROP COLUMN "lastUsedAt";
--   ALTER TABLE "RefreshToken" DROP COLUMN "userTokenVersion";
--   ALTER TABLE "User" DROP COLUMN "tokenVersion";
-- Legacy-data quarantine: none required — the defaults reproduce pre-Phase-91
-- behaviour (version 0 everywhere ⇒ every existing session remains active).

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN "lastUsedAt" TIMESTAMP(3);
ALTER TABLE "RefreshToken" ADD COLUMN "userTokenVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
