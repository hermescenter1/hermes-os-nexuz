-- Phase 97 — Governed Compliance Incident Management.
--
-- ADDITIVE ONLY. Two NEW tenant-owned tables (no existing rows anywhere, so no data
-- mapping and no classification preflight are required) plus one additive unique
-- index on DataTransfer used as a composite-FK target. Migrations 20260820000000
-- through 20260820000013 are untouched. No destructive operation; no existing record
-- is deleted, rewritten or automatically classified.
--
--   - Every incident carries an authoritative organizationId with a REAL Organization
--     FK (ON DELETE RESTRICT — governance evidence is never silently orphaned).
--   - Closed incidentType / severity / lifecycle / assessmentStatus / sourceClass
--     CHECKs quarantine unknown values (fail-closed defaults REVIEW_REQUIRED / OPEN).
--   - Attribution CHECKs: RESOLVED/CLOSED require resolution/closure attribution, and
--     a recorded decision requires decision attribution, at the database layer.
--   - Composite tenant-safe reference FKs (processingActivityId / subprocessorId /
--     dataTransferId, organizationId) → (id, organizationId) ON DELETE RESTRICT — a
--     foreign-tenant identifier can never be linked even when the raw id is valid
--     (CROSS_TENANT_INCIDENT_RELATION=0). MATCH SIMPLE + non-null organizationId means
--     the FK is enforced exactly when the optional reference is set.
--   - The incident timeline is APPEND-ONLY: a BEFORE UPDATE trigger rejects any
--     mutation of a recorded event; per-incident sequence uniqueness + the surrounding
--     FOR UPDATE incident lock linearise appends.
--   - Duplicate-creation protection: unique (organizationId, idempotencyKey).

-- CreateTable
CREATE TABLE "ComplianceIncident" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "incidentType" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "severity" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "lifecycle" TEXT NOT NULL DEFAULT 'OPEN',
    "assessmentStatus" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "sourceClass" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "correlationId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurredAt" TIMESTAMP(3),
    "summaryCode" TEXT,
    "sensitiveSummary" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "processingActivityId" TEXT,
    "subprocessorId" TEXT,
    "dataTransferId" TEXT,
    "openBlockerCount" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT,
    "assignedToId" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "decisionBy" TEXT,
    "decisionAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "reopenedBy" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable (append-only timeline / evidence)
CREATE TABLE "ComplianceIncidentEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "complianceIncidentId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "eventCode" TEXT NOT NULL,
    "fromLifecycle" TEXT,
    "toLifecycle" TEXT,
    "fromAssessment" TEXT,
    "toAssessment" TEXT,
    "actorId" TEXT,
    "evidenceHash" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceIncidentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceIncident_organizationId_idempotencyKey_key" ON "ComplianceIncident" ("organizationId", "idempotencyKey");
CREATE INDEX "ComplianceIncident_organizationId_lifecycle_idx" ON "ComplianceIncident" ("organizationId", "lifecycle");
CREATE INDEX "ComplianceIncident_organizationId_updatedAt_idx" ON "ComplianceIncident" ("organizationId", "updatedAt");
CREATE INDEX "ComplianceIncident_correlationId_idx" ON "ComplianceIncident" ("correlationId");
CREATE UNIQUE INDEX "ComplianceIncidentEvent_complianceIncidentId_sequence_key" ON "ComplianceIncidentEvent" ("complianceIncidentId", "sequence");
CREATE INDEX "ComplianceIncidentEvent_organizationId_complianceIncidentId_idx" ON "ComplianceIncidentEvent" ("organizationId", "complianceIncidentId");
CREATE INDEX "ComplianceIncidentEvent_complianceIncidentId_createdAt_idx" ON "ComplianceIncidentEvent" ("complianceIncidentId", "createdAt");

-- Composite-FK target (id is already unique, so this always succeeds).
CREATE UNIQUE INDEX "DataTransfer_id_org_key" ON "DataTransfer" ("id", "organizationId");

-- AddForeignKey: authoritative organization ownership (evidence → RESTRICT).
ALTER TABLE "ComplianceIncident" ADD CONSTRAINT "ComplianceIncident_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Timeline → incident (Prisma relation FK). CASCADE so a purged incident takes its
-- append-only timeline with it (no orphan events); individual events stay immutable
-- via the append-only trigger below.
ALTER TABLE "ComplianceIncidentEvent" ADD CONSTRAINT "ComplianceIncidentEvent_complianceIncidentId_fkey"
  FOREIGN KEY ("complianceIncidentId") REFERENCES "ComplianceIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant-safe governed-record references: a valid id owned by ANOTHER organization can
-- never be linked (the tuple would not exist in the target's (id, organizationId) key).
ALTER TABLE "ComplianceIncident" ADD CONSTRAINT "ComplianceIncident_processing_activity_tuple_fkey"
  FOREIGN KEY ("processingActivityId", "organizationId")
  REFERENCES "ProcessingActivity" ("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplianceIncident" ADD CONSTRAINT "ComplianceIncident_subprocessor_tuple_fkey"
  FOREIGN KEY ("subprocessorId", "organizationId")
  REFERENCES "Subprocessor" ("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplianceIncident" ADD CONSTRAINT "ComplianceIncident_data_transfer_tuple_fkey"
  FOREIGN KEY ("dataTransferId", "organizationId")
  REFERENCES "DataTransfer" ("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Closed vocabularies (fail-closed) ─────────────────────────────────────────
ALTER TABLE "ComplianceIncident" ADD CONSTRAINT "ComplianceIncident_type_check"
  CHECK ("incidentType" IN ('PRIVACY','SECURITY','DATA_BREACH_ASSESSMENT','PROCESSING_NONCONFORMITY',
    'RETENTION_FAILURE','LEGAL_HOLD_FAILURE','EXPORT_FAILURE','ERASURE_FAILURE','PROVIDER_POLICY_FAILURE',
    'TRANSFER_GOVERNANCE_FAILURE','LEGAL_DOCUMENT_FAILURE','REVIEW_REQUIRED'));
ALTER TABLE "ComplianceIncident" ADD CONSTRAINT "ComplianceIncident_severity_check"
  CHECK ("severity" IN ('REVIEW_REQUIRED','LOW','MEDIUM','HIGH','CRITICAL'));
ALTER TABLE "ComplianceIncident" ADD CONSTRAINT "ComplianceIncident_lifecycle_check"
  CHECK ("lifecycle" IN ('OPEN','TRIAGED','INVESTIGATING','CONTAINED','REMEDIATING','MONITORING','RESOLVED','CLOSED','CANCELLED'));
ALTER TABLE "ComplianceIncident" ADD CONSTRAINT "ComplianceIncident_assessment_check"
  CHECK ("assessmentStatus" IN ('REVIEW_REQUIRED','IN_ASSESSMENT','INSUFFICIENT_EVIDENCE','LEGAL_REVIEW_REQUIRED',
    'NO_EXTERNAL_NOTIFICATION_DECISION','EXTERNAL_NOTIFICATION_REVIEW_REQUIRED','DECISION_RECORDED'));
ALTER TABLE "ComplianceIncident" ADD CONSTRAINT "ComplianceIncident_source_check"
  CHECK ("sourceClass" IN ('MANUAL','OBSERVABILITY','GOVERNED_WORKFLOW','EXTERNAL_REPORT','REVIEW_REQUIRED'));
ALTER TABLE "ComplianceIncident" ADD CONSTRAINT "ComplianceIncident_openblocker_check"
  CHECK ("openBlockerCount" >= 0);

-- ── Attribution CHECKs (approved-evidence states carry their attribution) ─────
ALTER TABLE "ComplianceIncident" ADD CONSTRAINT "ComplianceIncident_resolved_check"
  CHECK ("lifecycle" NOT IN ('RESOLVED','CLOSED') OR ("resolvedBy" IS NOT NULL AND "resolvedAt" IS NOT NULL));
ALTER TABLE "ComplianceIncident" ADD CONSTRAINT "ComplianceIncident_closed_check"
  CHECK ("lifecycle" <> 'CLOSED' OR ("closedBy" IS NOT NULL AND "closedAt" IS NOT NULL));
ALTER TABLE "ComplianceIncident" ADD CONSTRAINT "ComplianceIncident_decision_check"
  CHECK ("assessmentStatus" NOT IN ('NO_EXTERNAL_NOTIFICATION_DECISION','DECISION_RECORDED')
    OR ("decisionBy" IS NOT NULL AND "decisionAt" IS NOT NULL));

-- ── Timeline closed vocabulary + evidence-hash format + sequence ──────────────
ALTER TABLE "ComplianceIncidentEvent" ADD CONSTRAINT "ComplianceIncidentEvent_code_check"
  CHECK ("eventCode" IN ('CREATED','UPDATED','LIFECYCLE_TRANSITIONED','ASSESSMENT_TRANSITIONED','DECISION_RECORDED',
    'OWNERSHIP_ASSIGNED','BLOCKER_RAISED','BLOCKER_CLEARED','EVIDENCE_ATTACHED','REOPENED'));
ALTER TABLE "ComplianceIncidentEvent" ADD CONSTRAINT "ComplianceIncidentEvent_sequence_check"
  CHECK ("sequence" >= 1);
ALTER TABLE "ComplianceIncidentEvent" ADD CONSTRAINT "ComplianceIncidentEvent_evidence_hash_check"
  CHECK ("evidenceHash" IS NULL OR "evidenceHash" ~ '^[a-f0-9]{64}$');

-- ── Append-only enforcement: a recorded timeline event is immutable ───────────
CREATE OR REPLACE FUNCTION compliance_incident_event_append_only()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ComplianceIncidentEvent is append-only; % is not permitted', TG_OP;
END $$;

CREATE TRIGGER compliance_incident_event_no_update
  BEFORE UPDATE ON "ComplianceIncidentEvent"
  FOR EACH ROW EXECUTE FUNCTION compliance_incident_event_append_only();
