-- Phase 72.5: Hermes Industrial Journal & Expert Network
-- Non-destructive: only new enums + tables

CREATE TYPE "ArtLanguage"    AS ENUM ('EN','FA');
CREATE TYPE "ArtStatus"      AS ENUM ('DRAFT','SUBMITTED','IN_REVIEW','PUBLISHED','REJECTED','ARCHIVED');
CREATE TYPE "ArtVisibility"  AS ENUM ('PUBLIC','UNLISTED','PRIVATE');
CREATE TYPE "ArtContentType" AS ENUM (
  'TECHNICAL_ARTICLE','INDUSTRIAL_CASE_STUDY','TROUBLESHOOTING_REPORT',
  'PROJECT_REPORT','MAINTENANCE_INSIGHT','PLC_SCADA_TUTORIAL','FAILURE_ANALYSIS',
  'ASSET_RELIABILITY_NOTE','ENGINEERING_OPINION','RESEARCH_SUMMARY',
  'FIELD_COMMISSIONING_NOTE','SAFETY_COMPLIANCE_NOTE'
);
CREATE TYPE "ArtReactionType" AS ENUM ('INSIGHTFUL','HELPFUL','DETAILED','PRACTICAL');

CREATE TABLE "ArticleAuthorProfile" (
  "id"                         TEXT        NOT NULL,
  "userId"                     TEXT        NOT NULL,
  "handle"                     TEXT        NOT NULL,
  "displayName"                TEXT        NOT NULL,
  "headline"                   TEXT,
  "bio"                        TEXT,
  "company"                    TEXT,
  "roleTitle"                  TEXT,
  "expertiseAreas"             TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  "location"                   TEXT,
  "avatarUrl"                  TEXT,
  "bannerUrl"                  TEXT,
  "followerCount"              INTEGER     NOT NULL DEFAULT 0,
  "articleCount"               INTEGER     NOT NULL DEFAULT 0,
  "totalViews"                 INTEGER     NOT NULL DEFAULT 0,
  "totalSaves"                 INTEGER     NOT NULL DEFAULT 0,
  "verifiedExpert"             BOOLEAN     NOT NULL DEFAULT false,
  "industrialCredibilityScore" DOUBLE PRECISION,
  "isActive"                   BOOLEAN     NOT NULL DEFAULT true,
  "createdAt"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ArticleAuthorProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ArticleAuthorProfile_userId_key"  ON "ArticleAuthorProfile"("userId");
CREATE UNIQUE INDEX "ArticleAuthorProfile_handle_key" ON "ArticleAuthorProfile"("handle");
CREATE INDEX "ArticleAuthorProfile_handle_idx"         ON "ArticleAuthorProfile"("handle");
CREATE INDEX "ArticleAuthorProfile_userId_idx"         ON "ArticleAuthorProfile"("userId");

CREATE TABLE "ArticleCategory" (
  "id"          TEXT         NOT NULL,
  "slug"        TEXT         NOT NULL,
  "name"        TEXT         NOT NULL,
  "nameFa"      TEXT         NOT NULL,
  "description" TEXT,
  "color"       TEXT         NOT NULL DEFAULT 'signal',
  "isActive"    BOOLEAN      NOT NULL DEFAULT true,
  "sortOrder"   INTEGER      NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ArticleCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ArticleCategory_slug_key" ON "ArticleCategory"("slug");
CREATE INDEX "ArticleCategory_slug_idx"         ON "ArticleCategory"("slug");

CREATE TABLE "ArticleTag" (
  "id"        TEXT         NOT NULL,
  "slug"      TEXT         NOT NULL,
  "name"      TEXT         NOT NULL,
  "nameFa"    TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArticleTag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ArticleTag_slug_key" ON "ArticleTag"("slug");
CREATE INDEX "ArticleTag_slug_idx"         ON "ArticleTag"("slug");

CREATE TABLE "Article" (
  "id"                 TEXT             NOT NULL,
  "title"              TEXT             NOT NULL,
  "slug"               TEXT             NOT NULL,
  "subtitle"           TEXT,
  "excerpt"            TEXT,
  "content"            TEXT             NOT NULL,
  "coverImageUrl"      TEXT,
  "language"           "ArtLanguage"    NOT NULL DEFAULT 'EN',
  "contentType"        "ArtContentType" NOT NULL DEFAULT 'TECHNICAL_ARTICLE',
  "status"             "ArtStatus"      NOT NULL DEFAULT 'DRAFT',
  "visibility"         "ArtVisibility"  NOT NULL DEFAULT 'PUBLIC',
  "authorId"           TEXT             NOT NULL,
  "categoryId"         TEXT,
  "readingTimeMinutes" INTEGER          NOT NULL DEFAULT 5,
  "publishedAt"        TIMESTAMP(3),
  "viewCount"          INTEGER          NOT NULL DEFAULT 0,
  "saveCount"          INTEGER          NOT NULL DEFAULT 0,
  "reactionCount"      INTEGER          NOT NULL DEFAULT 0,
  "commentCount"       INTEGER          NOT NULL DEFAULT 0,
  "shareCount"         INTEGER          NOT NULL DEFAULT 0,
  "seoTitle"           TEXT,
  "seoDescription"     TEXT,
  "canonicalUrl"       TEXT,
  "ogImageUrl"         TEXT,
  "noIndex"            BOOLEAN          NOT NULL DEFAULT false,
  "rejectionReason"    TEXT,
  "isActive"           BOOLEAN          NOT NULL DEFAULT true,
  "createdAt"          TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3)     NOT NULL,
  CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Article_slug_key"              ON "Article"("slug");
CREATE INDEX "Article_status_visibility_idx"        ON "Article"("status","visibility");
CREATE INDEX "Article_authorId_idx"                 ON "Article"("authorId");
CREATE INDEX "Article_categoryId_idx"               ON "Article"("categoryId");
CREATE INDEX "Article_slug_idx"                     ON "Article"("slug");
CREATE INDEX "Article_publishedAt_idx"              ON "Article"("publishedAt");
CREATE INDEX "Article_language_idx"                 ON "Article"("language");
ALTER TABLE "Article" ADD CONSTRAINT "Article_authorId_fkey"   FOREIGN KEY ("authorId")   REFERENCES "ArticleAuthorProfile"("id") ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "Article" ADD CONSTRAINT "Article_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ArticleCategory"("id")       ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ArticleTagOnArticle" (
  "articleId" TEXT NOT NULL,
  "tagId"     TEXT NOT NULL,
  CONSTRAINT "ArticleTagOnArticle_pkey" PRIMARY KEY ("articleId","tagId")
);
CREATE INDEX "ArticleTagOnArticle_articleId_idx" ON "ArticleTagOnArticle"("articleId");
CREATE INDEX "ArticleTagOnArticle_tagId_idx"     ON "ArticleTagOnArticle"("tagId");
ALTER TABLE "ArticleTagOnArticle" ADD CONSTRAINT "ArticleTagOnArticle_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id")    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArticleTagOnArticle" ADD CONSTRAINT "ArticleTagOnArticle_tagId_fkey"     FOREIGN KEY ("tagId")     REFERENCES "ArticleTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ArticleFollow" (
  "id"          TEXT         NOT NULL,
  "followerId"  TEXT         NOT NULL,
  "followingId" TEXT         NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArticleFollow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ArticleFollow_followerId_followingId_key" ON "ArticleFollow"("followerId","followingId");
CREATE INDEX "ArticleFollow_followerId_idx"  ON "ArticleFollow"("followerId");
CREATE INDEX "ArticleFollow_followingId_idx" ON "ArticleFollow"("followingId");
ALTER TABLE "ArticleFollow" ADD CONSTRAINT "ArticleFollow_followerId_fkey"  FOREIGN KEY ("followerId")  REFERENCES "ArticleAuthorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArticleFollow" ADD CONSTRAINT "ArticleFollow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "ArticleAuthorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ArticleSave" (
  "id"        TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "articleId" TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArticleSave_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ArticleSave_userId_articleId_key" ON "ArticleSave"("userId","articleId");
CREATE INDEX "ArticleSave_userId_idx"    ON "ArticleSave"("userId");
CREATE INDEX "ArticleSave_articleId_idx" ON "ArticleSave"("articleId");
ALTER TABLE "ArticleSave" ADD CONSTRAINT "ArticleSave_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ArticleReaction" (
  "id"           TEXT             NOT NULL,
  "userId"       TEXT             NOT NULL,
  "articleId"    TEXT             NOT NULL,
  "reactionType" "ArtReactionType" NOT NULL,
  "createdAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArticleReaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ArticleReaction_userId_articleId_key" ON "ArticleReaction"("userId","articleId");
CREATE INDEX "ArticleReaction_articleId_idx" ON "ArticleReaction"("articleId");
ALTER TABLE "ArticleReaction" ADD CONSTRAINT "ArticleReaction_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ArticleComment" (
  "id"        TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "articleId" TEXT         NOT NULL,
  "parentId"  TEXT,
  "content"   TEXT         NOT NULL,
  "isActive"  BOOLEAN      NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ArticleComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ArticleComment_articleId_idx" ON "ArticleComment"("articleId");
CREATE INDEX "ArticleComment_userId_idx"    ON "ArticleComment"("userId");
ALTER TABLE "ArticleComment" ADD CONSTRAINT "ArticleComment_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id")      ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "ArticleComment" ADD CONSTRAINT "ArticleComment_parentId_fkey"  FOREIGN KEY ("parentId")  REFERENCES "ArticleComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ArticleView" (
  "id"        TEXT         NOT NULL,
  "articleId" TEXT         NOT NULL,
  "userId"    TEXT,
  "ipHash"    TEXT,
  "userAgent" TEXT,
  "viewedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArticleView_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ArticleView_articleId_idx" ON "ArticleView"("articleId");
CREATE INDEX "ArticleView_viewedAt_idx"  ON "ArticleView"("viewedAt");
ALTER TABLE "ArticleView" ADD CONSTRAINT "ArticleView_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ArticleShare" (
  "id"        TEXT         NOT NULL,
  "articleId" TEXT         NOT NULL,
  "userId"    TEXT,
  "platform"  TEXT         NOT NULL DEFAULT 'COPY',
  "sharedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArticleShare_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ArticleShare_articleId_idx" ON "ArticleShare"("articleId");
ALTER TABLE "ArticleShare" ADD CONSTRAINT "ArticleShare_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ArticleReport" (
  "id"         TEXT         NOT NULL,
  "articleId"  TEXT         NOT NULL,
  "reporterId" TEXT         NOT NULL,
  "reason"     TEXT         NOT NULL,
  "detail"     TEXT,
  "resolved"   BOOLEAN      NOT NULL DEFAULT false,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ArticleReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ArticleReport_articleId_idx" ON "ArticleReport"("articleId");
CREATE INDEX "ArticleReport_resolved_idx"  ON "ArticleReport"("resolved");
ALTER TABLE "ArticleReport" ADD CONSTRAINT "ArticleReport_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ArticleModerationEvent" (
  "id"          TEXT         NOT NULL,
  "articleId"   TEXT         NOT NULL,
  "moderatorId" TEXT         NOT NULL,
  "action"      TEXT         NOT NULL,
  "reason"      TEXT,
  "metadata"    JSONB        NOT NULL DEFAULT '{}',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArticleModerationEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ArticleModerationEvent_articleId_idx" ON "ArticleModerationEvent"("articleId");
ALTER TABLE "ArticleModerationEvent" ADD CONSTRAINT "ArticleModerationEvent_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ArticleEditorialReview" (
  "id"         TEXT         NOT NULL,
  "articleId"  TEXT         NOT NULL,
  "reviewerId" TEXT         NOT NULL,
  "verdict"    TEXT         NOT NULL,
  "feedback"   TEXT,
  "quality"    INTEGER,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ArticleEditorialReview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ArticleEditorialReview_articleId_idx" ON "ArticleEditorialReview"("articleId");
ALTER TABLE "ArticleEditorialReview" ADD CONSTRAINT "ArticleEditorialReview_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ArticleQualitySignal" (
  "id"         TEXT             NOT NULL,
  "articleId"  TEXT             NOT NULL,
  "signalType" TEXT             NOT NULL,
  "score"      DOUBLE PRECISION NOT NULL,
  "computedBy" TEXT             NOT NULL DEFAULT 'SYSTEM',
  "computedAt" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArticleQualitySignal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ArticleQualitySignal_articleId_idx" ON "ArticleQualitySignal"("articleId");
ALTER TABLE "ArticleQualitySignal" ADD CONSTRAINT "ArticleQualitySignal_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ArticleKnowledgeMetadata" (
  "id"                     TEXT             NOT NULL,
  "articleId"              TEXT             NOT NULL,
  "knowledgeEligible"      BOOLEAN          NOT NULL DEFAULT false,
  "reviewedForKnowledge"   BOOLEAN          NOT NULL DEFAULT false,
  "articleQualityScore"    DOUBLE PRECISION,
  "sourceReliability"      TEXT,
  "evidenceLevel"          TEXT,
  "industrialDomain"       TEXT,
  "linkedAssetType"        TEXT,
  "linkedFailureMode"      TEXT,
  "linkedTechnology"       TEXT,
  "linkedStandard"         TEXT,
  "linkedVendor"           TEXT,
  "linkedPLCPlatform"      TEXT,
  "linkedMaintenanceDomain" TEXT,
  "safetyCritical"         BOOLEAN          NOT NULL DEFAULT false,
  "humanReviewed"          BOOLEAN          NOT NULL DEFAULT false,
  "createdAt"              TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3)     NOT NULL,
  CONSTRAINT "ArticleKnowledgeMetadata_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ArticleKnowledgeMetadata_articleId_key" ON "ArticleKnowledgeMetadata"("articleId");
ALTER TABLE "ArticleKnowledgeMetadata" ADD CONSTRAINT "ArticleKnowledgeMetadata_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ArticleReadingHistory" (
  "id"          TEXT         NOT NULL,
  "userId"      TEXT         NOT NULL,
  "articleId"   TEXT         NOT NULL,
  "progressPct" INTEGER      NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP(3),
  "lastReadAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArticleReadingHistory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ArticleReadingHistory_userId_articleId_key" ON "ArticleReadingHistory"("userId","articleId");
CREATE INDEX "ArticleReadingHistory_userId_idx"    ON "ArticleReadingHistory"("userId");
CREATE INDEX "ArticleReadingHistory_articleId_idx" ON "ArticleReadingHistory"("articleId");
ALTER TABLE "ArticleReadingHistory" ADD CONSTRAINT "ArticleReadingHistory_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
