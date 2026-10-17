-- EXECUTIVE DASHBOARD row 10 — the delivery ledger.
--
-- WHAT IT RECORDS. One row per (organization, business day, report version,
-- recipient), written at the moment the recipient is told, carrying the role
-- and status they held AT THAT MOMENT and the rule that admitted them.
--
-- WHY. `OrganizationMember` overwrites role and status in place and keeps no
-- history; `Notification` records neither, and carries no organization. So
-- "was this recipient entitled to be told, when they were told?" could only
-- be inferred from today's membership plus the code that filtered it. This
-- table turns that inference into a record.
--
-- NOTHING IS BACKFILLED BY THIS MIGRATION. It creates an empty table. Rows
-- exist only for deliveries made after it ships, and the absence of a row for
-- an older report means "not recorded" — never "nobody was told".
-- Reconstructing the past from present membership is precisely the
-- fabrication this table exists to replace.
--
-- SAFETY. One new table, one new trigger function, one trigger. No existing
-- table is altered, no column is added to one, no row is rewritten and no
-- backfill runs. Rollback is DROP TABLE plus DROP FUNCTION, and loses only
-- data this release introduced.
--
-- DA-2: the lock wait is bounded before any DDL runs. CREATE TABLE takes
-- locks only on new objects, but the rule is unconditional on purpose — a
-- migration that argues itself an exception is how the rule erodes.

SET lock_timeout = '5s';

CREATE TABLE "ExecutiveReportDelivery" (
    "id"             TEXT        NOT NULL,
    "organizationId" TEXT        NOT NULL,

    -- The reported business day, stored exactly as ExecutiveDailyReport
    -- stores it: a label in a zone, never an instant.
    "businessDate"   VARCHAR(10) NOT NULL,
    -- Which version of that night's report this delivery announced.
    "reportVersion"  INTEGER     NOT NULL,
    -- The recipient. Deliberately NOT a foreign key to "User": deleting a
    -- user must not erase the record that they were told.
    "userId"         TEXT        NOT NULL,

    -- The authority the send was made under, frozen as TEXT rather than as
    -- the OrgRole / MemberStatus enum types. An enum can gain or lose a
    -- member in a later release; a record of what was true must not change
    -- meaning, or become unreadable, because a later migration edited a type.
    "roleAtSend"     VARCHAR(32) NOT NULL,
    "statusAtSend"   VARCHAR(32) NOT NULL,
    -- The rule applied, and the exact allowlist it used, sorted. Frozen so a
    -- later widening of the notified roles cannot be read backwards onto a
    -- delivery decided under the narrower rule.
    "rulesVersion"   VARCHAR(32) NOT NULL,
    "allowedRoles"   VARCHAR(128) NOT NULL,

    -- The Notification row created for this delivery, when one was. Not a
    -- foreign key: a recipient may delete their notification, and that must
    -- not remove the evidence that it was sent.
    "notificationId" TEXT,
    "deliveredAt"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutiveReportDelivery_pkey" PRIMARY KEY ("id")
);

-- The idempotency mechanism AND the no-duplicate guarantee in one constraint:
-- a second attempt for the same recipient, report and version loses here,
-- rather than producing a second notification.
CREATE UNIQUE INDEX "ExecutiveReportDelivery_org_date_version_user_key"
    ON "ExecutiveReportDelivery" ("organizationId", "businessDate", "reportVersion", "userId");

CREATE INDEX "ExecutiveReportDelivery_organizationId_businessDate_idx"
    ON "ExecutiveReportDelivery" ("organizationId", "businessDate");

CREATE INDEX "ExecutiveReportDelivery_deliveredAt_idx"
    ON "ExecutiveReportDelivery" ("deliveredAt");

-- NO FOREIGN KEY, deliberately, following "AuditLog": an audit trail a
-- cascade can delete is not a trail. `organizationId` is a plain column, so
-- the record outlives the organization it describes — and the append-only
-- trigger below is never asked to refuse a cascade it could not tell apart
-- from tampering.

-- Shape checks, so a row that could not be true cannot be written.
ALTER TABLE "ExecutiveReportDelivery"
    ADD CONSTRAINT "ExecutiveReportDelivery_businessDate_check"
    CHECK ("businessDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
ALTER TABLE "ExecutiveReportDelivery"
    ADD CONSTRAINT "ExecutiveReportDelivery_reportVersion_check"
    CHECK ("reportVersion" >= 1);
ALTER TABLE "ExecutiveReportDelivery"
    ADD CONSTRAINT "ExecutiveReportDelivery_authority_present_check"
    CHECK (length("roleAtSend") > 0 AND length("statusAtSend") > 0
           AND length("rulesVersion") > 0 AND length("allowedRoles") > 0);

-- ── Append-only, enforced by the database ───────────────────────────────────
-- An audit record the application can edit is not an audit record. The same
-- pattern the compliance incident trail uses (Phase 97): the trigger refuses
-- UPDATE and DELETE outright, so a correction has to be a new report version
-- with its own deliveries rather than a rewritten history.
--
-- Because there is no foreign key, this trigger never has to decide whether
-- a DELETE came from a cascade or from a hand at a psql prompt. Every DELETE
-- is refused, and so is every UPDATE.
CREATE OR REPLACE FUNCTION executive_report_delivery_append_only()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ExecutiveReportDelivery is append-only; % is not permitted', TG_OP;
END $$;

CREATE TRIGGER executive_report_delivery_no_mutation
  BEFORE UPDATE OR DELETE ON "ExecutiveReportDelivery"
  FOR EACH ROW EXECUTE FUNCTION executive_report_delivery_append_only();
