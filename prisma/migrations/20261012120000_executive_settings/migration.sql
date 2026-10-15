-- Executive Management Center slice E: one organization's reporting settings.
--
-- PURELY ADDITIVE. One new table keyed by the organization, no column added to
-- or removed from any existing table, no backfill. An organization with no row
-- keeps using the product defaults exactly as before, so applying this
-- migration changes no figure anywhere. Rolling it back is
-- `DROP TABLE "ExecutiveSettings";` and nothing else.
--
-- The bounds below repeat the application's validation on purpose: a row
-- written around the application (a console, a script, a future endpoint) must
-- still not be able to move the business-day boundary somewhere nonsensical or
-- disable a priority rule by inverting its thresholds.

CREATE TABLE "ExecutiveSettings" (
    "organizationId"       TEXT           NOT NULL,
    -- IANA zone name. Its validity against the tz database is checked by the
    -- application, which also refuses to USE a stored zone the runtime does not
    -- know and falls back to the default with a visible warning.
    "timeZone"             VARCHAR(64)    NOT NULL,
    "dayCutoffMinutes"     INTEGER        NOT NULL DEFAULT 0,
    "approvalStaleDays"    INTEGER        NOT NULL DEFAULT 3,
    "approvalCriticalDays" INTEGER        NOT NULL DEFAULT 7,
    "alertAgeHours"        INTEGER        NOT NULL DEFAULT 4,
    "priorityMaxItems"     INTEGER        NOT NULL DEFAULT 25,
    -- Optimistic-concurrency token: a write names the version it read.
    "version"              INTEGER        NOT NULL DEFAULT 1,
    "updatedAt"            TIMESTAMPTZ(6) NOT NULL,
    "updatedBy"            TEXT,

    CONSTRAINT "ExecutiveSettings_pkey" PRIMARY KEY ("organizationId"),

    CONSTRAINT "ExecutiveSettings_timeZone_nonempty"
        CHECK (length(btrim("timeZone")) > 0),
    CONSTRAINT "ExecutiveSettings_dayCutoffMinutes_range"
        CHECK ("dayCutoffMinutes" >= 0 AND "dayCutoffMinutes" < 1440),
    CONSTRAINT "ExecutiveSettings_approvalStaleDays_range"
        CHECK ("approvalStaleDays" BETWEEN 1 AND 60),
    CONSTRAINT "ExecutiveSettings_approvalCriticalDays_range"
        CHECK ("approvalCriticalDays" BETWEEN 1 AND 120),
    -- "Critically late" must come strictly after "late", or the tier-2
    -- approval rule could never fire.
    CONSTRAINT "ExecutiveSettings_approval_thresholds_ordered"
        CHECK ("approvalCriticalDays" > "approvalStaleDays"),
    CONSTRAINT "ExecutiveSettings_alertAgeHours_range"
        CHECK ("alertAgeHours" BETWEEN 0 AND 168),
    CONSTRAINT "ExecutiveSettings_priorityMaxItems_range"
        CHECK ("priorityMaxItems" BETWEEN 5 AND 100),
    CONSTRAINT "ExecutiveSettings_version_positive"
        CHECK ("version" >= 1)
);

-- CASCADE matches every other tenant-owned table here: the settings describe
-- only this organization and mean nothing once it is gone.
ALTER TABLE "ExecutiveSettings"
    ADD CONSTRAINT "ExecutiveSettings_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
