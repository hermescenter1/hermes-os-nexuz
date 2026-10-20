-- ============================================================================
-- Row 10 — PRODUCTION_RECIPIENT_AUTHORIZATION_EVIDENCE
--
-- Read-only. SELECTs only. No PII: no name, no e-mail, no telephone. User ids
-- appear as a truncated md5 digest so the same person can be recognised ACROSS
-- the six result sets without the id itself being printed.
--
-- Every table and column below was read out of prisma/schema.prisma and the
-- applied migrations; nothing is guessed:
--
--   "Notification"           id, "userId", type, title, message, metadata(jsonb),
--                            "isRead", "createdAt"
--                            -- NO organizationId column exists on this table.
--   "ExecutiveDailyReport"   "organizationId", "businessDate" varchar(10),
--                            version, "notifiedAt", UNIQUE(org, date, version)
--   "OrganizationMember"     "organizationId", "userId", role (OrgRole),
--                            status (MemberStatus), UNIQUE(org, userId)
--   "AuditLog"               "userId", action, "entityType", "entityId",
--                            metadata, "createdAt", "organizationId"
--
-- The worker writes the notification as (src/lib/executive/report/worker.ts):
--   metadata = {"kind":"executive.report","businessDate":"<YYYY-MM-DD>"}
--   title    = 'Executive daily report'
--
-- READ THIS BEFORE INTERPRETING §2 AND §3. The Notification row records only
-- `userId`. It carries NO organizationId — the organizationId the worker
-- passes is used for usage metering and is never stored on the row. So the
-- organization a recipient is matched to is derived from their CURRENT
-- membership, not from the notification. Section 6 is what makes that
-- defensible, and section 6's limits are stated there.
--
-- Run with: psql -v ON_ERROR_STOP=1 -f this-file.sql
-- Change the two values below and nothing else.
-- ============================================================================

\set business_date '2026-10-14'
-- A HASH PREFIX, never a raw organization id: section 0 prints the candidates
-- as hashes, and that is what gets pasted back here. An operator running this
-- never has to handle a raw tenant identifier, and none is ever printed.
-- Empty means "every organization that reported that day".
\set report_org_hash ''

\pset pager off
\timing off

-- ── PRECONDITIONS · a zero result must never look like a success ───────────
--
-- The first production run of this file returned zero in EVERY section while
-- the worker's log said a report and a notification existed. Zero rows is an
-- ANSWER to a question, and it is indistinguishable from the question never
-- having been asked properly. Nothing in the file separated the two, so §5
-- and §6 read as "no duplicates" and "no unauthorised recipients" — two of
-- the five things row 10 exists to prove.
--
-- WHAT IS NOT KNOWN. Why that run selected nothing is still open. A CRLF
-- parameter was ruled out by the execution evidence: the SQL was piped
-- straight from the git blob 0a896b55…, sha256 b86d6636…, so no carriage
-- return reached psql. CRLF remains a real hazard for anyone who runs the
-- file from a Windows working tree, which is why the first check below still
-- exists — but it is NOT the explanation for what was observed.
-- ROW10-DIAGNOSTIC.sql is the file that looks for the explanation.
--
-- HOW THESE STOP. Each denominator is a COUNT from a real query, never a
-- constant: `1 / (count(*) > 0)::int` divides by zero only at run time, on a
-- value the planner cannot fold away, and the result is in the SELECT list so
-- it must be produced. Under ON_ERROR_STOP=1 a division by zero ends the
-- session before any result section runs. They are top-level statements, not
-- CTEs: an unreferenced CTE can be skipped entirely.

-- 1 · the business-date parameter is a plain YYYY-MM-DD.
--     `businessDate` is VARCHAR(10) compared as TEXT, so one stray byte
--     matches nothing, silently, in every section below.
SELECT
  1 / (count(*) > 0)::int AS business_date_parameter_is_a_plain_yyyy_mm_dd
FROM (
  SELECT 1
  WHERE length(:'business_date') = 10
    AND :'business_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
) AS parameter_is_well_formed;

-- 2 · at least one report exists for that day. Without it the premise of
--     every later section is false, and their emptiness means nothing.
SELECT
  1 / (count(*) > 0)::int AS reports_exist_for_this_business_date,
  count(*)                AS reports_found
FROM "ExecutiveDailyReport"
WHERE "businessDate" = :'business_date';

-- 3 · the organization is unambiguous.
--     Empty selector with exactly one reporting organization is fine. Empty
--     with several is NOT: it would silently mix tenants in one answer. A
--     non-empty selector must resolve to exactly one organization — a hash
--     prefix is a SELECTOR, and its uniqueness is proven here at run time
--     rather than assumed. Zero matches (an unknown or stale prefix) and more
--     than one match (a collision) both stop.
SELECT
  1 / (
    CASE
      WHEN :'report_org_hash' = '' THEN (count(*) = 1)
      ELSE (count(*) FILTER (WHERE org_hash = :'report_org_hash') = 1)
    END
  )::int                        AS organization_selection_is_unambiguous,
  count(*)                      AS organizations_reporting_this_day,
  count(*) FILTER (WHERE org_hash = :'report_org_hash') AS organizations_matching_the_selector
FROM (
  SELECT DISTINCT substr(md5("organizationId"), 1, 12) AS org_hash
  FROM "ExecutiveDailyReport"
  WHERE "businessDate" = :'business_date'
) AS reporting_organizations;

-- ── 0 · the reports those notifications belong to ───────────────────────────
-- Establishes which (organization, date, version) rows exist and which of them
-- were announced. `notifiedAt` is the claim the worker takes exactly once.
SELECT
  substr(md5(r."organizationId"), 1, 12) AS org_hash,
  r."businessDate",
  r.version,
  (r."notifiedAt" IS NOT NULL)           AS was_announced,
  r."notifiedAt"
FROM "ExecutiveDailyReport" r
WHERE r."businessDate" = :'business_date'
  AND (:'report_org_hash' = '' OR substr(md5(r."organizationId"), 1, 12) = :'report_org_hash')
ORDER BY org_hash, r.version;

-- ── 1 · exactly one notification per report ─────────────────────────────────
-- EXPECTED: one row per organization, notification_count = 1.
-- More than one is a duplicate announcement; zero means nobody was told.
SELECT
  substr(md5(m."organizationId"), 1, 12) AS org_hash,
  count(*)                               AS notification_count,
  count(DISTINCT n."userId")             AS distinct_recipients,
  min(n."createdAt")                     AS first_sent,
  max(n."createdAt")                     AS last_sent
FROM "Notification" n
JOIN "OrganizationMember" m ON m."userId" = n."userId"
WHERE n.metadata ->> 'kind'         = 'executive.report'
  AND n.metadata ->> 'businessDate' = :'business_date'
  AND (:'report_org_hash' = '' OR substr(md5(m."organizationId"), 1, 12) = :'report_org_hash')
GROUP BY 1
ORDER BY 1;

-- ── 2 · 3 · 4 · who received it, and on what authority ──────────────────────
-- EXPECTED: every row has role IN ('OWNER','ADMIN') AND status = 'ACTIVE',
-- and `memberships_elsewhere` = 0 — a recipient who also belongs to another
-- organization would make §1's organization attribution ambiguous.
SELECT
  substr(md5(n."userId"), 1, 12)         AS user_hash,
  substr(md5(m."organizationId"), 1, 12) AS org_hash,
  m.role::text                           AS role_now,
  m.status::text                         AS status_now,
  (m.role IN ('OWNER', 'ADMIN') AND m.status = 'ACTIVE') AS authorised_now,
  n."createdAt"                          AS notified_at,
  (
    SELECT count(*) FROM "OrganizationMember" m2
    WHERE m2."userId" = n."userId" AND m2."organizationId" <> m."organizationId"
  )                                      AS memberships_elsewhere
FROM "Notification" n
JOIN "OrganizationMember" m ON m."userId" = n."userId"
WHERE n.metadata ->> 'kind'         = 'executive.report'
  AND n.metadata ->> 'businessDate' = :'business_date'
  AND (:'report_org_hash' = '' OR substr(md5(m."organizationId"), 1, 12) = :'report_org_hash')
ORDER BY org_hash, user_hash;

-- ── 5 · no duplicate notification for the same report and recipient ─────────
-- EXPECTED: ZERO ROWS. Any row here is the same person told twice.
SELECT
  substr(md5(n."userId"), 1, 12) AS user_hash,
  count(*)                       AS times_told,
  min(n."createdAt")             AS first_sent,
  max(n."createdAt")             AS last_sent
FROM "Notification" n
WHERE n.metadata ->> 'kind'         = 'executive.report'
  AND n.metadata ->> 'businessDate' = :'business_date'
GROUP BY 1
HAVING count(*) > 1
ORDER BY 1;

-- ── 6 · nobody outside the allowlist was told ───────────────────────────────
-- EXPECTED: ZERO ROWS. Any row is a MANAGER, BILLING_ADMIN, ENGINEER, VIEWER
-- or a non-ACTIVE member who received an announcement.
SELECT
  substr(md5(n."userId"), 1, 12)         AS user_hash,
  substr(md5(m."organizationId"), 1, 12) AS org_hash,
  m.role::text                           AS role_now,
  m.status::text                         AS status_now,
  n."createdAt"                          AS notified_at
FROM "Notification" n
JOIN "OrganizationMember" m ON m."userId" = n."userId"
WHERE n.metadata ->> 'kind'         = 'executive.report'
  AND n.metadata ->> 'businessDate' = :'business_date'
  AND (m.role NOT IN ('OWNER', 'ADMIN') OR m.status <> 'ACTIVE')
ORDER BY org_hash, user_hash;

-- ── 7 · THE LIMIT: role and status are CURRENT, not historical ──────────────
--
-- "OrganizationMember" stores one row per (organization, user) and OVERWRITES
-- role and status in place. There is no temporal table, no validity interval
-- and no snapshot of the membership as it stood when the notification was
-- written. Sections 2-4 and 6 therefore describe the membership AS IT IS NOW.
--
-- This query asks the only other source that could narrow the gap: did the
-- audit trail record any membership change for these recipients BETWEEN the
-- notification and now?
--
-- EXPECTED: ZERO ROWS — and read what that does and does not mean below.
SELECT
  substr(md5(a."userId"), 1, 12)   AS actor_hash,
  substr(md5(a."entityId"), 1, 12) AS membership_hash,
  a.action,
  a."createdAt",
  a.outcome
FROM "AuditLog" a
WHERE a."entityType" = 'OrganizationMember'
  AND a.action IN (
    'org.member.added',
    'org.member.removed',
    'org.member.role_changed',
    'org.member.status_changed'
  )
  AND a."createdAt" >= (
    SELECT min(n."createdAt") FROM "Notification" n
    WHERE n.metadata ->> 'kind'         = 'executive.report'
      AND n.metadata ->> 'businessDate' = :'business_date'
  )
  AND (:'report_org_hash' = '' OR substr(md5(a."organizationId"), 1, 12) = :'report_org_hash')
ORDER BY a."createdAt";

-- ── 8 · how much audit history exists at all ────────────────────────────────
-- A silent trail proves nothing if the trail does not reach back far enough,
-- or if retention has swept it. This states the window the §7 result covers.
SELECT
  count(*)           AS membership_audit_rows_all_time,
  min(a."createdAt") AS oldest_membership_audit_row,
  max(a."createdAt") AS newest_membership_audit_row
FROM "AuditLog" a
WHERE a."entityType" = 'OrganizationMember'
  AND a.action IN (
    'org.member.added',
    'org.member.removed',
    'org.member.role_changed',
    'org.member.status_changed'
  );

-- ============================================================================
-- HOW FAR THIS EVIDENCE GOES
--
-- PROVEN DIRECTLY, from stored rows:
--   * how many announcements exist for this business date, and for whom (§1);
--   * that no recipient was told twice (§5);
--   * what role and status each recipient holds RIGHT NOW (§2-4);
--   * that no out-of-allowlist member holds an announcement right now (§6).
--
-- NOT PROVEN, and must not be described as proven:
--   * the role and status each recipient held AT THE MOMENT OF SENDING.
--     The membership row is mutable and keeps no history. If §7 returns rows,
--     the current state is NOT a safe stand-in for the state at send time and
--     the affected recipients must be reported as indeterminate.
--
-- WHAT A COMBINED READING IS. Code evidence (the worker filters
-- `status: ACTIVE, role IN (OWNER, ADMIN)` at the database query itself,
-- proven by mutation in src/lib/executive/report/__tests__/worker.test.ts)
-- plus current state (§2-4, §6) plus an empty §7 over a window §8 shows is
-- long enough is an INFERENCE that authorisation held at send time. It is a
-- strong one. It is not a record, and this document does not call it one.
--
-- WHY THE PRECONDITIONS EXIST. The first production run of this file
-- returned zero everywhere and read as "nothing to see". Zero rows from a
-- query that never selected the intended rows is not evidence of anything,
-- and a report presenting it as "no duplicates, no unauthorized recipients"
-- would be false. The checks at the top stop the file instead. Why that run
-- selected nothing is still OPEN: the CRLF hypothesis was ruled out by the
-- execution evidence, and ROW10-DIAGNOSTIC.sql is what looks for the cause.
--
-- WHAT WOULD MAKE IT A RECORD. Writing the recipient's role and status into
-- the notification's own metadata at send time, so the row carries the
-- authority it was sent under. That is a product change, not a query, and is
-- not proposed here.
-- ============================================================================
