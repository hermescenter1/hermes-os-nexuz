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
\set report_org ''   -- leave empty to cover every organization

\pset pager off
\timing off

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
  AND (:'report_org' = '' OR r."organizationId" = :'report_org')
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
  AND (:'report_org' = '' OR m."organizationId" = :'report_org')
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
  AND (:'report_org' = '' OR m."organizationId" = :'report_org')
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
  AND (:'report_org' = '' OR a."organizationId" = :'report_org')
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
-- WHAT WOULD MAKE IT A RECORD. Writing the recipient's role and status into
-- the notification's own metadata at send time, so the row carries the
-- authority it was sent under. That is a product change, not a query, and is
-- not proposed here.
-- ============================================================================
