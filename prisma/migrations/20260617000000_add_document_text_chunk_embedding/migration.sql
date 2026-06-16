-- Phase 16D: chunk embedding storage (additive).
--
-- Hand-authored, NOT generated/applied — same discipline as every prior
-- migration in this project (no live database is reachable here).
--
-- The `vector` extension already exists by this point (created in
-- 20260616000000_add_document_chunk_pgvector, which runs before this
-- migration), so it is not re-created here.

-- AlterTable
ALTER TABLE "DocumentTextChunk" ADD COLUMN "embedding" vector(64);
ALTER TABLE "DocumentTextChunk" ADD COLUMN "embeddingModel" TEXT;
ALTER TABLE "DocumentTextChunk" ADD COLUMN "embeddingDimensions" INTEGER;

-- CreateIndex: approximate-nearest-neighbor index for the cosine-distance
-- search chunk-vector-store.ts queries with (the `<=>` operator). Safe on
-- a nullable vector column — rows with no embedding yet are simply
-- excluded from the index, not an error.
CREATE INDEX "DocumentTextChunk_embedding_hnsw_idx" ON "DocumentTextChunk"
    USING hnsw ("embedding" vector_cosine_ops);
