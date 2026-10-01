-- F-2: tenant ownership for the document pipeline (additive only).
--
-- Part 1 — makes the existing nullable "Document"."tenantId" a real reference
-- to the owning organization. No column is added, dropped or rewritten and no
-- row is updated or deleted:
--   * ADD CONSTRAINT FOREIGN KEY validates existing rows. A non-NULL tenantId
--     that does not match an Organization makes this migration FAIL rather
--     than silently repair data. Production read-only check (Q3, 2026-09-24,
--     owner-run): Document = 0 rows.
--   * NULL tenantId stays allowed (unassigned documents are invisible to every
--     tenant; see src/lib/documents/chunk-vector-store.ts).
--   * ON DELETE RESTRICT: an organization that still owns documents cannot be
--     deleted; ON UPDATE CASCADE follows the repository's FK convention.
-- DocumentTextChunk is intentionally NOT given its own tenant column: a
-- chunk's tenant is always its parent Document's tenantId (Option S,
-- docs/industrial/f2-document-tenant-ownership-proposal.md §3.2).
--
-- Part 2 (FU-F2-R2-3) — a NEW, empty outbox table, "DocumentStorageCleanup",
-- and its enum. A document delete writes one row here in the same transaction
-- that removes the Document and its chunks; the stored files are removed after
-- the commit and retried from this row until they are gone. Creating an empty
-- table touches no existing row. RESTRICT on the organization FK: an
-- organization with cleanups still pending cannot be deleted.
--
-- Rollback (new down migration, only if required, and only once no
-- DocumentStorageCleanup row is PENDING):
--   DROP TABLE "DocumentStorageCleanup";
--   DROP TYPE "DocumentStorageCleanupStatus";
--   ALTER TABLE "Document" DROP CONSTRAINT "Document_tenantId_fkey";
--   DROP INDEX "Document_tenantId_createdAt_idx";

-- CreateIndex
CREATE INDEX "Document_tenantId_createdAt_idx" ON "Document"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "DocumentStorageCleanupStatus" AS ENUM ('PENDING', 'DONE');

-- CreateTable
CREATE TABLE "DocumentStorageCleanup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "objectKeys" TEXT[],
    "status" "DocumentStorageCleanupStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" VARCHAR(64),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentStorageCleanup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentStorageCleanup_documentId_key" ON "DocumentStorageCleanup"("documentId");

-- CreateIndex
CREATE INDEX "DocumentStorageCleanup_status_nextAttemptAt_idx" ON "DocumentStorageCleanup"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "DocumentStorageCleanup_organizationId_status_nextAttemptAt_idx" ON "DocumentStorageCleanup"("organizationId", "status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "DocumentStorageCleanup" ADD CONSTRAINT "DocumentStorageCleanup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
