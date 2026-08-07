-- Phase 97 Part I — exact provider-scope binding for Subprocessor approval.
--
-- ADDITIVE / STRENGTHENING ONLY. Migration 20260820000011 (and everything earlier)
-- is untouched; no row is deleted or rewritten. A provider-linked Subprocessor now
-- carries an EXPLICIT closed provider-governance scope (providerDataClasses ×
-- providerWorkflows, Phase 95 vocabularies) plus the approval-binding evidence
-- (approvedProviderPolicyVersion, approvedProviderScopeHash, providerPolicyEvaluatedAt)
-- so approval/activation binds to the EXACT current AiProviderPolicy version and a
-- SHA-256 of the canonical scope. A CHECK requires that binding evidence for any
-- provider-linked APPROVED/ACTIVE row.

-- AlterTable: new provider-scope columns + binding evidence.
ALTER TABLE "Subprocessor" ADD COLUMN "providerDataClasses" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Subprocessor" ADD COLUMN "providerWorkflows" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Subprocessor" ADD COLUMN "approvedProviderPolicyVersion" TEXT;
ALTER TABLE "Subprocessor" ADD COLUMN "approvedProviderScopeHash" TEXT;
ALTER TABLE "Subprocessor" ADD COLUMN "providerPolicyEvaluatedAt" TIMESTAMP(3);

-- ── Preflight (fail-closed) ───────────────────────────────────────────────────
-- Abort with CLASSIFICATION COUNTS only (never provider config or personal data) if
-- any pre-existing provider-linked APPROVED/ACTIVE row lacks complete binding
-- evidence. No evidence is ever invented for existing rows.
DO $$
DECLARE
  n_unbound bigint;
BEGIN
  SELECT count(*) INTO n_unbound FROM "Subprocessor"
    WHERE "lifecycle" IN ('APPROVED','ACTIVE') AND "providerRegistryId" IS NOT NULL
      AND ("approvedProviderPolicyVersion" IS NULL
        OR "approvedProviderScopeHash" IS NULL
        OR "approvedProviderScopeHash" !~ '^[a-f0-9]{64}$'
        OR "providerPolicyEvaluatedAt" IS NULL
        OR jsonb_typeof("providerDataClasses") <> 'array' OR jsonb_array_length("providerDataClasses") = 0
        OR jsonb_typeof("providerWorkflows") <> 'array' OR jsonb_array_length("providerWorkflows") = 0);

  IF n_unbound > 0 THEN
    RAISE EXCEPTION 'Phase97 provider-scope binding preflight failed (no binding evidence is invented; resolve before applying): provider_linked_approved_without_binding=%', n_unbound;
  END IF;
END $$;

-- A provider-linked APPROVED/ACTIVE Subprocessor must carry complete, well-formed
-- provider-policy binding evidence and a non-empty declared scope.
ALTER TABLE "Subprocessor" ADD CONSTRAINT "Subprocessor_provider_binding_check"
  CHECK ("lifecycle" NOT IN ('APPROVED','ACTIVE') OR "providerRegistryId" IS NULL OR (
    "approvedProviderPolicyVersion" IS NOT NULL
    AND "approvedProviderScopeHash" IS NOT NULL AND "approvedProviderScopeHash" ~ '^[a-f0-9]{64}$'
    AND "providerPolicyEvaluatedAt" IS NOT NULL
    AND jsonb_typeof("providerDataClasses") = 'array'
    AND (CASE WHEN jsonb_typeof("providerDataClasses") = 'array' THEN jsonb_array_length("providerDataClasses") ELSE 0 END) > 0
    AND jsonb_typeof("providerWorkflows") = 'array'
    AND (CASE WHEN jsonb_typeof("providerWorkflows") = 'array' THEN jsonb_array_length("providerWorkflows") ELSE 0 END) > 0));
