import { getPrisma } from "@/lib/db/prisma";
import type { RagChunk, RagEmbedding, RagSearchResult, VectorStore } from "./types";

/**
 * pgvector-backed vector store architecture (Phase 14B).
 *
 * Talks to PostgreSQL via the exact same dynamically-loaded Prisma client
 * every other repository in this codebase already uses (`getPrisma()`),
 * issuing raw SQL against a `DocumentChunk` table with a pgvector
 * `embedding` column and pgvector's cosine-distance operator (`<=>`).
 *
 * IMPORTANT — this table and the pgvector extension DO NOT EXIST YET. No
 * Prisma schema change and no migration were made in this phase (explicitly
 * out of scope — see the Phase 14 architecture audit's schema-first
 * sequencing recommendation: extension + migration is its own later step).
 * Every method below therefore degrades safely to a no-op/empty result
 * today — `getPrisma()` returns null without `DATABASE_URL`, and even with
 * a real database configured, the query fails because the table doesn't
 * exist, which is caught and degrades the same way. This mirrors exactly
 * how `case-repository.ts`/`db-bridge.ts` degrade when their schema isn't
 * reachable: the architecture is real and ready: the schema is a separate,
 * deliberate next step, not assumed to exist by this code.
 *
 * Real persistence/ingestion (populate the table once via a batch job,
 * query it across many later requests) is also not implemented here — this
 * store is used by `runRagPipeline()` exactly like the in-memory store is:
 * documents passed into one pipeline call are added, then searched, within
 * that same call. Building a durable ingestion entrypoint is a separate,
 * later phase.
 */

const TABLE = "DocumentChunk"; // matches Prisma's default model->table naming if/when the model is added

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
