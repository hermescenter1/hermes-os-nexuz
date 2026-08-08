-- Phase 97 Part G — Governed subject data export.
--
-- ADDITIVE ONLY. New columns + a new ExportDownloadToken table + a documented
-- lifecycle mapping (no row deleted). Existing DataExportRequest rows are
-- preserved and mapped fail-closed: FAILED stays FAILED; every other legacy
-- status (PENDING/PROCESSING/COMPLETED) becomes REVIEW_REQUIRED — no approval is
-- invented and the legacy downloadUrl is never treated as a governed capability.

-- AlterTable: DataExportRequest — governed child-job columns.
ALTER TABLE "DataExportRequest" ADD COLUMN "privacyRequestId" TEXT;
ALTER TABLE "DataExportRequest" ADD COLUMN "lifecycle" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED';
ALTER TABLE "DataExportRequest" ADD COLUMN "subjectClass" TEXT;
ALTER TABLE "DataExportRequest" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "DataExportRequest" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "DataExportRequest" ADD COLUMN "schemaVersion" TEXT;
ALTER TABLE "DataExportRequest" ADD COLUMN "packageKey" TEXT;
ALTER TABLE "DataExportRequest" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "DataExportRequest" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "DataExportRequest" ADD COLUMN "revokedBy" TEXT;
ALTER TABLE "DataExportRequest" ADD COLUMN "revokedAt" TIMESTAMP(3);
ALTER TABLE "DataExportRequest" ADD COLUMN "failureCode" TEXT;

-- Data mapping: fail-closed. FAILED preserved; everything else → REVIEW_REQUIRED.
UPDATE "DataExportRequest" SET "lifecycle" = 'FAILED' WHERE "status" = 'FAILED';
UPDATE "DataExportRequest" SET "lifecycle" = 'REVIEW_REQUIRED' WHERE "status" <> 'FAILED';

-- Closed lifecycle vocabulary at the database layer.
ALTER TABLE "DataExportRequest" ADD CONSTRAINT "DataExportRequest_lifecycle_check"
  CHECK ("lifecycle" IN ('REVIEW_REQUIRED','REQUESTED','AUTHORISED','COLLECTING','REDACTING','PACKAGING','READY','EXPIRED','FAILED','REVOKED','CANCELLED'));

-- At most one ACTIVE governed job per parent PrivacyRequest (legacy rows have a
-- NULL privacyRequestId and are outside the index).
CREATE UNIQUE INDEX "DataExportRequest_active_parent_key"
  ON "DataExportRequest" ("privacyRequestId")
  WHERE ("privacyRequestId" IS NOT NULL AND "lifecycle" IN ('REQUESTED','AUTHORISED','COLLECTING','REDACTING','PACKAGING','READY'));

-- CreateIndex
CREATE INDEX "DataExportRequest_organizationId_lifecycle_idx" ON "DataExportRequest" ("organizationId", "lifecycle");
CREATE INDEX "DataExportRequest_privacyRequestId_idx" ON "DataExportRequest" ("privacyRequestId");

-- AddForeignKey: parent PrivacyRequest (SetNull preserves export evidence if the
-- parent is ever removed — the export job row is never destroyed by this FK).
ALTER TABLE "DataExportRequest" ADD CONSTRAINT "DataExportRequest_privacyRequestId_fkey"
  FOREIGN KEY ("privacyRequestId") REFERENCES "PrivacyRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: ExportDownloadToken (hash-at-rest, single-use, short-lived).
CREATE TABLE "ExportDownloadToken" (
    "id" TEXT NOT NULL,
    "exportRequestId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "subjectUserId" TEXT,
    "organizationId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportDownloadToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExportDownloadToken_tokenHash_key" ON "ExportDownloadToken"("tokenHash");
CREATE INDEX "ExportDownloadToken_exportRequestId_idx" ON "ExportDownloadToken"("exportRequestId");

-- AddForeignKey: token cascades from the owning export request (its evidence is
-- represented by the preserved export job).
ALTER TABLE "ExportDownloadToken" ADD CONSTRAINT "ExportDownloadToken_exportRequestId_fkey"
  FOREIGN KEY ("exportRequestId") REFERENCES "DataExportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
