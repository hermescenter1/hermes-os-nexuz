-- Phase 97 Part G hardening — database-level parent/subject/token binding.
--
-- ADDITIVE / STRENGTHENING ONLY. No table, column or ROW is dropped. The weak
-- single-column parent FK (ON DELETE SET NULL, which could orphan a governed job)
-- is REPLACED by a composite ON DELETE RESTRICT foreign key on the full parent
-- tuple. A governed job is identified by a non-null privacyRequestId and must be a
-- fully-bound USER job (CHECK); legacy rows keep privacyRequestId NULL and are
-- outside every new constraint, so existing rows validate cleanly.

-- Composite-FK targets (id is already unique, so these indexes always succeed).
CREATE UNIQUE INDEX "PrivacyRequest_id_org_user_key" ON "PrivacyRequest" ("id", "organizationId", "userId");
CREATE UNIQUE INDEX "DataExportRequest_id_org_user_key" ON "DataExportRequest" ("id", "organizationId", "userId");

-- Replace the weak SET NULL parent FK with a strong composite RESTRICT FK.
-- MATCH SIMPLE means it is enforced only when all three columns are non-null —
-- exactly the governed jobs — so a legacy row (privacyRequestId NULL) is exempt,
-- and a governed job can neither be orphaned nor claim a foreign parent org/user.
ALTER TABLE "DataExportRequest" DROP CONSTRAINT IF EXISTS "DataExportRequest_privacyRequestId_fkey";
ALTER TABLE "DataExportRequest" ADD CONSTRAINT "DataExportRequest_parent_tuple_fkey"
  FOREIGN KEY ("privacyRequestId", "organizationId", "userId")
  REFERENCES "PrivacyRequest" ("id", "organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A job WITH a parent link must be a fully-bound USER job.
ALTER TABLE "DataExportRequest" ADD CONSTRAINT "DataExportRequest_governed_check"
  CHECK ("privacyRequestId" IS NULL OR (
    "organizationId" IS NOT NULL AND "userId" IS NOT NULL AND "candidateId" IS NULL
    AND "subjectClass" = 'USER' AND "idempotencyKey" IS NOT NULL));

-- Lifecycle at/after AUTHORISED requires approval attribution.
ALTER TABLE "DataExportRequest" ADD CONSTRAINT "DataExportRequest_approval_check"
  CHECK ("lifecycle" NOT IN ('AUTHORISED','COLLECTING','REDACTING','PACKAGING','READY','EXPIRED','REVOKED')
    OR ("approvedBy" IS NOT NULL AND "approvedAt" IS NOT NULL));

-- Token → export composite binding so a token cannot claim a different org or
-- subject than its owning export (governed tokens carry org + subject → enforced;
-- legacy tokens with NULLs are outside it). Cascade for token rows only.
ALTER TABLE "ExportDownloadToken" ADD CONSTRAINT "ExportDownloadToken_binding_fkey"
  FOREIGN KEY ("exportRequestId", "organizationId", "subjectUserId")
  REFERENCES "DataExportRequest" ("id", "organizationId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
