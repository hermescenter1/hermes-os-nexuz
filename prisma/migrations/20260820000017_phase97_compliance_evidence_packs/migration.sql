-- Phase 97 — governed compliance evidence packs.
--
-- ADDITIVE / STRENGTHENING ONLY. Migrations 20260820000000..16 are untouched. No
-- DROP TABLE / DROP COLUMN / TRUNCATE / DELETE FROM; no evidence fabrication, no
-- automatic readiness approval, no automatic actor assignment, no legal classification,
-- no silent data repair. A fail-closed classification-count-only preflight aborts (with
-- counts + closed labels ONLY, never row content) if any pre-existing row would violate
-- a new constraint that touches an existing table.
--
-- A pack is an authoritative, tenant-owned snapshot of governance evidence. READY means
-- the canonical manifest was generated consistently from ONE database snapshot — never
-- legal compliance or certification. READY manifests and all items are immutable
-- (triggers); only a governed revocation may follow. Evidence values are SAFE
-- projections only (identifiers, versions, timestamps, counts, booleans, closed
-- classifications, cryptographic hashes) — never raw personal data, bodies, contracts,
-- secrets, provider config or an incident's sensitiveSummary.

-- ── 1. Tenant-safe target uniqueness on existing scope tables ──────────────────
-- Required so a same-org composite FK can bind a pack to its target. `id` is already the
-- primary key, so (id, organizationId) is unique by construction; this is additive.
CREATE UNIQUE INDEX "ProcessingActivity_id_organizationId_key" ON "ProcessingActivity" ("id", "organizationId");
CREATE UNIQUE INDEX "PrivacyRequest_id_organizationId_key" ON "PrivacyRequest" ("id", "organizationId");

-- ── 2. Fail-closed preflight (classification COUNTS only — no row content) ─────
DO $$
DECLARE
  n_pa_dup bigint; n_pr_dup bigint;
BEGIN
  SELECT count(*) INTO n_pa_dup FROM (
    SELECT 1 FROM "ProcessingActivity" GROUP BY "id", "organizationId" HAVING count(*) > 1
  ) d;
  SELECT count(*) INTO n_pr_dup FROM (
    SELECT 1 FROM "PrivacyRequest" GROUP BY "id", "organizationId" HAVING count(*) > 1
  ) d;
  IF n_pa_dup > 0 OR n_pr_dup > 0 THEN
    RAISE EXCEPTION 'Phase97 evidence-pack preflight failed (no row repaired; resolve before applying): processing_activities_with_duplicate_id_org=% privacy_requests_with_duplicate_id_org=%',
      n_pa_dup, n_pr_dup;
  END IF;
END $$;

-- ── 3. ComplianceEvidencePack ─────────────────────────────────────────────────
CREATE TABLE "ComplianceEvidencePack" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "lifecycle" TEXT NOT NULL DEFAULT 'REQUESTED',
    "readiness" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "scopeType" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL DEFAULT '1.0',
    "idempotencyKey" TEXT NOT NULL,
    "targetIncidentId" TEXT,
    "targetProcessingActivityId" TEXT,
    "targetPrivacyRequestId" TEXT,
    "requestedBy" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshotAt" TIMESTAMP(3),
    "generatedBy" TEXT,
    "generatedAt" TIMESTAMP(3),
    "manifestHash" TEXT,
    "manifestJson" JSONB,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "failureCode" TEXT,
    "revokedBy" TEXT,
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceEvidencePack_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ComplianceEvidencePack_lifecycle_check" CHECK ("lifecycle" IN ('REQUESTED','GENERATING','READY','FAILED','REVOKED','EXPIRED')),
    CONSTRAINT "ComplianceEvidencePack_readiness_check" CHECK ("readiness" IN ('COMPLETE','REVIEW_REQUIRED','CONFIGURATION_REQUIRED','INSUFFICIENT_EVIDENCE')),
    CONSTRAINT "ComplianceEvidencePack_scope_type_check" CHECK ("scopeType" IN ('ORGANIZATION','INCIDENT','PROCESSING_ACTIVITY','PRIVACY_REQUEST')),
    CONSTRAINT "ComplianceEvidencePack_scope_target_check" CHECK (
      ("scopeType" = 'ORGANIZATION' AND "targetIncidentId" IS NULL AND "targetProcessingActivityId" IS NULL AND "targetPrivacyRequestId" IS NULL)
      OR ("scopeType" = 'INCIDENT' AND "targetIncidentId" IS NOT NULL AND "targetProcessingActivityId" IS NULL AND "targetPrivacyRequestId" IS NULL)
      OR ("scopeType" = 'PROCESSING_ACTIVITY' AND "targetProcessingActivityId" IS NOT NULL AND "targetIncidentId" IS NULL AND "targetPrivacyRequestId" IS NULL)
      OR ("scopeType" = 'PRIVACY_REQUEST' AND "targetPrivacyRequestId" IS NOT NULL AND "targetIncidentId" IS NULL AND "targetProcessingActivityId" IS NULL)
    ),
    CONSTRAINT "ComplianceEvidencePack_schema_version_check" CHECK ("schemaVersion" ~ '^[0-9]+\.[0-9]+$'),
    CONSTRAINT "ComplianceEvidencePack_manifest_hash_check" CHECK ("manifestHash" IS NULL OR "manifestHash" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "ComplianceEvidencePack_item_count_check" CHECK ("itemCount" >= 0),
    CONSTRAINT "ComplianceEvidencePack_generated_attr_check" CHECK (("generatedBy" IS NULL) = ("generatedAt" IS NULL)),
    CONSTRAINT "ComplianceEvidencePack_ready_complete_check" CHECK (
      "lifecycle" <> 'READY' OR (
        "manifestHash" IS NOT NULL AND "manifestJson" IS NOT NULL AND "snapshotAt" IS NOT NULL
        AND "generatedBy" IS NOT NULL AND "generatedAt" IS NOT NULL
      )
    ),
    CONSTRAINT "ComplianceEvidencePack_revocation_check" CHECK (
      "lifecycle" <> 'REVOKED' OR ("revokedBy" IS NOT NULL AND "revokedAt" IS NOT NULL)
    )
);
CREATE UNIQUE INDEX "ComplianceEvidencePack_id_organizationId_key" ON "ComplianceEvidencePack" ("id", "organizationId");
CREATE UNIQUE INDEX "ComplianceEvidencePack_organizationId_idempotencyKey_key" ON "ComplianceEvidencePack" ("organizationId", "idempotencyKey");
CREATE INDEX "ComplianceEvidencePack_organizationId_lifecycle_idx" ON "ComplianceEvidencePack" ("organizationId", "lifecycle");
CREATE INDEX "ComplianceEvidencePack_organizationId_scopeType_idx" ON "ComplianceEvidencePack" ("organizationId", "scopeType");
CREATE INDEX "ComplianceEvidencePack_organizationId_updatedAt_idx" ON "ComplianceEvidencePack" ("organizationId", "updatedAt");

-- ── 4. ComplianceEvidencePackItem ─────────────────────────────────────────────
CREATE TABLE "ComplianceEvidencePackItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "evidencePackId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "evidenceCode" TEXT NOT NULL,
    "evidenceStatus" TEXT NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "sourceVersion" TEXT,
    "sourceUpdatedAt" TIMESTAMP(3),
    "safeMetadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceEvidencePackItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ComplianceEvidencePackItem_hash_check" CHECK ("evidenceHash" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "ComplianceEvidencePackItem_sequence_check" CHECK ("sequence" > 0)
);
CREATE UNIQUE INDEX "ComplianceEvidencePackItem_evidencePackId_sequence_key" ON "ComplianceEvidencePackItem" ("evidencePackId", "sequence");
CREATE UNIQUE INDEX "ComplianceEvidencePackItem_id_organizationId_key" ON "ComplianceEvidencePackItem" ("id", "organizationId");
CREATE INDEX "ComplianceEvidencePackItem_organizationId_idx" ON "ComplianceEvidencePackItem" ("organizationId");
CREATE INDEX "ComplianceEvidencePackItem_evidencePackId_idx" ON "ComplianceEvidencePackItem" ("evidencePackId");

-- ── 5. Organization ownership (RESTRICT — evidence never silently orphaned) ────
ALTER TABLE "ComplianceEvidencePack" ADD CONSTRAINT "ComplianceEvidencePack_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplianceEvidencePackItem" ADD CONSTRAINT "ComplianceEvidencePackItem_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 6. Composite tenant-bound parent binding (item → pack, same org) ──────────
ALTER TABLE "ComplianceEvidencePackItem" ADD CONSTRAINT "ComplianceEvidencePackItem_pack_tuple_fkey"
  FOREIGN KEY ("evidencePackId", "organizationId")
  REFERENCES "ComplianceEvidencePack" ("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 7. Composite same-org scope-target bindings (tenant-safe; RESTRICT) ────────
ALTER TABLE "ComplianceEvidencePack" ADD CONSTRAINT "ComplianceEvidencePack_incident_tuple_fkey"
  FOREIGN KEY ("targetIncidentId", "organizationId")
  REFERENCES "ComplianceIncident" ("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplianceEvidencePack" ADD CONSTRAINT "ComplianceEvidencePack_processing_activity_tuple_fkey"
  FOREIGN KEY ("targetProcessingActivityId", "organizationId")
  REFERENCES "ProcessingActivity" ("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplianceEvidencePack" ADD CONSTRAINT "ComplianceEvidencePack_privacy_request_tuple_fkey"
  FOREIGN KEY ("targetPrivacyRequestId", "organizationId")
  REFERENCES "PrivacyRequest" ("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 8. Immutable READY pack (evidence fields) — governed REVOKED/EXPIRED only ──
CREATE OR REPLACE FUNCTION compliance_evidence_pack_ready_immutable()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."lifecycle" = 'READY' THEN
    IF NEW."lifecycle" NOT IN ('REVOKED','EXPIRED')
       OR NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
       OR NEW."scopeType" IS DISTINCT FROM OLD."scopeType"
       OR NEW."schemaVersion" IS DISTINCT FROM OLD."schemaVersion"
       OR NEW."readiness" IS DISTINCT FROM OLD."readiness"
       OR NEW."manifestHash" IS DISTINCT FROM OLD."manifestHash"
       OR NEW."manifestJson" IS DISTINCT FROM OLD."manifestJson"
       OR NEW."itemCount" IS DISTINCT FROM OLD."itemCount"
       OR NEW."snapshotAt" IS DISTINCT FROM OLD."snapshotAt"
       OR NEW."generatedBy" IS DISTINCT FROM OLD."generatedBy"
       OR NEW."generatedAt" IS DISTINCT FROM OLD."generatedAt"
       OR NEW."requestedBy" IS DISTINCT FROM OLD."requestedBy"
       OR NEW."requestedAt" IS DISTINCT FROM OLD."requestedAt"
       OR NEW."targetIncidentId" IS DISTINCT FROM OLD."targetIncidentId"
       OR NEW."targetProcessingActivityId" IS DISTINCT FROM OLD."targetProcessingActivityId"
       OR NEW."targetPrivacyRequestId" IS DISTINCT FROM OLD."targetPrivacyRequestId"
    THEN
      RAISE EXCEPTION 'ComplianceEvidencePack READY evidence is immutable; only a governed REVOKED/EXPIRED transition preserving evidence is permitted';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER compliance_evidence_pack_ready_immutable_trg
  BEFORE UPDATE ON "ComplianceEvidencePack"
  FOR EACH ROW EXECUTE FUNCTION compliance_evidence_pack_ready_immutable();

-- ── 9. Immutable evidence items (append-only; UPDATE/DELETE rejected) ──────────
CREATE OR REPLACE FUNCTION compliance_evidence_pack_item_immutable()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ComplianceEvidencePackItem is immutable; % is not permitted', TG_OP;
END $$;
CREATE TRIGGER compliance_evidence_pack_item_no_mutation
  BEFORE UPDATE OR DELETE ON "ComplianceEvidencePackItem"
  FOR EACH ROW EXECUTE FUNCTION compliance_evidence_pack_item_immutable();
