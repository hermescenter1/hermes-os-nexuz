-- Phase 97 — Governed legal-document lifecycle (Part D).
--
-- ADDITIVE columns + a documented data MAPPING (no row is dropped or deleted).
-- Existing LegalDocument/LegalAcceptance rows are preserved. `isPublished` is
-- mapped onto the new authoritative `lifecycle`; where a scope already had more
-- than one published version, the older ones are marked SUPERSEDED (isPublished
-- flipped to false) so the single-effective-version invariant holds before the
-- partial unique index is created — this preserves every row and only corrects
-- an already-invalid multi-effective state. No DROP TABLE / DROP COLUMN.

-- AlterTable: LegalDocument — governed lifecycle columns.
ALTER TABLE "LegalDocument" ADD COLUMN "lifecycle" TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "LegalDocument" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "LegalDocument" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "LegalDocument" ADD COLUMN "publishedBy" TEXT;
ALTER TABLE "LegalDocument" ADD COLUMN "withdrawnAt" TIMESTAMP(3);
ALTER TABLE "LegalDocument" ADD COLUMN "supersededById" TEXT;

-- Data mapping: published rows become PUBLISHED (documented, non-destructive).
UPDATE "LegalDocument" SET "lifecycle" = 'PUBLISHED' WHERE "isPublished" = true;

-- Correct any pre-existing multi-effective state: keep the most-recently-published
-- (then highest version, then id) row effective per owner/type/locale; supersede
-- the rest. Rows are preserved — only isPublished/lifecycle are corrected.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY "documentType", "locale", COALESCE("organizationId", '__global__')
    ORDER BY "publishedAt" DESC NULLS LAST, "version" DESC, id DESC
  ) AS rn
  FROM "LegalDocument"
  WHERE "isPublished" = true
)
UPDATE "LegalDocument" d
SET "isPublished" = false, "lifecycle" = 'SUPERSEDED'
FROM ranked r
WHERE d.id = r.id AND r.rn > 1;

-- Owner-scoped version uniqueness. NULLS NOT DISTINCT so two GLOBAL rows
-- (organizationId NULL) with the same type/version/locale still collide. Replaces
-- the previous global-only (documentType, version, locale) unique constraint.
ALTER TABLE "LegalDocument" DROP CONSTRAINT IF EXISTS "LegalDocument_documentType_version_locale_key";
CREATE UNIQUE INDEX "LegalDocument_owner_version_key"
  ON "LegalDocument" ("documentType", "version", "locale", "organizationId") NULLS NOT DISTINCT;

-- At most one currently-published (effective) version per owner/type/locale. The
-- database backstop for MULTIPLE_EFFECTIVE_LEGAL_DOCUMENT_VERSIONS=0 under
-- concurrent publication.
CREATE UNIQUE INDEX "LegalDocument_effective_key"
  ON "LegalDocument" ("documentType", "locale", "organizationId") NULLS NOT DISTINCT
  WHERE ("isPublished" = true);

-- Lifecycle query index.
CREATE INDEX "LegalDocument_organizationId_lifecycle_idx" ON "LegalDocument" ("organizationId", "lifecycle");

-- Supersession self-reference.
ALTER TABLE "LegalDocument" ADD CONSTRAINT "LegalDocument_supersededById_fkey"
  FOREIGN KEY ("supersededById") REFERENCES "LegalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: LegalAcceptance — safe evidence columns (no raw IP/UA added).
ALTER TABLE "LegalAcceptance" ADD COLUMN "documentType" TEXT;
ALTER TABLE "LegalAcceptance" ADD COLUMN "documentVersion" TEXT;
ALTER TABLE "LegalAcceptance" ADD COLUMN "sourceClass" TEXT;
ALTER TABLE "LegalAcceptance" ADD COLUMN "correlationId" TEXT;
ALTER TABLE "LegalAcceptance" ADD COLUMN "withdrawnAt" TIMESTAMP(3);

-- CreateIndex: acceptance duplicate-check path (per version + subject).
CREATE INDEX "LegalAcceptance_legalDocumentId_userId_idx" ON "LegalAcceptance" ("legalDocumentId", "userId");
