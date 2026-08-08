-- Phase 97 Part I — provider-scope element-type strengthening.
--
-- ADDITIVE / STRENGTHENING ONLY. Migration 20260820000012 (and everything earlier)
-- is untouched; no row is deleted, repaired or rewritten. An APPROVED/ACTIVE
-- provider-linked Subprocessor's declared provider scope (providerDataClasses ×
-- providerWorkflows) must contain STRING elements only, so a non-string member can
-- never be silently excluded from the canonical SHA-256 scope hash
-- (MALFORMED_PROVIDER_SCOPE_APPROVAL=0, PROVIDER_SCOPE_HASH_EXCLUDES_STORED_ELEMENT=0).
-- Migration 12 already requires these to be non-empty arrays for approved rows; this
-- migration additionally requires every element to be a JSON string.

-- IMMUTABLE helper: true iff j is a JSONB array whose every element is a JSON string.
-- The CASE guards jsonb_array_elements so a non-array value never raises.
CREATE OR REPLACE FUNCTION compliance_jsonb_is_string_array(j jsonb)
  RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN jsonb_typeof(j) = 'array'
    THEN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j) AS e WHERE jsonb_typeof(e) <> 'string')
    ELSE false END;
$$;

-- ── Preflight (fail-closed, classification COUNT only) ────────────────────────
-- Abort with a COUNT only (never provider config or personal data) if any
-- pre-existing provider-linked APPROVED/ACTIVE row carries a non-string scope member.
-- No row is repaired or rewritten.
DO $$
DECLARE
  n_bad bigint;
BEGIN
  SELECT count(*) INTO n_bad FROM "Subprocessor"
    WHERE "lifecycle" IN ('APPROVED','ACTIVE') AND "providerRegistryId" IS NOT NULL
      AND NOT (compliance_jsonb_is_string_array("providerDataClasses")
               AND compliance_jsonb_is_string_array("providerWorkflows"));

  IF n_bad > 0 THEN
    RAISE EXCEPTION 'Phase97 provider-scope string-element preflight failed (no row repaired; resolve before applying): provider_linked_approved_with_non_string_scope=%', n_bad;
  END IF;
END $$;

-- A provider-linked APPROVED/ACTIVE Subprocessor's declared scope arrays must contain
-- string elements only. DRAFT/UNDER_REVIEW rows may hold in-progress values; they can
-- never be APPROVED while malformed (the application strict parser fails closed).
ALTER TABLE "Subprocessor" ADD CONSTRAINT "Subprocessor_provider_scope_string_elements_check"
  CHECK (
    "lifecycle" NOT IN ('APPROVED','ACTIVE')
    OR "providerRegistryId" IS NULL
    OR (compliance_jsonb_is_string_array("providerDataClasses")
        AND compliance_jsonb_is_string_array("providerWorkflows"))
  );
