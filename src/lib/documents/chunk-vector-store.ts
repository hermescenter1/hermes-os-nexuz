import { getPrisma } from "@/lib/db/prisma";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { DOCUMENT_CHUNK_EMBEDDING_DIMENSIONS } from "./config";
import type { DocumentTextChunk } from "./types";

/**
 * Document chunk embedding storage + semantic search (Phase 16D).
 *
 * Mirrors `src/lib/rag/vector-store-pgvector.ts`'s exact pattern: the
 * embedding column is reachable only through raw SQL (Prisma's
 * `Unsupported("vector(64)")` escape hatch makes it invisible to the
 * typed client), with a dimension guard that REJECTS (no-ops, never
 * throws or corrupts) any vector that doesn't match
 * `DOCUMENT_CHUNK_EMBEDDING_DIMENSIONS` — embeddings from a different
 * model occupy a different, incomparable vector space, so storing a
 * mismatched one would silently corrupt every future search rather than
 * just failing loudly.
 *
 * Session mode has no real pgvector to query, so it computes cosine
 * similarity itself, in-process, over the SAME `globalThis` buffer
 * `chunk-repository.ts` uses (now that `DocumentTextChunk.embedding` is a
 * legitimate, if usually-absent, field on that type) — same "session
 * mirrors database" contract every other repository in this app honors.
 */

export interface ChunkSearchMatch {
  chunk: Pick<DocumentTextChunk, "id" | "documentId" | "position" | "text" | "metadata">;
  score: number;
}

export interface ChunkVectorStore {
  /** Returns false (a safe no-op, never throws) when `vector`'s length
   *  doesn't match `DOCUMENT_CHUNK_EMBEDDING_DIMENSIONS`, or when the
   *  chunk id doesn't exist. */
  setEmbedding(chunkId: string, vector: number[], model: string): Promise<boolean>;
  /** Cosine-similarity search over every chunk that has an embedding,
   *  optionally restricted to one document. Never throws — degrades to
   *  an empty array on any failure (no database, query error, etc.). */
  search(queryVector: number[], topK: number, documentId?: string): Promise<ChunkSearchMatch[]>;
}

function isValidDimension(vector: number[]): boolean {
  return vector.length === DOCUMENT_CHUNK_EMBEDDING_DIMENSIONS;
}

/** Same formula as `rag/vector-store.ts`'s `cosineSimilarity` — not
 *  imported from there to avoid a session/database asymmetry: the
 *  database path computes this in SQL (pgvector's `<=>` operator), so the
 *  session path needs its own JS implementation matching that exact
 *  semantics (clamped cosine similarity, 0 for degenerate vectors). */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return Math.max(-1, Math.min(1, dot / (Math.sqrt(normA) * Math.sqrt(normB))));
}

/* ---------------- session implementation ---------------- */
function createSessionChunkVectorStore(): ChunkVectorStore {
  function buffer(): DocumentTextChunk[] {
    const g = globalThis as unknown as { __hermesDocumentTextChunks?: DocumentTextChunk[] };
    g.__hermesDocumentTextChunks ??= [];
    return g.__hermesDocumentTextChunks;
  }

  return {
    async setEmbedding(chunkId, vector, model) {
      if (!isValidDimension(vector)) return false;
      const chunk = buffer().find((c) => c.id === chunkId);
      if (!chunk) return false;
      chunk.embedding = vector;
      chunk.embeddingModel = model;
      chunk.embeddingDimensions = vector.length;
      chunk.status = "embedded";
      chunk.updatedAt = new Date().toISOString();
      return true;
    },

    async search(queryVector, topK, documentId) {
      const candidates = buffer().filter(
        (c) => Array.isArray(c.embedding) && (!documentId || c.documentId === documentId)
      );
      return candidates
        .map((c) => ({
          chunk: { id: c.id, documentId: c.documentId, position: c.position, text: c.text, metadata: c.metadata },
          score: cosineSimilarity(queryVector, c.embedding as number[]),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(0, topK));
    },
  };
}

/* ---------------- database implementation ---------------- */
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

function createDatabaseChunkVectorStore(): ChunkVectorStore {
  return {
    async setEmbedding(chunkId, vector, model) {
      if (!isValidDimension(vector)) return false;
      const db = await rawClient();
      if (!db?.$executeRawUnsafe) return false;
      try {
        const count = await db.$executeRawUnsafe(
          `UPDATE "DocumentTextChunk"
           SET embedding = $1::vector, "embeddingModel" = $2, "embeddingDimensions" = $3, status = 'embedded'
           WHERE id = $4`,
          toVectorLiteral(vector),
          model,
          vector.length,
          chunkId
        );
        return count > 0;
      } catch {
        return false;
      }
    },

    async search(queryVector, topK, documentId) {
      if (!isValidDimension(queryVector)) return [];
      const db = await rawClient();
      if (!db?.$queryRawUnsafe) return [];
      try {
        const params: unknown[] = [toVectorLiteral(queryVector)];
        let where = `WHERE embedding IS NOT NULL`;
        if (documentId) {
          params.push(documentId);
          where += ` AND "documentId" = $${params.length}`;
        }
        params.push(Math.max(0, topK));

        const rows = (await db.$queryRawUnsafe(
          `SELECT id, "documentId", position, text, metadata,
                  1 - (embedding <=> $1::vector) AS score
           FROM "DocumentTextChunk"
           ${where}
           ORDER BY embedding <=> $1::vector
           LIMIT $${params.length}`,
          ...params
        )) as Array<Record<string, unknown>>;

        return rows.map((r) => ({
          chunk: {
            id: String(r.id),
            documentId: String(r.documentId),
            position: Number(r.position),
            text: String(r.text),
            metadata: (r.metadata as Record<string, unknown>) ?? {},
          },
          score: Number(r.score),
        }));
      } catch {
        return [];
      }
    },
  };
}

export function getChunkVectorStore(): ChunkVectorStore {
  return getStorageMode() === "database" ? createDatabaseChunkVectorStore() : createSessionChunkVectorStore();
}
