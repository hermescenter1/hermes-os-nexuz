-- Phase 41.5 hardening: additive status columns on KnowledgeGraphSnapshot.
--
-- SAFETY: status is NOT NULL with DEFAULT 'SUCCESS' so the ALTER TABLE
-- backfills all existing rows to SUCCESS immediately — no separate UPDATE
-- is needed. Existing snapshots are by definition completed successful builds.
-- errorMessage, startedAt, completedAt are nullable — no backfill required.
--
-- A secondary index on (organizationId, status) is added so the builder can
-- efficiently query for in-flight RUNNING snapshots without a full table scan.

CREATE TYPE "KnowledgeGraphBuildStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

ALTER TABLE "KnowledgeGraphSnapshot"
  ADD COLUMN "status"       "KnowledgeGraphBuildStatus" NOT NULL DEFAULT 'SUCCESS',
  ADD COLUMN "errorMessage" TEXT,
  ADD COLUMN "startedAt"    TIMESTAMP(3),
  ADD COLUMN "completedAt"  TIMESTAMP(3);

CREATE INDEX "KnowledgeGraphSnapshot_organizationId_status_idx"
  ON "KnowledgeGraphSnapshot" ("organizationId", "status");
