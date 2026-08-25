-- ═══════════════════════════════════════════════════════════════════════════
-- Academy cross-tenant reconciliation — READ ONLY.
--
-- Finds rows that the missing organization predicate on the Academy write
-- endpoints could have produced before it was closed:
--
--   * POST /api/academy/courses/[id]/enroll   gated on isPublished alone, so a
--     member of org B could enroll in org A's course. enrollUser() stamps the
--     CALLER's organizationId onto the row, so the artifact is an enrollment
--     whose organizationId does not match its course's.
--   * POST /api/academy/progress              consumed such a row and never
--     checked that lessonId belonged to courseId.
--   * POST /api/academy/quizzes/[id]/attempt  took enrollmentId from the request
--     body with no ownership check, so an attempt could be recorded against
--     another user's or another tenant's enrollment.
--   * Certificates issued from a mismatched enrollment carry the foreign
--     course's title inside `metadata`.
--
-- SAFETY
--   Every statement is a SELECT and the whole script runs inside a READ ONLY
--   transaction, so PostgreSQL itself rejects any write that might be added
--   later by mistake. Nothing is updated, deleted or created. No user names,
--   e-mail addresses or certificate payloads are projected — only identifiers,
--   counts and booleans.
--
-- USAGE
--   psql "$DATABASE_URL" -f scripts/security/academy-tenant-reconciliation.sql
--
--   Read section 0 first: if every count is 0 this installation is clean and
--   sections 1-4 return nothing. Run it against a restored backup rather than
--   the live primary if you would rather not add read load to production.
-- ═══════════════════════════════════════════════════════════════════════════

\pset pager off

BEGIN TRANSACTION READ ONLY;

-- Do not let a sequential scan on a large installation sit on a production
-- connection indefinitely; raise this if a section legitimately needs longer.
SET LOCAL statement_timeout = '120s';

\echo ''
\echo '── 0. SUMMARY — magnitudes first ────────────────────────────────────────'

SELECT
  'enrollment_org_mismatch' AS check_name,
  count(*)                  AS affected_rows,
  count(*) FILTER (WHERE e."deletedAt" IS NULL) AS live_rows
FROM "AcademyEnrollment" e
JOIN "AcademyCourse" c ON c.id = e."courseId"
WHERE e."organizationId" <> c."organizationId"

UNION ALL

SELECT
  'progress_on_mismatched_enrollment',
  count(*),
  count(*)
FROM "AcademyProgress" p
JOIN "AcademyEnrollment" e ON e.id = p."enrollmentId"
JOIN "AcademyCourse" c     ON c.id = e."courseId"
WHERE e."organizationId" <> c."organizationId"
   OR p."organizationId" <> c."organizationId"

UNION ALL

SELECT
  'progress_lesson_outside_course',
  count(*),
  count(*)
FROM "AcademyProgress" p
JOIN "AcademyEnrollment" e ON e.id = p."enrollmentId"
JOIN "AcademyLesson" l     ON l.id = p."lessonId"
WHERE l."courseId" <> e."courseId"

UNION ALL

SELECT
  'quiz_attempt_foreign_enrollment',
  count(*),
  count(*)
FROM "AcademyQuizAttempt" a
JOIN "AcademyEnrollment" e ON e.id = a."enrollmentId"
JOIN "AcademyQuiz" q       ON q.id = a."quizId"
JOIN "AcademyCourse" c     ON c.id = q."courseId"
WHERE a."userId"         <> e."userId"
   OR a."organizationId" <> c."organizationId"
   OR e."courseId"       <> q."courseId"

UNION ALL

SELECT
  'certificate_from_mismatched_enrollment',
  count(*),
  count(*) FILTER (WHERE cert."deletedAt" IS NULL)
FROM "AcademyCertificate" cert
JOIN "AcademyEnrollment" e ON e.id = cert."enrollmentId"
JOIN "AcademyCourse" c     ON c.id = cert."courseId"
WHERE cert."organizationId" <> c."organizationId"
   OR e."organizationId"    <> c."organizationId"

ORDER BY check_name;

\echo ''
\echo '── 1. Enrollments whose organization is not the course owner ────────────'
\echo '     The primary artifact. enrollment_org = the tenant that enrolled,'
\echo '     course_org = the tenant that owns the content it points at.'

SELECT
  e.id                 AS enrollment_id,
  e."organizationId"   AS enrollment_org,
  c."organizationId"   AS course_org,
  e."courseId"         AS course_id,
  e."userId"           AS user_id,
  e.source,
  e.status,
  e."progressPercent",
  e."createdAt",
  (e."deletedAt" IS NOT NULL) AS soft_deleted
FROM "AcademyEnrollment" e
JOIN "AcademyCourse" c ON c.id = e."courseId"
WHERE e."organizationId" <> c."organizationId"
ORDER BY e."createdAt";

\echo ''
\echo '── 2. Progress rows attached to a mismatched enrollment or foreign lesson'

SELECT
  p.id                 AS progress_id,
  p."enrollmentId",
  p."organizationId"   AS progress_org,
  c."organizationId"   AS course_org,
  e."courseId"         AS enrollment_course_id,
  l."courseId"         AS lesson_course_id,
  (l."courseId" <> e."courseId")               AS lesson_outside_course,
  (e."organizationId" <> c."organizationId")   AS enrollment_org_mismatch,
  p."createdAt"
FROM "AcademyProgress" p
JOIN "AcademyEnrollment" e ON e.id = p."enrollmentId"
JOIN "AcademyCourse" c     ON c.id = e."courseId"
JOIN "AcademyLesson" l     ON l.id = p."lessonId"
WHERE e."organizationId" <> c."organizationId"
   OR p."organizationId" <> c."organizationId"
   OR l."courseId"       <> e."courseId"
ORDER BY p."createdAt";

\echo ''
\echo '── 3. Quiz attempts recorded against an enrollment that is not the taker''s'

SELECT
  a.id                 AS attempt_id,
  a."quizId",
  a."enrollmentId",
  a."userId"           AS attempt_user,
  e."userId"           AS enrollment_user,
  a."organizationId"   AS attempt_org,
  c."organizationId"   AS course_org,
  (a."userId"         <> e."userId")           AS enrollment_belongs_to_other_user,
  (a."organizationId" <> c."organizationId")   AS attempt_org_mismatch,
  (e."courseId"       <> q."courseId")         AS enrollment_for_other_course,
  a.score,
  a.passed,
  a."createdAt"
FROM "AcademyQuizAttempt" a
JOIN "AcademyEnrollment" e ON e.id = a."enrollmentId"
JOIN "AcademyQuiz" q       ON q.id = a."quizId"
JOIN "AcademyCourse" c     ON c.id = q."courseId"
WHERE a."userId"         <> e."userId"
   OR a."organizationId" <> c."organizationId"
   OR e."courseId"       <> q."courseId"
ORDER BY a."createdAt";

\echo ''
\echo '── 4. Certificates issued from a mismatched enrollment ──────────────────'
\echo '     These embed the foreign course title in metadata. The title text is'
\echo '     deliberately NOT projected — only whether one is stored at all.'

SELECT
  cert.id              AS certificate_id,
  cert."certificateNumber",
  cert."organizationId" AS certificate_org,
  c."organizationId"    AS course_org,
  e."organizationId"    AS enrollment_org,
  cert."courseId",
  cert."userId"         AS user_id,
  (cert.metadata->>'courseTitle' IS NOT NULL) AS metadata_embeds_course_title,
  cert."issuedAt",
  (cert."deletedAt" IS NOT NULL) AS soft_deleted
FROM "AcademyCertificate" cert
JOIN "AcademyEnrollment" e ON e.id = cert."enrollmentId"
JOIN "AcademyCourse" c     ON c.id = cert."courseId"
WHERE cert."organizationId" <> c."organizationId"
   OR e."organizationId"    <> c."organizationId"
ORDER BY cert."issuedAt";

COMMIT;

\echo ''
\echo 'Reconciliation complete — no rows were modified.'
