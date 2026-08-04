-- Phase 97 Part D hardening — close publication and acceptance races.
--
-- ADDITIVE ONLY. A CHECK constraint and a partial unique index are added; no
-- table/column/constraint is dropped and no row is read, rewritten or deleted.
-- The lifecycle CHECK accepts every value the application already writes, so it
-- validates cleanly against existing rows. The partial unique index is scoped to
-- the governed active acceptance path (sourceClass = 'AUTHENTICATED_WEB',
-- withdrawnAt IS NULL, userId IS NOT NULL), so legacy acceptance rows (sourceClass
-- NULL) are outside it and are never rewritten or deduplicated by this migration.

-- Database-enforced lifecycle vocabulary (UNKNOWN_LEGAL_DOCUMENT_LIFECYCLE_AT_DB=0).
ALTER TABLE "LegalDocument" ADD CONSTRAINT "LegalDocument_lifecycle_check"
  CHECK ("lifecycle" IN ('DRAFT','IN_REVIEW','APPROVED','SCHEDULED','PUBLISHED','SUPERSEDED','WITHDRAWN','ARCHIVED'));

-- At most one ACTIVE governed (AUTHENTICATED_WEB) acceptance per document + user.
-- Withdrawn rows (withdrawnAt set) are excluded, so a new acceptance after a
-- withdrawal is allowed and historical evidence is preserved.
CREATE UNIQUE INDEX "LegalAcceptance_active_governed_key"
  ON "LegalAcceptance" ("legalDocumentId", "userId")
  WHERE ("withdrawnAt" IS NULL AND "userId" IS NOT NULL AND "sourceClass" = 'AUTHENTICATED_WEB');
