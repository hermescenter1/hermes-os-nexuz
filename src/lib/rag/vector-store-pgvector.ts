import { getPrisma } from "@/lib/db/prisma";
import { PGVECTOR_DIMENSIONS } from "./config";
import type { RagChunk, RagEmbedding, RagSearchResult, VectorStore } from "./types";

/**
 * pgvector-backed vector store (Phase 14B architecture; Phase 14C adds the
 * real schema/migration this code targets).
 *
 * Talks to PostgreSQL via the exact same dynamically-loaded Prisma client
 * every other repository in this codebase already uses (`getPrisma()`),
 * issuing raw SQL against the `DocumentChunk` table (prisma/schema.prisma)
 * with a pgvector `embedding` column and pgvector's cosine-distance
 * operator (`<=>`).
 *
 * IMPORTANT — the migration that creates this table
 * (prisma/migrations/20260616000000_add_document_chunk_pgvector) has been
 * authored but NOT applied to any database in this environment (no live
 * Postgres connection exists here; applying a migration to a real database
 * is a deliberate, separate operational step — `npx prisma migrate deploy`
 * — never run automatically by this code). Until it's applied, every
 * method below degrades safely to a no-op/empty result: `getPrisma()`
 * returns null without `DATABASE_URL`, and even with a real database
 * configured but the migration unapplied, the query fails because the
 * table doesn't exist — caught, and degrades the same way. This mirrors
 * exactly how `case-repository.ts`/`db-bridge.ts` degrade when their
 * schema isn't reachable.
 *
 * Dimension strategy: every `add()` call is rejected (silently, like any
 * other degrade path — see `PGVECTOR_DIMENSIONS`'s doc comment in
 * config.ts) unless `embedding.dimensions === PGVECTOR_DIMENSIONS`.
 * Embeddings from a different model occupy a different, incomparable
 * vector space — storing them in the same column as if they were
 * comparable would silently corrupt every future similarity search, which
 * is a worse failure mode than simply not storing them. The same check
 * guards `search()`'s query vector.
 *
 * Real persistence/ingestion (populate the table once via a batch job,
 * query it across many later requests) is also not implemented here — this
 * store is used by `runRagPipeline()` exactly like the in-memory store is:
 * documents passed into one pipeline call are added, then searched, within
 * that same call. Building a durable ingestion entrypoint is a separate,
 * later phase (explicitly stopped before in Phase 14C).
 */

const TABLE = "DocumentChunk"; // matches prisma/schema.prisma's DocumentChunk model

interface PrismaRawClient {
  $queryRawUnsafe?: (query: string, ...params: unknown[]) => Promise<unknown[]>;
  $executeRawUnsafe?: (query: string, ...params: unknown[]) => Promise<number>;
}

async function rawClient(): Promise<PrismaRawClient | null> {
  const db = await getPrisma();
  return db ? (db as unknown as PrismaRawClient) : null;
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

export function createPgVectorStore(): VectorStore {
  return {
    async add(chunk: RagChunk, embedding: RagEmbedding): Promise<void> {
      if (embedding.dimensions !== PGVECTOR_DIMENSIONS) {
        // A different model's vector space — never store it as if it were
        // comparable to PGVECTOR_DIMENSIONS-wide embeddings. See this
        // file's header and config.ts's PGVECTOR_DIMENSIONS doc comment.
        return;
      }
      const db = await rawClient();
      if (!db?.$executeRawUnsafe) return; // no database configured — safe no-op
      try {
        await db.$executeRawUnsafe(
          `INSERT INTO "${TABLE}"
             (id, "documentId", "sourceType", text, position, metadata, embedding, model, dimensions)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::vector, $8, $9)
           ON CONFLICT (id) DO UPDATE SET
             text = EXCLUDED.text,
             embedding = EXCLUDED.embedding,
             metadata = EXCLUDED.metadata,
             model = EXCLUDED.model,
             dimensions = EXCLUDED.dimensions`,
          chunk.id,
          chunk.documentId,
          chunk.sourceType,
          chunk.text,
          chunk.position,
          JSON.stringify(chunk.metadata ?? {}),
          toVectorLiteral(embedding.vector),
          embedding.model,
          embedding.dimensions
        );
      } catch {
        // Table/extension not provisioned yet (or any other failure) —
        // best-effort, exactly like every other repository in this app.
      }
    },

    async search({ vector, topK, filters }): Promise<RagSearchResult[]> {
      if (vector.length !== PGVECTOR_DIMENSIONS) {
        // A query embedding from a different model/dimension can never be
        // meaningfully compared against PGVECTOR_DIMENSIONS-wide rows —
        // pgvector would itself reject this at the SQL level; failing
        // fast here avoids a wasted round trip and is unambiguous about why.
        return [];
      }
      const db = await rawClient();
      if (!db?.$queryRawUnsafe) return []; // no database configured — safe empty result
      try {
        const params: unknown[] = [toVectorLiteral(vector)];
        const whereClauses: string[] = [];
        if (filters) {
          for (const [key, value] of Object.entries(filters)) {
            params.push(value);
            // Metadata filter values are bound as parameters; only the
            // (developer-controlled, never user-controlled) key name is
            // interpolated into the JSON path expression.
            whereClauses.push(`metadata ->> '${key}' = $${params.length}`);
          }
        }
        params.push(Math.max(0, topK));
        const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

        const rows = (await db.$queryRawUnsafe(
          `SELECT id, "documentId", "sourceType", text, position, metadata,
                  1 - (embedding <=> $1::vector) AS score
           FROM "${TABLE}"
           ${where}
           ORDER BY embedding <=> $1::vector
           LIMIT $${params.length}`,
          ...params
        )) as Array<Record<string, unknown>>;

        return rows.map((r) => ({
          chunk: {
            id: String(r.id),
            documentId: String(r.documentId),
            sourceType: String(r.sourceType),
            text: String(r.text),
            position: Number(r.position),
            metadata: (r.metadata as Record<string, unknown>) ?? {},
          },
          score: Number(r.score),
        }));
      } catch {
        // Table/extension not provisioned yet (or any other failure) —
        // degrade to "no vector evidence" rather than blocking the caller.
        return [];
      }
    },
  };
}
