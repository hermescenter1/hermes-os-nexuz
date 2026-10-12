-- Executive Management Center: the frozen nightly management report.
--
-- PURELY ADDITIVE. One new table, no column added to or removed from any
-- existing table, no constraint on existing data, no backfill. Rolling it back
-- is `DROP TABLE "ExecutiveDailyReport";` and nothing else, because nothing
-- outside this table references it.
--
-- The report is a SNAPSHOT: the numbers are frozen at generation time and never
-- recomputed on read, so a report opened months later still says what it said
-- on the night it ran.

CREATE TABLE "ExecutiveDailyReport" (
    "id"                 TEXT NOT NULL,
    "organizationId"     TEXT NOT NULL,

    -- The business day covered, as YYYY-MM-DD read in "timeZone". Deliberately
    -- a label, not an instant: a day belongs to a zone, and storing it as a
    -- timestamp is how an off-by-one day enters a report permanently.
    "businessDate"       VARCHAR(10) NOT NULL,
    -- 1 for the night's own report. A correction is a NEW row at version + 1.
    "version"            INTEGER NOT NULL DEFAULT 1,

    -- Frozen alongside the numbers so a later change to the product's reporting
    -- zone cannot silently reinterpret which hours this report covered.
    "timeZone"           VARCHAR(64) NOT NULL,
    "dayCutoffMinutes"   INTEGER NOT NULL DEFAULT 0,

    -- The covered window as real instants: inclusive start, exclusive end. On a
    -- DST day these are 23 or 25 hours apart, not 24.
    "periodStart"        TIMESTAMPTZ(6) NOT NULL,
    "periodEnd"          TIMESTAMPTZ(6) NOT NULL,

    "generatedAt"        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- The newest moment the data reflects. Differs from generatedAt whenever a
    -- source lags; the UI shows the older of the two.
    "dataCutoffAt"       TIMESTAMPTZ(6) NOT NULL,

    -- Two reports with different calculation versions were produced by
    -- different code and are not directly comparable.
    "calcVersion"        VARCHAR(32) NOT NULL,

    "snapshot"           JSONB NOT NULL,
    -- Which sections answered and which did not, each with its reason, so a gap
    -- in the report is attributable rather than invisible.
    "sourceCoverage"     JSONB NOT NULL,

    -- Claimed exactly once by whichever replica wins the conditional update, so
    -- a retried or concurrent run cannot notify twice.
    "notifiedAt"         TIMESTAMPTZ(6),

    -- Set only on a correction.
    "supersedesVersion"  INTEGER,
    "regeneratedBy"      TEXT,
    "regenerationReason" TEXT,

    CONSTRAINT "ExecutiveDailyReport_pkey" PRIMARY KEY ("id")
);

-- THE IDEMPOTENCY MECHANISM. A second run for the same night cannot insert a
-- second version-1 row: it loses here, and the generator treats that loss as
-- "already reported", not as an error.
CREATE UNIQUE INDEX "ExecutiveDailyReport_organizationId_businessDate_version_key"
    ON "ExecutiveDailyReport" ("organizationId", "businessDate", "version");

-- Archive listing for one tenant, newest night first.
CREATE INDEX "ExecutiveDailyReport_organizationId_businessDate_idx"
    ON "ExecutiveDailyReport" ("organizationId", "businessDate");

-- The notification sweep looks for rows that have not been announced yet.
CREATE INDEX "ExecutiveDailyReport_notifiedAt_idx"
    ON "ExecutiveDailyReport" ("notifiedAt");

-- CASCADE matches every other tenant-owned table here: deleting an organization
-- removes its reports. The reports describe only that organization, so there is
-- nothing to preserve once it is gone.
ALTER TABLE "ExecutiveDailyReport"
    ADD CONSTRAINT "ExecutiveDailyReport_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
