-- ============================================================================
-- Row 10 — DIAGNOSTIC. Why did the authorization query return nothing?
--
-- On 2026-10-16 the production run of ROW10-RECIPIENT-AUTHORIZATION-QUERY.sql
-- returned zero in every section, while the worker's own log for
-- businessDate=2026-10-14 reported created=1, notified=1, undelivered=0.
-- Those two statements cannot both describe the same database, so one of the
-- query's assumptions is wrong. This file finds out which, and asserts
-- nothing.
--
-- It is deliberately INDEPENDENT of both parameters the original query takes:
-- it never filters by organization and never filters by business date. If the
-- rows exist, they appear here whatever the parameters were.
--
-- Read-only. SELECTs only. No PII: no name, e-mail or telephone, no raw
-- organization or user id, and from the notification metadata only the KEY
-- NAMES, never their values.
--
-- Run with the same hardening as the query it is diagnosing:
--   PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=60s -c lock_timeout=5s"
--   psql -X -v ON_ERROR_STOP=1
-- ============================================================================

\pset pager off
\timing off

-- ── A · the most likely cause, checked first ────────────────────────────────
-- The authorization query is parameterised with `\set business_date`. If the
-- file reached psql with CRLF line endings — which is what a checkout on
-- Windows produces — the variable carries a trailing carriage return, and
-- `"businessDate" = '2026-10-14' || CHR(13)` matches nothing, in every
-- section, silently.
--
-- EXPECTED: value_length = 10. Anything else is the answer.
\set business_date '2026-10-14'
SELECT
  :'business_date'                       AS value_as_psql_sees_it,
  length(:'business_date')               AS value_length,
  (length(:'business_date') = 10)        AS length_is_sane,
  (:'business_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') AS matches_a_plain_date,
  encode(convert_to(:'business_date', 'UTF8'), 'hex') AS value_bytes_hex;

-- ── B · do nightly reports exist at all ─────────────────────────────────────
-- No date filter, no organization filter.
SELECT
  count(*)                 AS reports_all_time,
  count(DISTINCT "organizationId") AS organizations,
  min("businessDate")      AS earliest_business_date,
  max("businessDate")      AS latest_business_date,
  count(*) FILTER (WHERE "notifiedAt" IS NOT NULL) AS announced
FROM "ExecutiveDailyReport";

-- ── C · the five most recent nights, as stored ──────────────────────────────
-- `businessDate` is VARCHAR(10), compared as text — so what matters is the
-- exact stored bytes. length() is shown for the same reason as section A.
SELECT
  substr(md5("organizationId"), 1, 12) AS org_hash,
  "businessDate",
  length("businessDate")               AS business_date_length,
  version,
  "calcVersion",
  "timeZone",
  "generatedAt",
  "notifiedAt",
  ("prioritySnapshot" IS NOT NULL)     AS has_priority_snapshot
FROM "ExecutiveDailyReport"
ORDER BY "businessDate" DESC, version DESC
LIMIT 5;

-- ── D · notifications the worker writes, by kind ────────────────────────────
-- There is NO foreign key from Notification to ExecutiveDailyReport: the only
-- link is the `businessDate` the worker puts in the notification's metadata.
-- That is itself worth seeing, because it is the join the original query
-- depends on.
SELECT
  metadata ->> 'kind'              AS metadata_kind,
  type                             AS notification_type,
  count(*)                         AS notifications,
  count(DISTINCT "userId")         AS distinct_recipients,
  min("createdAt")                 AS earliest,
  max("createdAt")                 AS latest
FROM "Notification"
WHERE metadata ? 'kind'
GROUP BY 1, 2
ORDER BY notifications DESC
LIMIT 10;

-- ── E · the executive notifications, by business date ───────────────────────
SELECT
  metadata ->> 'businessDate'      AS metadata_business_date,
  length(metadata ->> 'businessDate') AS value_length,
  count(*)                         AS notifications,
  count(DISTINCT "userId")         AS distinct_recipients
FROM "Notification"
WHERE metadata ->> 'kind' = 'executive.report'
GROUP BY 1, 2
ORDER BY 1 DESC
LIMIT 5;

-- ── F · what keys the notification metadata actually carries ────────────────
-- KEY NAMES ONLY. No value is selected: a value could carry something the
-- next version of the worker decides to include, and this file must stay
-- safe to run without re-reading it.
SELECT
  k            AS metadata_key,
  count(*)     AS appearances
FROM "Notification" n
CROSS JOIN LATERAL jsonb_object_keys(n.metadata) AS k
WHERE n.metadata ->> 'kind' = 'executive.report'
GROUP BY 1
ORDER BY 1;

-- ── G · is the membership audit trail empty, or was it queried wrongly ──────
-- `membership_audit_rows_all_time = 0` has two very different explanations.
-- This separates them: first what entity types the trail actually records,
-- then what actions exist for the membership entity. Counts and names only —
-- no metadata, no ids.
SELECT
  "entityType",
  count(*)     AS rows,
  min("createdAt") AS oldest,
  max("createdAt") AS newest
FROM "AuditLog"
GROUP BY 1
ORDER BY rows DESC
LIMIT 15;

SELECT
  action,
  count(*)         AS rows,
  min("createdAt") AS oldest,
  max("createdAt") AS newest
FROM "AuditLog"
WHERE action LIKE '%member%' OR "entityType" ILIKE '%member%'
GROUP BY 1
ORDER BY rows DESC
LIMIT 15;

-- ── H · how far back the trail reaches at all ───────────────────────────────
-- A silent trail proves nothing if retention has swept it, or if it simply
-- does not reach back to the moment in question.
SELECT
  count(*)         AS audit_rows_all_time,
  min("createdAt") AS oldest_audit_row,
  max("createdAt") AS newest_audit_row
FROM "AuditLog";

-- ============================================================================
-- HOW TO READ THE RESULT
--
--   A shows value_length <> 10
--       -> the file reached psql with CRLF endings. The query is fine; the
--          transport was not. Re-run from the git blob, which is LF.
--
--   B shows reports_all_time = 0
--       -> this database has no nightly reports at all, and the worker is
--          writing somewhere else. Establish which database the application
--          actually uses before anything else.
--
--   B has rows but C shows no 2026-10-14
--       -> the report exists under a different business date than the log
--          suggests, and the day boundary is the thing to examine.
--
--   E shows a business date but the authorization query found none
--       -> the mismatch is in that query's own predicate, not in the data.
--
--   G shows membership actions under names other than the four the
--   authorization query uses
--       -> that query's §7 was asking the wrong question.
--
--   G returns nothing at all for membership
--       -> the trail is genuinely empty, and historical authorisation cannot
--          be proven from it. Current state plus code evidence is an
--          INFERENCE, and must be labelled as one.
-- ============================================================================
