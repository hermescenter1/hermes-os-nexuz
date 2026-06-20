-- Phase 14C: RAG persistence layer (additive; not wired into /api/brain).
--
-- Hand-authored migration. Uses a DO block so this migration is safe to apply
-- on PostgreSQL servers without the pgvector extension (e.g. the Prisma shadow
-- database during `migrate dev`). If the extension is unavailable the
-- DocumentChunk table is simply not created, and every method in
-- src/lib/rag/vector-store-pgvector.ts degrades gracefully to no-op/empty.
--
-- On a production server that HAS pgvector (Supabase, Neon, RDS 15+, or
-- self-managed with pgvector installed), this migration creates the extension,
-- table, and HNSW index in full. Re-running is safe — all statements use
-- IF NOT EXISTS guards.

DO $pgvector_migration$
DECLARE
  has_vector boolean := false;
BEGIN
  -- Attempt to load the extension. Silently skip if not installed on this server.
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
    has_vector := true;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE
      'pgvector extension not available on this PostgreSQL server — '
      'DocumentChunk table will not be created. RAG/vector-search features '
      'will be disabled. Install pgvector and re-run migrations to enable them.';
  END;

  IF NOT has_vector THEN
    RETURN;
  END IF;

  -- Create DocumentChunk only when the vector type is available.
  -- All DDL is inside EXECUTE so the vector(1536) type reference is resolved
  -- at runtime, after the extension is confirmed present.
  EXECUTE $ddl$
    CREATE TABLE IF NOT EXISTS "DocumentChunk" (
        "id"         TEXT NOT NULL,
        "documentId" TEXT NOT NULL,
        "sourceType" TEXT NOT NULL,
        "text"       TEXT NOT NULL,
        "position"   INTEGER NOT NULL,
        "metadata"   JSONB NOT NULL DEFAULT '{}',
        "model"      TEXT NOT NULL,
        "dimensions" INTEGER NOT NULL,
        "embedding"  vector(1536) NOT NULL,
        "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"  TIMESTAMP(3) NOT NULL,

        CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
    )
  $ddl$;

  EXECUTE $ddl$
    CREATE INDEX IF NOT EXISTS "DocumentChunk_documentId_idx"
      ON "DocumentChunk"("documentId")
  $ddl$;

  EXECUTE $ddl$
    CREATE INDEX IF NOT EXISTS "DocumentChunk_sourceType_idx"
      ON "DocumentChunk"("sourceType")
  $ddl$;

  -- HNSW approximate-nearest-neighbour index for cosine-distance search.
  -- Chosen over ivfflat: no training/list-count tuning, better recall at
  -- small-to-medium corpus sizes.
  EXECUTE $ddl$
    CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_hnsw_idx"
      ON "DocumentChunk" USING hnsw ("embedding" vector_cosine_ops)
  $ddl$;

END $pgvector_migration$;
