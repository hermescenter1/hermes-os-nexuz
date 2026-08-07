-- Phase 97 — compliance-incident evidence & closure integrity.
--
-- ADDITIVE / STRENGTHENING ONLY. Migrations 20260820000000..14 are untouched. No
-- DROP TABLE / DROP COLUMN / TRUNCATE / DELETE FROM; no evidence fabrication, no
-- automatic ownership/decision/blocker resolution, no silent data repair. Fail-closed
-- classification-count-only preflights abort (with counts + closed labels ONLY, never
-- row content) if any pre-existing row would violate a new constraint.
--
-- This migration makes the incident timeline durable tenant-bound evidence, binds
-- incident ownership to authoritative organization membership, versions decision
-- evidence, and replaces the anonymous blocker counter with an authoritative
-- ComplianceIncidentAction child.

-- ── 1. Additive columns ───────────────────────────────────────────────────────
ALTER TABLE "ComplianceIncident" ADD COLUMN "decisionEvidenceHash" TEXT;
ALTER TABLE "ComplianceIncident" ADD COLUMN "decisionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ComplianceIncident" ADD COLUMN "decisionAssessmentStatus" TEXT;

ALTER TABLE "ComplianceIncidentEvent" ADD COLUMN "actorClass" TEXT NOT NULL DEFAULT 'ORGANIZATION_MEMBER';
ALTER TABLE "ComplianceIncidentEvent" ADD COLUMN "actionId" TEXT;
ALTER TABLE "ComplianceIncidentEvent" ADD COLUMN "decisionVersion" INTEGER;
ALTER TABLE "ComplianceIncidentEvent" ADD COLUMN "decisionOutcome" TEXT;

-- ── 2. Authoritative incident-action child ────────────────────────────────────
CREATE TABLE "ComplianceIncidentAction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "complianceIncidentId" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "actionCode" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionEvidenceHash" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceIncidentAction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ComplianceIncidentAction_organizationId_idx" ON "ComplianceIncidentAction" ("organizationId");
CREATE INDEX "ComplianceIncidentAction_complianceIncidentId_idx" ON "ComplianceIncidentAction" ("complianceIncidentId");
CREATE INDEX "ComplianceIncidentAction_organizationId_complianceIncidentId_status_idx" ON "ComplianceIncidentAction" ("organizationId", "complianceIncidentId", "status");
CREATE INDEX "ComplianceIncidentAction_status_idx" ON "ComplianceIncidentAction" ("status");
CREATE INDEX "ComplianceIncidentAction_priority_idx" ON "ComplianceIncidentAction" ("priority");
CREATE INDEX "ComplianceIncidentAction_createdAt_idx" ON "ComplianceIncidentAction" ("createdAt");

-- ── 3. Fail-closed preflight (classification COUNTS only — no row content) ─────
DO $$
DECLARE
  n_null_actor bigint; n_org_mismatch bigint; n_decision_incomplete bigint;
  n_owner_binding bigint; n_assignee_binding bigint; n_resolved_invalid bigint;
  n_hold_binding bigint; n_blocker_cache bigint; n_stale_hash bigint;
BEGIN
  SELECT count(*) INTO n_null_actor FROM "ComplianceIncidentEvent" WHERE "actorId" IS NULL;
  SELECT count(*) INTO n_org_mismatch FROM "ComplianceIncidentEvent" e
    WHERE NOT EXISTS (SELECT 1 FROM "ComplianceIncident" i WHERE i."id" = e."complianceIncidentId" AND i."organizationId" = e."organizationId");
  SELECT count(*) INTO n_decision_incomplete FROM "ComplianceIncident"
    WHERE "assessmentStatus" IN ('NO_EXTERNAL_NOTIFICATION_DECISION','EXTERNAL_NOTIFICATION_REVIEW_REQUIRED','DECISION_RECORDED')
      AND ("decisionBy" IS NULL OR "decisionAt" IS NULL OR "decisionEvidenceHash" IS NULL
        OR "decisionEvidenceHash" !~ '^[a-f0-9]{64}$' OR "decisionVersion" <= 0);
  SELECT count(*) INTO n_owner_binding FROM "ComplianceIncident" i WHERE i."ownerId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "OrganizationMember" m WHERE m."userId" = i."ownerId" AND m."organizationId" = i."organizationId");
  SELECT count(*) INTO n_assignee_binding FROM "ComplianceIncident" i WHERE i."assignedToId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "OrganizationMember" m WHERE m."userId" = i."assignedToId" AND m."organizationId" = i."organizationId");
  SELECT count(*) INTO n_resolved_invalid FROM "ComplianceIncident" WHERE "lifecycle" IN ('RESOLVED','CLOSED')
    AND ("assessmentStatus" NOT IN ('DECISION_RECORDED','NO_EXTERNAL_NOTIFICATION_DECISION')
      OR "decisionEvidenceHash" IS NULL OR "decisionEvidenceHash" !~ '^[a-f0-9]{64}$' OR "decisionVersion" <= 0);
  SELECT count(*) INTO n_hold_binding FROM "LegalHold" h WHERE h."incidentId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "ComplianceIncident" i WHERE i."id" = h."incidentId" AND i."organizationId" = h."organizationId");
  SELECT count(*) INTO n_blocker_cache FROM "ComplianceIncident" i
    WHERE i."openBlockerCount" <> (SELECT count(*) FROM "ComplianceIncidentAction" a
      WHERE a."complianceIncidentId" = i."id" AND a."organizationId" = i."organizationId" AND a."status" = 'OPEN');
  SELECT count(*) INTO n_stale_hash FROM "ComplianceIncident"
    WHERE "assessmentStatus" NOT IN ('NO_EXTERNAL_NOTIFICATION_DECISION','EXTERNAL_NOTIFICATION_REVIEW_REQUIRED','DECISION_RECORDED')
      AND "decisionEvidenceHash" IS NOT NULL;

  IF (n_null_actor + n_org_mismatch + n_decision_incomplete + n_owner_binding + n_assignee_binding
      + n_resolved_invalid + n_hold_binding + n_blocker_cache + n_stale_hash) > 0 THEN
    RAISE EXCEPTION 'Phase97 incident evidence-integrity preflight failed (no row repaired; resolve before applying): incident_events_with_null_actor=% incident_events_with_parent_org_mismatch=% decision_states_without_complete_evidence=% incident_owners_without_valid_membership_binding=% incident_assignees_without_valid_membership_binding=% resolved_or_closed_incidents_with_invalid_decision=% incident_scoped_holds_with_invalid_parent_binding=% blocker_count_without_authoritative_actions=% non_decision_states_with_evidence_hash=%',
      n_null_actor, n_org_mismatch, n_decision_incomplete, n_owner_binding, n_assignee_binding,
      n_resolved_invalid, n_hold_binding, n_blocker_cache, n_stale_hash;
  END IF;
END $$;

-- ── 4. Mandatory actor attribution ────────────────────────────────────────────
ALTER TABLE "ComplianceIncidentEvent" ALTER COLUMN "actorId" SET NOT NULL;

-- ── 5. Composite-FK targets ───────────────────────────────────────────────────
CREATE UNIQUE INDEX "ComplianceIncident_id_org_key" ON "ComplianceIncident" ("id", "organizationId");
CREATE UNIQUE INDEX "ComplianceIncidentAction_id_org_key" ON "ComplianceIncidentAction" ("id", "organizationId");

-- ── 6. Tenant-bound, non-cascading timeline evidence ─────────────────────────
-- Replace the weak single-column CASCADE parent FK with a tenant-bound RESTRICT
-- composite FK, so an incident with timeline evidence can never be hard-deleted and a
-- timeline row can never bind to a foreign-tenant incident.
ALTER TABLE "ComplianceIncidentEvent" DROP CONSTRAINT "ComplianceIncidentEvent_complianceIncidentId_fkey";
ALTER TABLE "ComplianceIncidentEvent" ADD CONSTRAINT "ComplianceIncidentEvent_incident_tuple_fkey"
  FOREIGN KEY ("complianceIncidentId", "organizationId")
  REFERENCES "ComplianceIncident" ("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplianceIncidentEvent" ADD CONSTRAINT "ComplianceIncidentEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplianceIncidentEvent" ADD CONSTRAINT "ComplianceIncidentEvent_action_tuple_fkey"
  FOREIGN KEY ("actionId", "organizationId")
  REFERENCES "ComplianceIncidentAction" ("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 7. Authoritative action ownership + tenant-bound parent ──────────────────
ALTER TABLE "ComplianceIncidentAction" ADD CONSTRAINT "ComplianceIncidentAction_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplianceIncidentAction" ADD CONSTRAINT "ComplianceIncidentAction_incident_tuple_fkey"
  FOREIGN KEY ("complianceIncidentId", "organizationId")
  REFERENCES "ComplianceIncident" ("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 8. Membership-bound incident ownership ───────────────────────────────────
-- ownerId / assignedToId are userIds; the composite FK to the authoritative
-- OrganizationMember (organizationId, userId) unique key makes a foreign-tenant or
-- non-member owner impossible at the database (enforced only when the owner is set).
ALTER TABLE "ComplianceIncident" ADD CONSTRAINT "ComplianceIncident_owner_membership_fkey"
  FOREIGN KEY ("organizationId", "ownerId")
  REFERENCES "OrganizationMember" ("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplianceIncident" ADD CONSTRAINT "ComplianceIncident_assignee_membership_fkey"
  FOREIGN KEY ("organizationId", "assignedToId")
  REFERENCES "OrganizationMember" ("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 9. Tenant-safe incident-scoped LegalHold binding ─────────────────────────
-- incidentId is non-null only for INCIDENT-scoped holds (other scopes normalise it
-- away), so this composite FK binds an incident hold to a same-org incident.
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_incident_tuple_fkey"
  FOREIGN KEY ("incidentId", "organizationId")
  REFERENCES "ComplianceIncident" ("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 10. Decision evidence integrity (ComplianceIncident) ─────────────────────
ALTER TABLE "ComplianceIncident" ADD CONSTRAINT "ComplianceIncident_decision_evidence_check"
  CHECK ("assessmentStatus" NOT IN ('NO_EXTERNAL_NOTIFICATION_DECISION','EXTERNAL_NOTIFICATION_REVIEW_REQUIRED','DECISION_RECORDED')
    OR ("decisionBy" IS NOT NULL AND "decisionAt" IS NOT NULL
      AND "decisionEvidenceHash" ~ '^[a-f0-9]{64}$' AND "decisionVersion" > 0));
ALTER TABLE "ComplianceIncident" ADD CONSTRAINT "ComplianceIncident_decision_no_stale_check"
  CHECK ("assessmentStatus" IN ('NO_EXTERNAL_NOTIFICATION_DECISION','EXTERNAL_NOTIFICATION_REVIEW_REQUIRED','DECISION_RECORDED')
    OR "decisionEvidenceHash" IS NULL);
ALTER TABLE "ComplianceIncident" ADD CONSTRAINT "ComplianceIncident_decision_version_check"
  CHECK ("decisionVersion" >= 0);
ALTER TABLE "ComplianceIncident" ADD CONSTRAINT "ComplianceIncident_closure_decision_check"
  CHECK ("lifecycle" NOT IN ('RESOLVED','CLOSED')
    OR ("assessmentStatus" IN ('DECISION_RECORDED','NO_EXTERNAL_NOTIFICATION_DECISION')
      AND "decisionEvidenceHash" ~ '^[a-f0-9]{64}$' AND "decisionVersion" > 0));

-- ── 11. Timeline closed vocabularies + consistency ───────────────────────────
ALTER TABLE "ComplianceIncidentEvent" ADD CONSTRAINT "ComplianceIncidentEvent_actor_class_check"
  CHECK ("actorClass" IN ('PLATFORM','ORGANIZATION_MEMBER'));
ALTER TABLE "ComplianceIncidentEvent" DROP CONSTRAINT "ComplianceIncidentEvent_code_check";
ALTER TABLE "ComplianceIncidentEvent" ADD CONSTRAINT "ComplianceIncidentEvent_code_check"
  CHECK ("eventCode" IN ('CREATED','UPDATED','LIFECYCLE_TRANSITIONED','ASSESSMENT_TRANSITIONED','DECISION_RECORDED',
    'OWNERSHIP_ASSIGNED','BLOCKER_RAISED','BLOCKER_CLEARED','EVIDENCE_ATTACHED','REOPENED',
    'ACTION_CREATED','ACTION_RESOLVED','ACTION_CANCELLED'));
ALTER TABLE "ComplianceIncidentEvent" ADD CONSTRAINT "ComplianceIncidentEvent_from_lifecycle_check"
  CHECK ("fromLifecycle" IS NULL OR "fromLifecycle" IN ('OPEN','TRIAGED','INVESTIGATING','CONTAINED','REMEDIATING','MONITORING','RESOLVED','CLOSED','CANCELLED'));
ALTER TABLE "ComplianceIncidentEvent" ADD CONSTRAINT "ComplianceIncidentEvent_to_lifecycle_check"
  CHECK ("toLifecycle" IS NULL OR "toLifecycle" IN ('OPEN','TRIAGED','INVESTIGATING','CONTAINED','REMEDIATING','MONITORING','RESOLVED','CLOSED','CANCELLED'));
ALTER TABLE "ComplianceIncidentEvent" ADD CONSTRAINT "ComplianceIncidentEvent_from_assessment_check"
  CHECK ("fromAssessment" IS NULL OR "fromAssessment" IN ('REVIEW_REQUIRED','IN_ASSESSMENT','INSUFFICIENT_EVIDENCE','LEGAL_REVIEW_REQUIRED','NO_EXTERNAL_NOTIFICATION_DECISION','EXTERNAL_NOTIFICATION_REVIEW_REQUIRED','DECISION_RECORDED'));
ALTER TABLE "ComplianceIncidentEvent" ADD CONSTRAINT "ComplianceIncidentEvent_to_assessment_check"
  CHECK ("toAssessment" IS NULL OR "toAssessment" IN ('REVIEW_REQUIRED','IN_ASSESSMENT','INSUFFICIENT_EVIDENCE','LEGAL_REVIEW_REQUIRED','NO_EXTERNAL_NOTIFICATION_DECISION','EXTERNAL_NOTIFICATION_REVIEW_REQUIRED','DECISION_RECORDED'));
ALTER TABLE "ComplianceIncidentEvent" ADD CONSTRAINT "ComplianceIncidentEvent_decision_outcome_check"
  CHECK ("decisionOutcome" IS NULL OR "decisionOutcome" IN ('RECORDED','INVALIDATED'));
-- CREATED carries no prior lifecycle.
ALTER TABLE "ComplianceIncidentEvent" ADD CONSTRAINT "ComplianceIncidentEvent_created_consistency_check"
  CHECK ("eventCode" <> 'CREATED' OR "fromLifecycle" IS NULL);
-- Lifecycle transition events carry both endpoints.
ALTER TABLE "ComplianceIncidentEvent" ADD CONSTRAINT "ComplianceIncidentEvent_lifecycle_consistency_check"
  CHECK ("eventCode" NOT IN ('LIFECYCLE_TRANSITIONED','REOPENED') OR ("fromLifecycle" IS NOT NULL AND "toLifecycle" IS NOT NULL));
-- Assessment transition events carry both endpoints.
ALTER TABLE "ComplianceIncidentEvent" ADD CONSTRAINT "ComplianceIncidentEvent_assessment_consistency_check"
  CHECK ("eventCode" NOT IN ('ASSESSMENT_TRANSITIONED','DECISION_RECORDED') OR ("fromAssessment" IS NOT NULL AND "toAssessment" IS NOT NULL));
-- A recorded decision event carries the bound evidence hash + version + outcome.
ALTER TABLE "ComplianceIncidentEvent" ADD CONSTRAINT "ComplianceIncidentEvent_decision_consistency_check"
  CHECK ("eventCode" <> 'DECISION_RECORDED' OR ("evidenceHash" ~ '^[a-f0-9]{64}$' AND "decisionVersion" > 0 AND "decisionOutcome" = 'RECORDED'));
-- Action events reference the authoritative action.
ALTER TABLE "ComplianceIncidentEvent" ADD CONSTRAINT "ComplianceIncidentEvent_action_consistency_check"
  CHECK ("eventCode" NOT IN ('ACTION_CREATED','ACTION_RESOLVED','ACTION_CANCELLED') OR "actionId" IS NOT NULL);

-- ── 12. Action closed vocabularies + attribution ─────────────────────────────
ALTER TABLE "ComplianceIncidentAction" ADD CONSTRAINT "ComplianceIncidentAction_priority_check"
  CHECK ("priority" IN ('LOW','MEDIUM','HIGH','CRITICAL'));
ALTER TABLE "ComplianceIncidentAction" ADD CONSTRAINT "ComplianceIncidentAction_status_check"
  CHECK ("status" IN ('OPEN','RESOLVED','CANCELLED'));
ALTER TABLE "ComplianceIncidentAction" ADD CONSTRAINT "ComplianceIncidentAction_code_check"
  CHECK ("actionCode" IN ('ASSESSMENT_EVIDENCE_REQUIRED','LEGAL_REVIEW_REQUIRED','CONTAINMENT_REQUIRED','REMEDIATION_REQUIRED',
    'DATA_PRESERVATION_REQUIRED','POLICY_REVIEW_REQUIRED','FOLLOW_UP_REQUIRED','OTHER_REVIEW_REQUIRED'));
ALTER TABLE "ComplianceIncidentAction" ADD CONSTRAINT "ComplianceIncidentAction_terminal_attribution_check"
  CHECK ("status" = 'OPEN' OR ("resolvedBy" IS NOT NULL AND "resolvedAt" IS NOT NULL));
ALTER TABLE "ComplianceIncidentAction" ADD CONSTRAINT "ComplianceIncidentAction_resolution_hash_check"
  CHECK ("resolutionEvidenceHash" IS NULL OR "resolutionEvidenceHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "ComplianceIncidentAction" ADD CONSTRAINT "ComplianceIncidentAction_highprio_evidence_check"
  CHECK (NOT ("status" = 'RESOLVED' AND "priority" IN ('HIGH','CRITICAL')) OR "resolutionEvidenceHash" ~ '^[a-f0-9]{64}$');

-- ── 13. Strengthen append-only enforcement: reject UPDATE **and** DELETE ──────
DROP TRIGGER IF EXISTS "compliance_incident_event_no_update" ON "ComplianceIncidentEvent";
CREATE OR REPLACE FUNCTION compliance_incident_event_append_only()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ComplianceIncidentEvent is append-only; % is not permitted', TG_OP;
END $$;
CREATE TRIGGER compliance_incident_event_no_mutation
  BEFORE UPDATE OR DELETE ON "ComplianceIncidentEvent"
  FOR EACH ROW EXECUTE FUNCTION compliance_incident_event_append_only();
