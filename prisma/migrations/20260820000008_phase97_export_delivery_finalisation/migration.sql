-- Phase 97 Part G — export delivery & revocation integrity finalisation.
--
-- ADDITIVE / STRENGTHENING ONLY. No table, column or ROW is dropped or rewritten;
-- migrations 20260820000006 and 20260820000007 are left untouched. One new nullable
-- column (packageHash) plus a set of CHECK constraints close three delivery-integrity
-- gaps:
--   1. a parentless (legacy) row may only ever hold a non-governed REVIEW_REQUIRED /
--      FAILED / CANCELLED state — so no parentless row can claim an active or READY
--      governed lifecycle and bypass the authoritative PrivacyRequest relationship;
--   2. a READY / EXPIRED / REVOKED job must carry durable package evidence
--      (packageKey, contentHash, packageHash, schemaVersion, expiresAt, completedAt),
--      and contentHash / packageHash must be well-formed SHA-256 hex; the
--      server-generated packageKey must bind to the job id;
--   3. every ExportDownloadToken must be fully bound (export + organization + subject
--      non-null, SHA-256 tokenHash, expiry) so the composite token FK — which under
--      MATCH SIMPLE is dormant when a component is null — is always active.
--
-- Legacy rows keep privacyRequestId NULL and were mapped by migration 6 to
-- REVIEW_REQUIRED / FAILED only, so they satisfy every new constraint. The
-- ExportDownloadToken table is new (Part G) and has no legacy rows.

-- New authoritative full-envelope integrity hash (nullable; set when a package is
-- completed). Distinct from contentHash (subject-content only): packageHash covers
-- the whole evidence-bearing manifest envelope.
ALTER TABLE "DataExportRequest" ADD COLUMN "packageHash" TEXT;

-- ── Preflight (fail-closed) ───────────────────────────────────────────────────
-- Before applying the strengthening constraints, count any pre-existing rows that
-- would be incompatible and ABORT with their CLASSIFICATION COUNTS only (never any
-- personal data or package content). No data-repair policy is invented here — an
-- operator must resolve flagged rows deliberately before this migration can apply.
DO $$
DECLARE
  n_parentless_active bigint;
  n_ready_no_evidence bigint;
  n_bad_content_hash  bigint;
  n_bad_package_key   bigint;
  n_tok_null_org      bigint;
  n_tok_null_subject  bigint;
  n_tok_bad_hash      bigint;
BEGIN
  SELECT count(*) INTO n_parentless_active FROM "DataExportRequest"
    WHERE "privacyRequestId" IS NULL
      AND "lifecycle" NOT IN ('REVIEW_REQUIRED','FAILED','CANCELLED');

  SELECT count(*) INTO n_ready_no_evidence FROM "DataExportRequest"
    WHERE "lifecycle" IN ('READY','EXPIRED','REVOKED')
      AND ("packageKey" IS NULL OR "contentHash" IS NULL OR "packageHash" IS NULL
        OR "schemaVersion" IS NULL OR "expiresAt" IS NULL OR "completedAt" IS NULL);

  SELECT count(*) INTO n_bad_content_hash FROM "DataExportRequest"
    WHERE "contentHash" IS NOT NULL AND "contentHash" !~ '^[a-f0-9]{64}$';

  SELECT count(*) INTO n_bad_package_key FROM "DataExportRequest"
    WHERE "packageKey" IS NOT NULL AND "packageKey" <> ('exports/' || "id" || '/package.json');

  SELECT count(*) INTO n_tok_null_org     FROM "ExportDownloadToken" WHERE "organizationId" IS NULL;
  SELECT count(*) INTO n_tok_null_subject FROM "ExportDownloadToken" WHERE "subjectUserId" IS NULL;
  SELECT count(*) INTO n_tok_bad_hash     FROM "ExportDownloadToken" WHERE "tokenHash" !~ '^[a-f0-9]{64}$';

  IF n_parentless_active > 0 OR n_ready_no_evidence > 0 OR n_bad_content_hash > 0
     OR n_bad_package_key > 0 OR n_tok_null_org > 0 OR n_tok_null_subject > 0 OR n_tok_bad_hash > 0 THEN
    RAISE EXCEPTION 'Phase97 export delivery finalisation preflight failed (no data-repair policy is invented; resolve before applying): parentless_active=% ready_without_evidence=% invalid_content_hash=% invalid_package_key=% token_null_org=% token_null_subject=% token_invalid_hash=%',
      n_parentless_active, n_ready_no_evidence, n_bad_content_hash, n_bad_package_key,
      n_tok_null_org, n_tok_null_subject, n_tok_bad_hash;
  END IF;
END $$;

-- ── DataExportRequest — parentless state restriction ──────────────────────────
-- A row without a parent link may hold ONLY a non-governed legacy state. Combined
-- with migration 7's governed_check (a privacyRequestId-bearing row must be fully
-- bound: org + user non-null, candidateId null, subjectClass USER, idempotencyKey
-- non-null), this guarantees every REQUESTED/AUTHORISED/COLLECTING/REDACTING/
-- PACKAGING/READY/EXPIRED/REVOKED row is a fully governed child of a PrivacyRequest.
ALTER TABLE "DataExportRequest" ADD CONSTRAINT "DataExportRequest_parentless_state_check"
  CHECK ("privacyRequestId" IS NOT NULL OR "lifecycle" IN ('REVIEW_REQUIRED','FAILED','CANCELLED'));

-- ── DataExportRequest — durable package evidence for READY/EXPIRED/REVOKED ─────
ALTER TABLE "DataExportRequest" ADD CONSTRAINT "DataExportRequest_package_evidence_check"
  CHECK ("lifecycle" NOT IN ('READY','EXPIRED','REVOKED')
    OR ("packageKey" IS NOT NULL AND "contentHash" IS NOT NULL AND "packageHash" IS NOT NULL
      AND "schemaVersion" IS NOT NULL AND "expiresAt" IS NOT NULL AND "completedAt" IS NOT NULL));

-- ── DataExportRequest — hash shape (SHA-256 hex) ──────────────────────────────
ALTER TABLE "DataExportRequest" ADD CONSTRAINT "DataExportRequest_content_hash_format_check"
  CHECK ("contentHash" IS NULL OR "contentHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "DataExportRequest" ADD CONSTRAINT "DataExportRequest_package_hash_format_check"
  CHECK ("packageHash" IS NULL OR "packageHash" ~ '^[a-f0-9]{64}$');

-- ── DataExportRequest — server-generated package-key shape bound to the job id ─
ALTER TABLE "DataExportRequest" ADD CONSTRAINT "DataExportRequest_package_key_shape_check"
  CHECK ("packageKey" IS NULL OR "packageKey" = ('exports/' || "id" || '/package.json'));

-- ── ExportDownloadToken — full binding completeness ───────────────────────────
-- The composite token FK (exportRequestId, organizationId, subjectUserId) is only
-- enforced by MATCH SIMPLE when all three are non-null; this CHECK makes that
-- always true, so a token can never carry a null organization or null subject and
-- thereby escape the composite binding. tokenHash must be a SHA-256 hex digest.
ALTER TABLE "ExportDownloadToken" ADD CONSTRAINT "ExportDownloadToken_binding_check"
  CHECK ("exportRequestId" IS NOT NULL AND "organizationId" IS NOT NULL AND "subjectUserId" IS NOT NULL
    AND "expiresAt" IS NOT NULL AND "tokenHash" ~ '^[a-f0-9]{64}$');
