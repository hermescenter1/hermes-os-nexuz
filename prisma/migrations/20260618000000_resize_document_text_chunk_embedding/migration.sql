-- Phase 17C: resize DocumentTextChunk.embedding from vector(64) to vector(1536).
--
-- Hand-authored, NOT generated/applied — same discipline as every prior
-- migration in this project (no live database is reachable here).
--
-- Destroys all existing 64-dim mock embeddings (expected and safe — mock
-- vectors have no semantic content; documents that were previously "indexed"
-- will need to be re-processed after this migration is applied).
--
-- The `vector` extension already exists by this point (created in
-- 20260616000000_add_document_chunk_pgvector, which runs before this
-- migration), so it is not re-created here.

-- Step 1: drop the HNSW index (required before altering the column it covers)
DROP INDEX IF EXISTS "DocumentTextChunk_embedding_hnsw_idx";

-- Step 2: drop the 64-dim column (pgvector vector(N) cannot be altered to
-- a different dimension in-place without rewriting every row)
ALTER TABLE "DocumentTextChunk" DROP COLUMN IF EXISTS "embedding";

-- Step 3: add the 1536-dim column (nullable — existing rows get NULL;
-- documents must be re-processed for their chunks to receive new embeddings)
ALTER TABLE "DocumentTextChunk" ADD COLUMN "embedding" vector(1536);

-- Step 4: reset Document status so admins see which documents need
-- re-processing (status "indexed" / "embedded" with NULL embeddings is
-- misleading — reset them to "uploaded" so the admin UI surfaces the gap)
UPDATE "Document"
SET status = 'uploaded', "lastProcessedAt" = NULL
WHERE status IN ('indexed', 'embedded', 'embedding');

-- Step 5: recreate the HNSW index for the new 1536-dim column
CREATE INDEX "DocumentTextChunk_embedding_hnsw_idx" ON "DocumentTextChunk"
    USING hnsw ("embedding" vector_cosine_ops);
