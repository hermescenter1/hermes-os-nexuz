-- Phase 17C: resize DocumentTextChunk.embedding from vector(64) to vector(1536).
--
-- Destroys existing 64-dim mock embeddings (expected — mock vectors have no
-- semantic content; documents will need re-processing after this migration).
--
-- Skips vector DDL gracefully when pgvector is unavailable (shadow database).

DO $pgvector_migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE NOTICE 'pgvector not available — skipping embedding resize';
    RETURN;
  END IF;

  -- Step 1: drop HNSW index (required before altering the column it covers)
  EXECUTE $$DROP INDEX IF EXISTS "DocumentTextChunk_embedding_hnsw_idx"$$;

  -- Step 2: drop 64-dim column (pgvector cannot alter vector dimensions in-place)
  EXECUTE $$ALTER TABLE "DocumentTextChunk" DROP COLUMN IF EXISTS "embedding"$$;

  -- Step 3: add 1536-dim column (nullable — existing rows get NULL)
  EXECUTE $$ALTER TABLE "DocumentTextChunk" ADD COLUMN "embedding" vector(1536)$$;

  -- Step 5: recreate HNSW index for 1536-dim column
  EXECUTE $$
    CREATE INDEX IF NOT EXISTS "DocumentTextChunk_embedding_hnsw_idx"
      ON "DocumentTextChunk" USING hnsw ("embedding" vector_cosine_ops)
  $$;
END $pgvector_migration$;

-- Step 4: reset Document status so admins see which documents need re-processing.
-- Done outside the pgvector block — safe even when vector columns were skipped.
UPDATE "Document"
SET status = 'uploaded', "lastProcessedAt" = NULL
WHERE status IN ('indexed', 'embedded', 'embedding');
