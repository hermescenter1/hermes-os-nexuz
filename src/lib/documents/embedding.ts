import { mockEmbeddingProvider } from "./embedding-provider";
import { documentTextChunkRepository } from "./chunk-repository";
import { getChunkVectorStore } from "./chunk-vector-store";

/**
 * Chunk embedding generation (Phase 16D).
 *
 * Embeds every chunk of a document using the mock embedding provider —
 * the only one this phase runs ("do not install OpenAI SDK yet" / "do not
 * require live OpenAI"). Deterministic and repeatable: the same chunk
 * text always produces the same vector (see
 * `src/lib/rag/embedding-provider.ts`), so re-running this on an
 * unchanged document is idempotent in effect, even though it always
 * re-writes every row.
 *
 * Never throws: any failure (storage error, an unforeseen exception)
 * resolves to `{ ok: false, reason: "embedding_failed" }` rather than a
 * rejected promise — the caller (processing.ts) never needs its own
 * try/catch around this function's internals, only a defense-in-depth one.
 */

export interface EmbedChunksResult {
  ok: boolean;
  embeddedCount: number;
  totalChunks: number;
  reason?: string;
}

export async function embedDocumentChunks(documentId: string): Promise<EmbedChunksResult> {
  const chunks = await documentTextChunkRepository().listByDocumentId(documentId);
  if (chunks.length === 0) {
    return { ok: true, embeddedCount: 0, totalChunks: 0 };
  }

  const store = getChunkVectorStore();
  try {
    let embedded = 0;
    for (const chunk of chunks) {
      const result = await mockEmbeddingProvider.embed({ chunkId: chunk.id, text: chunk.text });
      const stored = await store.setEmbedding(chunk.id, result.vector, result.model);
      if (stored) embedded++;
    }
    return { ok: embedded === chunks.length, embeddedCount: embedded, totalChunks: chunks.length };
  } catch {
    return { ok: false, embeddedCount: 0, totalChunks: chunks.length, reason: "embedding_failed" };
  }
}
