import { mockEmbeddingProvider } from "./embedding-provider";
import { getChunkVectorStore } from "./chunk-vector-store";

/**
 * Semantic document search (Phase 16D).
 *
 * Embeds the query with the SAME provider chunks were embedded with (the
 * mock provider — see embedding.ts) and runs a cosine-similarity search
 * over stored chunk embeddings via `chunk-vector-store.ts`. A standalone
 * retrieval service for the admin test page / `/api/documents/search`
 * ONLY — explicitly NOT wired into Hermes Brain and does not inject
 * citations anywhere; that integration decision is deferred to a later
 * phase.
 *
 * Never throws: resolves to an empty `matches` array on any failure
 * (embedding error, no database, query error) rather than rejecting.
 */

export interface DocumentSearchMatch {
  chunkId: string;
  documentId: string;
  position: number;
  text: string;
  score: number;
}

export interface DocumentSearchResult {
  matches: DocumentSearchMatch[];
}

export async function searchDocuments(query: string, topK = 5): Promise<DocumentSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) return { matches: [] };

  try {
    const queryEmbedding = await mockEmbeddingProvider.embed({ chunkId: "__query__", text: trimmed });
    const results = await getChunkVectorStore().search(queryEmbedding.vector, topK);
    return {
      matches: results.map((r) => ({
        chunkId: r.chunk.id,
        documentId: r.chunk.documentId,
        position: r.chunk.position,
        text: r.chunk.text,
        score: r.score,
      })),
    };
  } catch {
    return { matches: [] };
  }
}
