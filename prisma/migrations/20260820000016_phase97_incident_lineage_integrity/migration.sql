-- Phase 97 — compliance-incident lineage integrity.
--
-- ADDITIVE / STRENGTHENING ONLY. Migrations 20260820000000..15 are untouched. No
-- DROP TABLE / DROP COLUMN / TRUNCATE / DELETE / auto-repair / evidence fabrication;
-- only the specific weak FK/constraint being strengthened is dropped and replaced. A
-- fail-closed classification-count-only preflight aborts (counts + closed labels only,
-- never row content) if any pre-existing row would violate a new constraint.
--
-- This migration binds an ACTION timeline event to an action of the SAME incident,
-- binds every timeline actor + every action creator to an authoritative same-org
-- OrganizationMember, and fails the actorClass vocabulary closed to the only currently
-- implemented + enforced class (ORGANIZATION_MEMBER).

-- ── 1. Fail-closed preflight (classification COUNTS only) ─────────────────────
DO $$
DECLARE
  n_cross_incident bigint; n_actor_no_member bigint; n_action_no_creator bigint;
  n_creator_no_member bigint; n_bad_actor_class bigint;
BEGIN
  SELECT count(*) INTO n_cross_incident FROM "ComplianceIncidentEvent" e
    WHERE e."actionId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "ComplianceIncidentAction" a
        WHERE a."id" = e."actionId" AND a."organizationId" = e."organizationId" AND a."complianceIncidentId" = e."complianceIncidentId");
  SELECT count(*) INTO n_actor_no_member FROM "ComplianceIncidentEvent" e
    WHERE NOT EXISTS (SELECT 1 FROM "OrganizationMember" m WHERE m."userId" = e."actorId" AND m."organizationId" = e."organizationId");
  SELECT count(*) INTO n_action_no_creator FROM "ComplianceIncidentAction" WHERE "createdBy" IS NULL OR "updatedBy" IS NULL;
  SELECT count(*) INTO n_creator_no_member FROM "ComplianceIncidentAction" a
    WHERE (a."createdBy" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "OrganizationMember" m WHERE m."userId" = a."createdBy" AND m."organizationId" = a."organizationId"))
       OR (a."updatedBy" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "OrganizationMember" m WHERE m."userId" = a."updatedBy" AND m."organizationId" = a."organizationId"));
  SELECT count(*) INTO n_bad_actor_class FROM "ComplianceIncidentEvent" WHERE "actorClass" <> 'ORGANIZATION_MEMBER';

  IF (n_cross_incident + n_actor_no_member + n_action_no_creator + n_creator_no_member + n_bad_actor_class) > 0 THEN
    RAISE EXCEPTION 'Phase97 incident lineage-integrity preflight failed (no row repaired; resolve before applying): action_events_cross_incident=% timeline_actors_without_membership=% actions_without_creator=% action_creators_without_membership=% events_with_non_member_actor_class=%',
      n_cross_incident, n_actor_no_member, n_action_no_creator, n_creator_no_member, n_bad_actor_class;
  END IF;
END $$;

-- ── 2. Same-incident action-event binding ────────────────────────────────────
-- Composite-FK target: an action is unique within (id, organizationId, incident).
CREATE UNIQUE INDEX "ComplianceIncidentAction_id_org_incident_key" ON "ComplianceIncidentAction" ("id", "organizationId", "complianceIncidentId");

-- Replace the weak (actionId, org) FK with a 3-column FK so an ACTION event can only
-- reference an action of its OWN incident (CROSS_INCIDENT_ACTION_EVENT=0,
-- FOREIGN_TENANT_ACTION_EVENT=0, ACTION_EVENT_WITHOUT_AUTHORITATIVE_ACTION=0).
ALTER TABLE "ComplianceIncidentEvent" DROP CONSTRAINT "ComplianceIncidentEvent_action_tuple_fkey";
ALTER TABLE "ComplianceIncidentEvent" ADD CONSTRAINT "ComplianceIncidentEvent_action_incident_tuple_fkey"
  FOREIGN KEY ("actionId", "organizationId", "complianceIncidentId")
  REFERENCES "ComplianceIncidentAction" ("id", "organizationId", "complianceIncidentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 3. Authoritative timeline actor provenance ───────────────────────────────
-- Every event actor is an actual same-org member (ARBITRARY_TIMELINE_ACTOR=0,
-- FOREIGN_TENANT_TIMELINE_ACTOR=0). No unenforced PLATFORM class is retained.
ALTER TABLE "ComplianceIncidentEvent" ADD CONSTRAINT "ComplianceIncidentEvent_actor_membership_fkey"
  FOREIGN KEY ("organizationId", "actorId")
  REFERENCES "OrganizationMember" ("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplianceIncidentEvent" DROP CONSTRAINT "ComplianceIncidentEvent_actor_class_check";
ALTER TABLE "ComplianceIncidentEvent" ADD CONSTRAINT "ComplianceIncidentEvent_actor_class_check"
  CHECK ("actorClass" = 'ORGANIZATION_MEMBER');

-- ── 4. Authoritative action creator/updater ──────────────────────────────────
ALTER TABLE "ComplianceIncidentAction" ALTER COLUMN "createdBy" SET NOT NULL;  -- INCIDENT_ACTION_WITHOUT_CREATOR=0
ALTER TABLE "ComplianceIncidentAction" ALTER COLUMN "updatedBy" SET NOT NULL;
ALTER TABLE "ComplianceIncidentAction" ADD CONSTRAINT "ComplianceIncidentAction_createdBy_membership_fkey"
  FOREIGN KEY ("organizationId", "createdBy")
  REFERENCES "OrganizationMember" ("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplianceIncidentAction" ADD CONSTRAINT "ComplianceIncidentAction_updatedBy_membership_fkey"
  FOREIGN KEY ("organizationId", "updatedBy")
  REFERENCES "OrganizationMember" ("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
