-- Phase 102 — Hermes Media & Video Hub.
--
-- ADDITIVE ONLY. Migrations 20260813000000..20260820000017 are untouched. This file
-- contains no DROP TABLE, no DROP COLUMN, no TRUNCATE, no DELETE FROM, no RENAME,
-- no ALTER ... TYPE and no DROP TYPE — every one of those is classified
-- BREAKING_OR_UNKNOWN by scripts/dr/migration-sql-classify.mjs and blocks a deploy.
-- It creates fourteen new tables and adds nothing to any pre-existing table; the
-- only references to existing tables are FOREIGN KEY targets (Organization, User,
-- IndustrialSite) and the two existing enum types reused for industrial association.
--
-- Expected classification: FORWARD_ONLY_REQUIRES_BACKUP (it introduces foreign keys
-- and unique indexes). That is the documented, accepted outcome for this phase.
--
-- Lifecycle / visibility / processing / locale vocabularies are TEXT + CHECK rather
-- than Postgres enums, per docs/phase102/architecture.md §6: `ALTER TYPE ... ADD
-- VALUE` is append-only and `ALTER TYPE ... DROP` cannot be expressed at all, so a
-- vocabulary correction would be undeployable. A CHECK constraint can be replaced by
-- an additive ADD CONSTRAINT in a later migration.
--
-- Tenancy (§3): every table carries a NOT NULL "organizationId" with ON DELETE
-- CASCADE and an organizationId-leading index. Optional parents (site, category,
-- instructor, anonymous viewer) are nullable with ON DELETE SET NULL. The two
-- subject-attributable tables ("MediaSave", "MediaWatchProgress") bind a REQUIRED
-- "userId" with ON DELETE CASCADE: private viewing history must be destroyed with
-- the account, never orphaned.

-- ── 1. MediaAsset ─────────────────────────────────────────────────────────────
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT,
    "categoryId" TEXT,
    "instructorId" TEXT,
    "slug" TEXT NOT NULL,
    "primaryLocale" TEXT NOT NULL DEFAULT 'en',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "processingState" TEXT NOT NULL DEFAULT 'PENDING_UPLOAD',
    "skillLevel" TEXT,
    "storageKey" TEXT,
    "storageProvider" TEXT NOT NULL DEFAULT 'local',
    "contentType" TEXT,
    "byteSize" INTEGER,
    "checksumSha256" TEXT,
    "durationSeconds" INTEGER,
    "posterStorageKey" TEXT,
    "industrialDomain" TEXT,
    "linkedAssetType" "IndustrialAssetType",
    "linkedProtocol" "IndustrialProtocol",
    "linkedIndustrialAssetId" TEXT,
    "linkedProjectId" TEXT,
    "linkedArticleId" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "saveCount" INTEGER NOT NULL DEFAULT 0,
    "completionCount" INTEGER NOT NULL DEFAULT 0,
    "canonicalUrl" TEXT,
    "noIndex" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "processingFailureCode" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MediaAsset_primary_locale_check" CHECK ("primaryLocale" IN ('fa','en','de')),
    CONSTRAINT "MediaAsset_status_check" CHECK ("status" IN ('DRAFT','SUBMITTED','IN_REVIEW','PUBLISHED','REJECTED','ARCHIVED')),
    CONSTRAINT "MediaAsset_visibility_check" CHECK ("visibility" IN ('PRIVATE','ORGANIZATION','PUBLIC')),
    CONSTRAINT "MediaAsset_processing_state_check" CHECK ("processingState" IN ('PENDING_UPLOAD','UPLOADED','VALIDATING','READY','FAILED','QUARANTINED')),
    CONSTRAINT "MediaAsset_skill_level_check" CHECK ("skillLevel" IS NULL OR "skillLevel" IN ('BEGINNER','INTERMEDIATE','ADVANCED','EXPERT')),
    CONSTRAINT "MediaAsset_storage_provider_check" CHECK ("storageProvider" IN ('local','s3','minio')),
    CONSTRAINT "MediaAsset_checksum_check" CHECK ("checksumSha256" IS NULL OR "checksumSha256" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "MediaAsset_byte_size_check" CHECK ("byteSize" IS NULL OR "byteSize" >= 0),
    CONSTRAINT "MediaAsset_duration_check" CHECK ("durationSeconds" IS NULL OR "durationSeconds" >= 0),
    CONSTRAINT "MediaAsset_counters_check" CHECK ("viewCount" >= 0 AND "saveCount" >= 0 AND "completionCount" >= 0),
    -- Publication is an explicit act: a PUBLISHED asset must carry its stamp, and
    -- nothing may be served before the bytes were validated (§5, §11).
    CONSTRAINT "MediaAsset_published_stamp_check" CHECK ("status" <> 'PUBLISHED' OR ("publishedAt" IS NOT NULL AND "storageKey" IS NOT NULL AND "processingState" = 'READY'))
);
CREATE UNIQUE INDEX "MediaAsset_organizationId_slug_key" ON "MediaAsset" ("organizationId", "slug");
CREATE INDEX "MediaAsset_organizationId_status_visibility_idx" ON "MediaAsset" ("organizationId", "status", "visibility");
CREATE INDEX "MediaAsset_organizationId_processingState_idx" ON "MediaAsset" ("organizationId", "processingState");
CREATE INDEX "MediaAsset_organizationId_publishedAt_idx" ON "MediaAsset" ("organizationId", "publishedAt");
CREATE INDEX "MediaAsset_organizationId_categoryId_idx" ON "MediaAsset" ("organizationId", "categoryId");
CREATE INDEX "MediaAsset_organizationId_instructorId_idx" ON "MediaAsset" ("organizationId", "instructorId");
CREATE INDEX "MediaAsset_siteId_idx" ON "MediaAsset" ("siteId");

-- ── 2. MediaAssetTranslation ──────────────────────────────────────────────────
CREATE TABLE "MediaAssetTranslation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "keywords" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAssetTranslation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MediaAssetTranslation_locale_check" CHECK ("locale" IN ('fa','en','de'))
);
CREATE UNIQUE INDEX "MediaAssetTranslation_mediaAssetId_locale_key" ON "MediaAssetTranslation" ("mediaAssetId", "locale");
CREATE INDEX "MediaAssetTranslation_organizationId_locale_idx" ON "MediaAssetTranslation" ("organizationId", "locale");
CREATE INDEX "MediaAssetTranslation_organizationId_mediaAssetId_idx" ON "MediaAssetTranslation" ("organizationId", "mediaAssetId");

-- ── 3. MediaChapter ───────────────────────────────────────────────────────────
CREATE TABLE "MediaChapter" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "startSeconds" INTEGER NOT NULL,
    "endSeconds" INTEGER,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaChapter_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MediaChapter_locale_check" CHECK ("locale" IN ('fa','en','de')),
    CONSTRAINT "MediaChapter_order_check" CHECK ("orderIndex" >= 0),
    CONSTRAINT "MediaChapter_start_check" CHECK ("startSeconds" >= 0),
    CONSTRAINT "MediaChapter_end_check" CHECK ("endSeconds" IS NULL OR "endSeconds" > "startSeconds")
);
CREATE UNIQUE INDEX "MediaChapter_mediaAssetId_locale_orderIndex_key" ON "MediaChapter" ("mediaAssetId", "locale", "orderIndex");
CREATE INDEX "MediaChapter_organizationId_mediaAssetId_idx" ON "MediaChapter" ("organizationId", "mediaAssetId");

-- ── 4. MediaSubtitleTrack ─────────────────────────────────────────────────────
CREATE TABLE "MediaSubtitleTrack" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "label" TEXT,
    "storageKey" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'vtt',
    "byteSize" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaSubtitleTrack_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MediaSubtitleTrack_locale_check" CHECK ("locale" IN ('fa','en','de')),
    -- WebVTT only. There is no transcoder and no converter in this platform, so an
    -- unsupported container must be rejected by the constraint, not by a promise.
    CONSTRAINT "MediaSubtitleTrack_format_check" CHECK ("format" IN ('vtt')),
    CONSTRAINT "MediaSubtitleTrack_byte_size_check" CHECK ("byteSize" IS NULL OR "byteSize" >= 0)
);
CREATE UNIQUE INDEX "MediaSubtitleTrack_mediaAssetId_locale_key" ON "MediaSubtitleTrack" ("mediaAssetId", "locale");
CREATE INDEX "MediaSubtitleTrack_organizationId_mediaAssetId_idx" ON "MediaSubtitleTrack" ("organizationId", "mediaAssetId");

-- ── 5. MediaTranscript ────────────────────────────────────────────────────────
CREATE TABLE "MediaTranscript" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "wordCount" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaTranscript_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MediaTranscript_locale_check" CHECK ("locale" IN ('fa','en','de')),
    -- No speech-to-text engine exists here, so no value may claim machine generation.
    CONSTRAINT "MediaTranscript_source_check" CHECK ("source" IN ('MANUAL','IMPORTED')),
    CONSTRAINT "MediaTranscript_word_count_check" CHECK ("wordCount" IS NULL OR "wordCount" >= 0)
);
CREATE UNIQUE INDEX "MediaTranscript_mediaAssetId_locale_key" ON "MediaTranscript" ("mediaAssetId", "locale");
CREATE INDEX "MediaTranscript_organizationId_mediaAssetId_idx" ON "MediaTranscript" ("organizationId", "mediaAssetId");

-- ── 6. MediaAttachment ────────────────────────────────────────────────────────
CREATE TABLE "MediaAttachment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "locale" TEXT,
    "title" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "checksumSha256" TEXT,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAttachment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MediaAttachment_locale_check" CHECK ("locale" IS NULL OR "locale" IN ('fa','en','de')),
    CONSTRAINT "MediaAttachment_byte_size_check" CHECK ("byteSize" >= 0),
    CONSTRAINT "MediaAttachment_download_count_check" CHECK ("downloadCount" >= 0),
    CONSTRAINT "MediaAttachment_checksum_check" CHECK ("checksumSha256" IS NULL OR "checksumSha256" ~ '^[a-f0-9]{64}$')
);
CREATE INDEX "MediaAttachment_organizationId_mediaAssetId_idx" ON "MediaAttachment" ("organizationId", "mediaAssetId");

-- ── 7. MediaCategory ──────────────────────────────────────────────────────────
CREATE TABLE "MediaCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "parentId" TEXT,
    "slug" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameDe" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaCategory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MediaCategory_order_check" CHECK ("orderIndex" >= 0),
    CONSTRAINT "MediaCategory_self_parent_check" CHECK ("parentId" IS NULL OR "parentId" <> "id")
);
CREATE UNIQUE INDEX "MediaCategory_organizationId_slug_key" ON "MediaCategory" ("organizationId", "slug");
CREATE INDEX "MediaCategory_organizationId_parentId_idx" ON "MediaCategory" ("organizationId", "parentId");

-- ── 8. MediaTag ───────────────────────────────────────────────────────────────
CREATE TABLE "MediaTag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "normalizedLabel" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaTag_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MediaTag_usage_count_check" CHECK ("usageCount" >= 0)
);
CREATE UNIQUE INDEX "MediaTag_organizationId_slug_key" ON "MediaTag" ("organizationId", "slug");
CREATE UNIQUE INDEX "MediaTag_organizationId_normalizedLabel_key" ON "MediaTag" ("organizationId", "normalizedLabel");
CREATE INDEX "MediaTag_organizationId_idx" ON "MediaTag" ("organizationId");

-- ── 9. MediaTagOnAsset ────────────────────────────────────────────────────────
CREATE TABLE "MediaTagOnAsset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaTagOnAsset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MediaTagOnAsset_mediaAssetId_tagId_key" ON "MediaTagOnAsset" ("mediaAssetId", "tagId");
CREATE INDEX "MediaTagOnAsset_organizationId_tagId_idx" ON "MediaTagOnAsset" ("organizationId", "tagId");
CREATE INDEX "MediaTagOnAsset_organizationId_mediaAssetId_idx" ON "MediaTagOnAsset" ("organizationId", "mediaAssetId");

-- ── 10. MediaInstructor ───────────────────────────────────────────────────────
CREATE TABLE "MediaInstructor" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "headline" TEXT,
    "bioFa" TEXT,
    "bioEn" TEXT,
    "bioDe" TEXT,
    "avatarStorageKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaInstructor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MediaInstructor_organizationId_slug_key" ON "MediaInstructor" ("organizationId", "slug");
-- NULLs compare as distinct in a Postgres unique index, so unlinked profiles are
-- unconstrained while a linked account can hold at most one profile per tenant.
CREATE UNIQUE INDEX "MediaInstructor_organizationId_userId_key" ON "MediaInstructor" ("organizationId", "userId");
CREATE INDEX "MediaInstructor_organizationId_isActive_idx" ON "MediaInstructor" ("organizationId", "isActive");
CREATE INDEX "MediaInstructor_userId_idx" ON "MediaInstructor" ("userId");

-- ── 11. MediaSave ─────────────────────────────────────────────────────────────
CREATE TABLE "MediaSave" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaSave_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MediaSave_userId_mediaAssetId_key" ON "MediaSave" ("userId", "mediaAssetId");
CREATE INDEX "MediaSave_organizationId_userId_idx" ON "MediaSave" ("organizationId", "userId");
CREATE INDEX "MediaSave_organizationId_mediaAssetId_idx" ON "MediaSave" ("organizationId", "mediaAssetId");

-- ── 12. MediaWatchProgress ────────────────────────────────────────────────────
CREATE TABLE "MediaWatchProgress" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "positionSeconds" INTEGER NOT NULL DEFAULT 0,
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "lastWatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaWatchProgress_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MediaWatchProgress_position_check" CHECK ("positionSeconds" >= 0),
    CONSTRAINT "MediaWatchProgress_progress_check" CHECK ("progressPct" >= 0 AND "progressPct" <= 100)
);
CREATE UNIQUE INDEX "MediaWatchProgress_userId_mediaAssetId_key" ON "MediaWatchProgress" ("userId", "mediaAssetId");
CREATE INDEX "MediaWatchProgress_organizationId_userId_idx" ON "MediaWatchProgress" ("organizationId", "userId");
CREATE INDEX "MediaWatchProgress_organizationId_mediaAssetId_idx" ON "MediaWatchProgress" ("organizationId", "mediaAssetId");

-- ── 13. MediaViewEvent ────────────────────────────────────────────────────────
-- Mirrors ArticleView: an "ipHash" and NEVER a raw IP address. "userId" is nullable
-- so an anonymous play is recorded without inventing an identity (§8).
CREATE TABLE "MediaViewEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "userId" TEXT,
    "ipHash" TEXT,
    "eventType" TEXT NOT NULL,
    "positionSeconds" INTEGER,
    "locale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaViewEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MediaViewEvent_event_type_check" CHECK ("eventType" IN ('PLAY','PROGRESS','COMPLETE')),
    -- Structurally rejects a raw IPv4/IPv6 literal being written into this column.
    CONSTRAINT "MediaViewEvent_ip_hash_check" CHECK ("ipHash" IS NULL OR "ipHash" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "MediaViewEvent_locale_check" CHECK ("locale" IS NULL OR "locale" IN ('fa','en','de')),
    CONSTRAINT "MediaViewEvent_position_check" CHECK ("positionSeconds" IS NULL OR "positionSeconds" >= 0)
);
CREATE INDEX "MediaViewEvent_organizationId_mediaAssetId_createdAt_idx" ON "MediaViewEvent" ("organizationId", "mediaAssetId", "createdAt");
CREATE INDEX "MediaViewEvent_organizationId_createdAt_idx" ON "MediaViewEvent" ("organizationId", "createdAt");
CREATE INDEX "MediaViewEvent_organizationId_eventType_createdAt_idx" ON "MediaViewEvent" ("organizationId", "eventType", "createdAt");

-- ── 14. MediaEditorialEvent ───────────────────────────────────────────────────
-- Append-only accountability record for every lifecycle transition (§11).
CREATE TABLE "MediaEditorialEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaEditorialEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MediaEditorialEvent_from_status_check" CHECK ("fromStatus" IS NULL OR "fromStatus" IN ('DRAFT','SUBMITTED','IN_REVIEW','PUBLISHED','REJECTED','ARCHIVED')),
    CONSTRAINT "MediaEditorialEvent_to_status_check" CHECK ("toStatus" IN ('DRAFT','SUBMITTED','IN_REVIEW','PUBLISHED','REJECTED','ARCHIVED')),
    CONSTRAINT "MediaEditorialEvent_action_check" CHECK ("action" IN ('SUBMIT','START_REVIEW','PUBLISH','REJECT','ARCHIVE','RESTORE'))
);
CREATE INDEX "MediaEditorialEvent_organizationId_mediaAssetId_createdAt_idx" ON "MediaEditorialEvent" ("organizationId", "mediaAssetId", "createdAt");
CREATE INDEX "MediaEditorialEvent_organizationId_toStatus_createdAt_idx" ON "MediaEditorialEvent" ("organizationId", "toStatus", "createdAt");

-- ── 15. Tenant ownership — deleting an organization removes all Phase 102 data ─
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaAssetTranslation" ADD CONSTRAINT "MediaAssetTranslation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaChapter" ADD CONSTRAINT "MediaChapter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaSubtitleTrack" ADD CONSTRAINT "MediaSubtitleTrack_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaTranscript" ADD CONSTRAINT "MediaTranscript_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaAttachment" ADD CONSTRAINT "MediaAttachment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaCategory" ADD CONSTRAINT "MediaCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaTag" ADD CONSTRAINT "MediaTag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaTagOnAsset" ADD CONSTRAINT "MediaTagOnAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaInstructor" ADD CONSTRAINT "MediaInstructor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaSave" ADD CONSTRAINT "MediaSave_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaWatchProgress" ADD CONSTRAINT "MediaWatchProgress_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaViewEvent" ADD CONSTRAINT "MediaViewEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaEditorialEvent" ADD CONSTRAINT "MediaEditorialEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 16. Asset ownership — a child never outlives the media record it describes ─
ALTER TABLE "MediaAssetTranslation" ADD CONSTRAINT "MediaAssetTranslation_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaChapter" ADD CONSTRAINT "MediaChapter_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaSubtitleTrack" ADD CONSTRAINT "MediaSubtitleTrack_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaTranscript" ADD CONSTRAINT "MediaTranscript_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaAttachment" ADD CONSTRAINT "MediaAttachment_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaTagOnAsset" ADD CONSTRAINT "MediaTagOnAsset_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaTagOnAsset" ADD CONSTRAINT "MediaTagOnAsset_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "MediaTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaSave" ADD CONSTRAINT "MediaSave_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaWatchProgress" ADD CONSTRAINT "MediaWatchProgress_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaViewEvent" ADD CONSTRAINT "MediaViewEvent_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaEditorialEvent" ADD CONSTRAINT "MediaEditorialEvent_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 17. Subject binding — private history dies with the account ────────────────
ALTER TABLE "MediaSave" ADD CONSTRAINT "MediaSave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaWatchProgress" ADD CONSTRAINT "MediaWatchProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 18. Optional parents — SET NULL, never a cascade delete ───────────────────
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "IndustrialSite" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MediaCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "MediaInstructor" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MediaCategory" ADD CONSTRAINT "MediaCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MediaCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MediaInstructor" ADD CONSTRAINT "MediaInstructor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MediaViewEvent" ADD CONSTRAINT "MediaViewEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
