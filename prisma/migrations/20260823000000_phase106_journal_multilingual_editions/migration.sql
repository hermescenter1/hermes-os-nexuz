-- PHASE 106 — Hermes Journal multilingual editions
--
-- Three changes, all additive or constraint-widening. Nothing is dropped that
-- carries data, and no row is written, updated or deleted by this migration.
--
-- 1. ArtLanguage gains DE.
--    German has been an ACTIVE public locale since Phase 87L.6 (routing,
--    hreflang, sitemap, IndexNow all handle /de), but a German-language article
--    was not representable because the enum stopped at EN/FA. On PostgreSQL 12+
--    `ALTER TYPE ... ADD VALUE` is transaction-safe as long as the new value is
--    not USED in the same transaction — this migration only declares it.
--
-- 2. Article.slug: global UNIQUE -> composite UNIQUE (slug, language).
--    The slug becomes the translation-group key: the fa/en/de editions of one
--    article share a slug and differ by language, which is precisely what the
--    existing SEO layer already claims (buildMetadata emits reciprocal hreflang
--    for /fa|/en|/de at the SAME path, and lib/articles/seo.ts emits the same
--    three sitemap URLs per article).
--
--    WIDENING, NOT WEAKENING: every (slug, language) pair stays unique, and the
--    pre-existing data trivially satisfies it because each slug was previously
--    globally unique and therefore appears at most once per language. No
--    conflict is possible, so no data repair step is required.
--
--    ROLLBACK: DROP the composite index and recreate the single-column unique.
--    That is safe only while no slug is yet shared by two languages — i.e.
--    before the Phase 106 content import runs. After the import, rolling back
--    the constraint requires removing the non-default-language editions first.
--
-- 3. ArticleCategory gains a nullable German label.
--    Category names are rendered into <title> and breadcrumbs on /de pages,
--    which previously fell back to the English name. Nullable so existing rows
--    remain valid and keep their current fallback behaviour.

-- 1. New enum member ---------------------------------------------------------
ALTER TYPE "ArtLanguage" ADD VALUE IF NOT EXISTS 'DE';

-- 2. Slug uniqueness becomes per-language ------------------------------------
DROP INDEX IF EXISTS "Article_slug_key";
CREATE UNIQUE INDEX "Article_slug_language_key" ON "Article"("slug", "language");

-- Serving one language of the published feed, newest first, is the Journal's
-- hottest read path once the corpus is trilingual.
CREATE INDEX IF NOT EXISTS "Article_status_visibility_language_publishedAt_idx"
  ON "Article"("status", "visibility", "language", "publishedAt");

-- 3. German category label ---------------------------------------------------
ALTER TABLE "ArticleCategory" ADD COLUMN IF NOT EXISTS "nameDe" TEXT;
