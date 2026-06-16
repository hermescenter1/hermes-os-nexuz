import { MOCK_EMBEDDING_DIMENSIONS, MOCK_EMBEDDING_MODEL } from "./config";
import type { EmbeddingProvider, RagEmbedding } from "./types";

/**
 * Mock embedding provider (Phase 14A).
 *
 * Deterministic, fixed-dimension, pure — no network call, no randomness,
 * no external dependency. Identical text always produces the identical
 * vector, in this process or any other, forever. This is NOT a real
 * embedding model: it has no semantic meaning, only the structural
 * properties (determinism, fixed dimension, well-defined cosine geometry)
 * the rest of the RAG foundation (vector-store.ts, rag-pipeline.ts, and
 * their tests) need to exercise safely without a provider key or SDK.
 * Phase 14B adds real openai/local adapters behind this same interface,
 * following the exact optional-SDK pattern from `src/lib/ai/providers/*`.
 */

/** Deterministic pseudo-random value in [-1, 1] for one vector dimension,
 *  derived from the text and the dimension index so every dimension is a
 *  distinct (but still fully deterministic) function of the input. */
function seededComponent(text: string, index: number): number {
  let h = 5381 + index * 97;
  for (let i = 0; i < text.length; i++) {
    h = (h * 33) ^ text.charCodeAt(i);
  }
  const unit = (h >>> 0) / 0xffffffff; // 0..1
  return unit * 2 - 1; // -1..1
}

function embedText(text: string): number[] {
  return Array.from({ length: MOCK_EMBEDDING_DIMENSIONS }, (_, i) => seededComponent(text, i));
}

export const mockEmbeddingProvider: EmbeddingProvider = {
  id: "mock",
  dimensions: MOCK_EMBEDDING_DIMENSIONS,
  async embed({ chunkId, text }): Promise<RagEmbedding> {
    return {
      chunkId,
      vector: embedText(text),
      dimensions: MOCK_EMBEDDING_DIMENSIONS,
      model: MOCK_EMBEDDING_MODEL,
      mock: true,
    };
  },
};

/**
 * Phase 14B: the real adapters (embedding-provider-openai.ts,
 * embedding-provider-local.ts) call this for every degrade path instead of
 * calling `mockEmbeddingProvider.embed()` directly, so the specific reason
 * ("missing_api_key", "sdk_not_installed", "provider_error", "timeout",
 * "empty_response") survives onto the result — mirroring how
 * `src/lib/ai/providers/shared.ts`'s `mockResponse()` attaches a reason to
 * every AI Router fallback.
 */
export async function mockEmbedWithReason(
  input: { chunkId: string; text: string },
  reason: string
): Promise<RagEmbedding> {
  const result = await mockEmbeddingProvider.embed(input);
  return { ...result, mock: true, reason };
}
