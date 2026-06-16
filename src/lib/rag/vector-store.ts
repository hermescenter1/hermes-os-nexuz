import type { RagChunk, RagEmbedding, RagSearchResult, VectorStore } from "./types";

/**
 * Mock in-memory vector store (Phase 14A).
 *
 * No persistence — every store is a fresh array, gone when the reference
 * is dropped (and definitely gone across process restarts/serverless
 * invocations). This is intentional for Phase 14A: the foundation must be
 * provably correct (cosine math, topK, filtering) before any persistence
 * concern (pgvector/external — Phase 14B) is introduced.
 *
 * `createInMemoryVectorStore()` is a factory, not a shared singleton —
 * each call returns an independent store, so tests (and any future
 * per-request usage) never leak state into one another.
 */

/** Cosine similarity, clamped to [-1, 1]. Returns 0 for mismatched
 *  dimensions or a zero vector (rather than NaN/Infinity) so a malformed
 *  embedding can never produce a non-finite score. */
export function cosineSimilarity(a: number[], b: number[]): number {
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
  const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  return Math.max(-1, Math.min(1, sim));
}

function matchesFilters(
  metadata: Record<string, unknown> | undefined,
  filters?: Record<string, unknown>
): boolean {
  if (!filters) return true;
  const md = metadata ?? {};
  return Object.entries(filters).every(([key, value]) => md[key] === value);
}

interface StoredEntry {
  chunk: RagChunk;
  embedding: RagEmbedding;
}

export function createInMemoryVectorStore(): VectorStore {
  const entries: StoredEntry[] = [];

  return {
    async add(chunk, embedding) {
      entries.push({ chunk, embedding });
    },

    async search({ vector, topK, filters }): Promise<RagSearchResult[]> {
      return entries
        .filter((e) => matchesFilters(e.chunk.metadata, filters))
        .map((e) => ({ chunk: e.chunk, score: cosineSimilarity(vector, e.embedding.vector) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(0, topK));
    },

    async clear() {
      entries.length = 0;
    },
  };
}
