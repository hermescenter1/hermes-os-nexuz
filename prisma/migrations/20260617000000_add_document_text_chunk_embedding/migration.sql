-- Phase 16D: chunk embedding storage (additive).
--
-- The vector extension was created in 20260616000000_add_document_chunk_pgvector.
-- On servers without pgvector (e.g. shadow database) the previous migration
-- already skipped its work; this migration likewise skips vector columns
-- when the extension is unavailable.

DO $pgvector_migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE NOTICE 'pgvector not available — skipping DocumentTextChunk embedding columns';
    RETURN;
  END IF;

  EXECUTE $$ALTER TABLE "DocumentTextChunk" ADD COLUMN IF NOT EXISTS "embedding"           vector(64)$$;
  EXECUTE $$ALTER TABLE "DocumentTextChunk" ADD COLUMN IF NOT EXISTS "embeddingModel"       TEXT$$;
  EXECUTE $$ALTER TABLE "DocumentTextChunk" ADD COLUMN IF NOT EXISTS "embeddingDimensions"  INTEGER$$;

  -- HNSW approximate-nearest-neighbour index for cosine-distance search.
  -- Safe on a nullable column — rows without embeddings are excluded from the index.
  EXECUTE $$
    CREATE INDEX IF NOT EXISTS "DocumentTextChunk_embedding_hnsw_idx"
      ON "DocumentTextChunk" USING hnsw ("embedding" vector_cosine_ops)
  $$;
END $pgvector_migration$;
