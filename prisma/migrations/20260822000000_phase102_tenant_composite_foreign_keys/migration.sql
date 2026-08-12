-- PHASE 102 / RELEASE BLOCKER 6 — structural cross-tenant integrity for the
-- Media & Video Hub.
--
-- THE DEFECT
-- ----------
-- Every Phase 102 child row carries its own `organizationId`, and every child
-- FK is SINGLE-COLUMN: `MediaSubtitleTrack.mediaAssetId -> MediaAsset.id`. The
-- database therefore accepts a track whose `organizationId` is A pointing at an
-- asset owned by B. Nothing in the schema forbids it.
--
-- The application is careful — every repository query pins the tenant — but
-- "the application is careful" is not an invariant, it is a habit. A legacy
-- import, a restore, a mis-scoped backfill, a raw SQL fix, or one route that
-- forgets a predicate is all it takes, and once such a row exists it is
-- indistinguishable from a legitimate one at the storage layer. A tenant
-- boundary that only the application knows about is one forgotten `where`
-- clause away from not existing.
--
-- WHAT THIS MIGRATION DOES
-- ------------------------
-- Makes the boundary a property of the DATABASE:
--
--   1. Each parent gains UNIQUE ("organizationId", "id"). Redundant as a
--      uniqueness claim - `id` is already the primary key - but it is what a
--      composite foreign key can reference.
--   2. Each child FK is replaced by a COMPOSITE one carrying the tenant:
--        FOREIGN KEY ("organizationId", "mediaAssetId")
--          REFERENCES "MediaAsset" ("organizationId", "id")
--      A child can now only point at a parent in its OWN organization. The
--      cross-tenant row is no longer merely unwritten; it is unwritable.
--
-- ON DELETE, PRESERVED EXACTLY
-- ----------------------------
-- Every action is carried over unchanged (verified against the live catalogue:
-- confdeltype 'c' = CASCADE, 'n' = SET NULL; confupdtype 'c' = CASCADE):
--
--   * The ten MediaAsset children keep ON DELETE CASCADE.
--   * MediaTagOnAsset.tagId keeps ON DELETE CASCADE.
--   * MediaAsset.categoryId / .instructorId and MediaCategory.parentId keep
--     ON DELETE SET NULL - but as a COLUMN LIST: `SET NULL ("categoryId")`.
--     A plain composite SET NULL would try to null "organizationId" too, which
--     is NOT NULL, so deleting a category would fail with a constraint
--     violation instead of detaching the asset. The column-list form is
--     PostgreSQL 15+; production and CI both run pgvector/pgvector:pg16.
--
-- PREFLIGHT: FAIL CLOSED, AND SAY WHY
-- -----------------------------------
-- Adding a validating constraint already fails on a violating row, but the
-- error an operator would see is a raw FK violation naming one key. The DO
-- block below runs FIRST, counts every cross-tenant row across all fourteen
-- relations, and raises ONE exception naming each offending relation and its
-- count. Prisma runs a migration in a transaction, so the raise rolls the whole
-- thing back: no constraint is added, no row is touched, and the operator gets
-- an auditable list to reconcile rather than a mystery.
--
-- This migration CHANGES NO DATA. It adds constraints only. A database with
-- inconsistent rows is refused, never silently repaired - deciding which side
-- of a cross-tenant link is the mistake is a data-ownership question that
-- belongs to the operator, not to a migration.

-- ── 1. Preflight ────────────────────────────────────────────────────────────

DO $phase102_tenant_preflight$
DECLARE
  offender  RECORD;
  findings  text := '';
  total     bigint := 0;
BEGIN
  FOR offender IN
    SELECT * FROM (
      SELECT 'MediaAssetTranslation.mediaAssetId' AS relation,
             (SELECT count(*) FROM "MediaAssetTranslation" c
                JOIN "MediaAsset" p ON p.id = c."mediaAssetId"
               WHERE p."organizationId" <> c."organizationId") AS n
      UNION ALL SELECT 'MediaChapter.mediaAssetId',
             (SELECT count(*) FROM "MediaChapter" c
                JOIN "MediaAsset" p ON p.id = c."mediaAssetId"
               WHERE p."organizationId" <> c."organizationId")
      UNION ALL SELECT 'MediaSubtitleTrack.mediaAssetId',
             (SELECT count(*) FROM "MediaSubtitleTrack" c
                JOIN "MediaAsset" p ON p.id = c."mediaAssetId"
               WHERE p."organizationId" <> c."organizationId")
      UNION ALL SELECT 'MediaTranscript.mediaAssetId',
             (SELECT count(*) FROM "MediaTranscript" c
                JOIN "MediaAsset" p ON p.id = c."mediaAssetId"
               WHERE p."organizationId" <> c."organizationId")
      UNION ALL SELECT 'MediaAttachment.mediaAssetId',
             (SELECT count(*) FROM "MediaAttachment" c
                JOIN "MediaAsset" p ON p.id = c."mediaAssetId"
               WHERE p."organizationId" <> c."organizationId")
      UNION ALL SELECT 'MediaTagOnAsset.mediaAssetId',
             (SELECT count(*) FROM "MediaTagOnAsset" c
                JOIN "MediaAsset" p ON p.id = c."mediaAssetId"
               WHERE p."organizationId" <> c."organizationId")
      UNION ALL SELECT 'MediaTagOnAsset.tagId',
             (SELECT count(*) FROM "MediaTagOnAsset" c
                JOIN "MediaTag" p ON p.id = c."tagId"
               WHERE p."organizationId" <> c."organizationId")
      UNION ALL SELECT 'MediaSave.mediaAssetId',
             (SELECT count(*) FROM "MediaSave" c
                JOIN "MediaAsset" p ON p.id = c."mediaAssetId"
               WHERE p."organizationId" <> c."organizationId")
      UNION ALL SELECT 'MediaWatchProgress.mediaAssetId',
             (SELECT count(*) FROM "MediaWatchProgress" c
                JOIN "MediaAsset" p ON p.id = c."mediaAssetId"
               WHERE p."organizationId" <> c."organizationId")
      UNION ALL SELECT 'MediaViewEvent.mediaAssetId',
             (SELECT count(*) FROM "MediaViewEvent" c
                JOIN "MediaAsset" p ON p.id = c."mediaAssetId"
               WHERE p."organizationId" <> c."organizationId")
      UNION ALL SELECT 'MediaEditorialEvent.mediaAssetId',
             (SELECT count(*) FROM "MediaEditorialEvent" c
                JOIN "MediaAsset" p ON p.id = c."mediaAssetId"
               WHERE p."organizationId" <> c."organizationId")
      UNION ALL SELECT 'MediaAsset.categoryId',
             (SELECT count(*) FROM "MediaAsset" c
                JOIN "MediaCategory" p ON p.id = c."categoryId"
               WHERE p."organizationId" <> c."organizationId")
      UNION ALL SELECT 'MediaAsset.instructorId',
             (SELECT count(*) FROM "MediaAsset" c
                JOIN "MediaInstructor" p ON p.id = c."instructorId"
               WHERE p."organizationId" <> c."organizationId")
      UNION ALL SELECT 'MediaCategory.parentId',
             (SELECT count(*) FROM "MediaCategory" c
                JOIN "MediaCategory" p ON p.id = c."parentId"
               WHERE p."organizationId" <> c."organizationId")
    ) counts
    WHERE n > 0
    ORDER BY relation
  LOOP
    findings := findings || E'\n  - ' || offender.relation || ': ' || offender.n || ' row(s)';
    total := total + offender.n;
  END LOOP;

  IF total > 0 THEN
    RAISE EXCEPTION
      'PHASE102_CROSS_TENANT_ROWS_PRESENT: % row(s) link a Phase 102 child to a parent in a DIFFERENT organization.%',
      total, findings
      USING HINT =
        'This migration adds composite tenant foreign keys and refuses to run while such rows exist. '
        'It changes no data on purpose: deciding which side of a cross-tenant link is the mistake is a '
        'data-ownership question for an operator, not for a migration. Reconcile the listed rows, then re-run.';
  END IF;
END
$phase102_tenant_preflight$;

-- ── 2. Composite tenant keys on the parents ─────────────────────────────────
--
-- ("organizationId","id") is already implied by the primary key; it exists so a
-- composite foreign key has something to reference.

ALTER TABLE "MediaAsset"      ADD CONSTRAINT "MediaAsset_org_id_key"      UNIQUE ("organizationId", "id");
ALTER TABLE "MediaCategory"   ADD CONSTRAINT "MediaCategory_org_id_key"   UNIQUE ("organizationId", "id");
ALTER TABLE "MediaInstructor" ADD CONSTRAINT "MediaInstructor_org_id_key" UNIQUE ("organizationId", "id");
ALTER TABLE "MediaTag"        ADD CONSTRAINT "MediaTag_org_id_key"        UNIQUE ("organizationId", "id");

-- ── 3. Children of MediaAsset — CASCADE preserved ───────────────────────────

ALTER TABLE "MediaAssetTranslation" DROP CONSTRAINT "MediaAssetTranslation_mediaAssetId_fkey";
ALTER TABLE "MediaAssetTranslation" ADD CONSTRAINT "MediaAssetTranslation_org_mediaAsset_fkey"
  FOREIGN KEY ("organizationId", "mediaAssetId") REFERENCES "MediaAsset" ("organizationId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaChapter" DROP CONSTRAINT "MediaChapter_mediaAssetId_fkey";
ALTER TABLE "MediaChapter" ADD CONSTRAINT "MediaChapter_org_mediaAsset_fkey"
  FOREIGN KEY ("organizationId", "mediaAssetId") REFERENCES "MediaAsset" ("organizationId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaSubtitleTrack" DROP CONSTRAINT "MediaSubtitleTrack_mediaAssetId_fkey";
ALTER TABLE "MediaSubtitleTrack" ADD CONSTRAINT "MediaSubtitleTrack_org_mediaAsset_fkey"
  FOREIGN KEY ("organizationId", "mediaAssetId") REFERENCES "MediaAsset" ("organizationId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaTranscript" DROP CONSTRAINT "MediaTranscript_mediaAssetId_fkey";
ALTER TABLE "MediaTranscript" ADD CONSTRAINT "MediaTranscript_org_mediaAsset_fkey"
  FOREIGN KEY ("organizationId", "mediaAssetId") REFERENCES "MediaAsset" ("organizationId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaAttachment" DROP CONSTRAINT "MediaAttachment_mediaAssetId_fkey";
ALTER TABLE "MediaAttachment" ADD CONSTRAINT "MediaAttachment_org_mediaAsset_fkey"
  FOREIGN KEY ("organizationId", "mediaAssetId") REFERENCES "MediaAsset" ("organizationId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaTagOnAsset" DROP CONSTRAINT "MediaTagOnAsset_mediaAssetId_fkey";
ALTER TABLE "MediaTagOnAsset" ADD CONSTRAINT "MediaTagOnAsset_org_mediaAsset_fkey"
  FOREIGN KEY ("organizationId", "mediaAssetId") REFERENCES "MediaAsset" ("organizationId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaSave" DROP CONSTRAINT "MediaSave_mediaAssetId_fkey";
ALTER TABLE "MediaSave" ADD CONSTRAINT "MediaSave_org_mediaAsset_fkey"
  FOREIGN KEY ("organizationId", "mediaAssetId") REFERENCES "MediaAsset" ("organizationId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaWatchProgress" DROP CONSTRAINT "MediaWatchProgress_mediaAssetId_fkey";
ALTER TABLE "MediaWatchProgress" ADD CONSTRAINT "MediaWatchProgress_org_mediaAsset_fkey"
  FOREIGN KEY ("organizationId", "mediaAssetId") REFERENCES "MediaAsset" ("organizationId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaViewEvent" DROP CONSTRAINT "MediaViewEvent_mediaAssetId_fkey";
ALTER TABLE "MediaViewEvent" ADD CONSTRAINT "MediaViewEvent_org_mediaAsset_fkey"
  FOREIGN KEY ("organizationId", "mediaAssetId") REFERENCES "MediaAsset" ("organizationId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaEditorialEvent" DROP CONSTRAINT "MediaEditorialEvent_mediaAssetId_fkey";
ALTER TABLE "MediaEditorialEvent" ADD CONSTRAINT "MediaEditorialEvent_org_mediaAsset_fkey"
  FOREIGN KEY ("organizationId", "mediaAssetId") REFERENCES "MediaAsset" ("organizationId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 4. The tag join — CASCADE preserved ─────────────────────────────────────

ALTER TABLE "MediaTagOnAsset" DROP CONSTRAINT "MediaTagOnAsset_tagId_fkey";
ALTER TABLE "MediaTagOnAsset" ADD CONSTRAINT "MediaTagOnAsset_org_tag_fkey"
  FOREIGN KEY ("organizationId", "tagId") REFERENCES "MediaTag" ("organizationId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 5. Nullable parents — SET NULL on the REFERENCING COLUMN ONLY ───────────
--
-- `ON DELETE SET NULL ("categoryId")` nulls the category link and leaves
-- "organizationId" intact. Without the column list PostgreSQL would try to null
-- both, and "organizationId" is NOT NULL, so deleting a category would fail.

ALTER TABLE "MediaAsset" DROP CONSTRAINT "MediaAsset_categoryId_fkey";
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_org_category_fkey"
  FOREIGN KEY ("organizationId", "categoryId") REFERENCES "MediaCategory" ("organizationId", "id")
  ON DELETE SET NULL ("categoryId") ON UPDATE CASCADE;

ALTER TABLE "MediaAsset" DROP CONSTRAINT "MediaAsset_instructorId_fkey";
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_org_instructor_fkey"
  FOREIGN KEY ("organizationId", "instructorId") REFERENCES "MediaInstructor" ("organizationId", "id")
  ON DELETE SET NULL ("instructorId") ON UPDATE CASCADE;

ALTER TABLE "MediaCategory" DROP CONSTRAINT "MediaCategory_parentId_fkey";
ALTER TABLE "MediaCategory" ADD CONSTRAINT "MediaCategory_org_parent_fkey"
  FOREIGN KEY ("organizationId", "parentId") REFERENCES "MediaCategory" ("organizationId", "id")
  ON DELETE SET NULL ("parentId") ON UPDATE CASCADE;
