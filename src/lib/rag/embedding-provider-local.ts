import type { EmbeddingProvider, RagEmbedding } from "./types";
import { getLocalEmbeddingUrl, EMBEDDING_TIMEOUT_MS, MOCK_EMBEDDING_DIMENSIONS } from "./config";
import { mockEmbedWithReason } from "./embedding-provider";
import { withTimeout } from "@/lib/ai/providers/shared";

/**
 * Local embedding provider (Phase 14B — real capability, no SDK).
 *
 * Targets a self-hosted embedding server (e.g. sentence-transformers behind
 * a thin HTTP wrapper) — the "Factory Edge: Local AI fallback" pillar from
 * the Phase 14 architecture audit. Deliberately dependency-free: a single
 * `fetch` POST, no package to install, no API key. Expected server
 * contract: `POST {HERMES_LOCAL_EMBEDDING_URL}/embed { text } -> { embedding: number[] }`.
 *
 * Falls back to the mock embedding — never throws — when:
 *   - `HERMES_LOCAL_EMBEDDING_URL` isn't configured ("missing_api_key" —
 *     reusing the same reason vocabulary as the OpenAI adapter for "nothing
 *     configured", even though no API key is actually involved here)
 *   - the request times out ("timeout") or fails ("provider_error")
 *   - the server returns an empty/malformed embedding ("empty_response")
 */

interface LocalEmbedResponse {
  embedding?: number[];
}

async function callLocalServer(url: string, text: string): Promise<LocalEmbedResponse> {
  const res = await fetch(`${url.replace(/\/+$/, "")}/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(`local embedding server returned ${res.status}`);
  }
  return (await res.json()) as LocalEmbedResponse;
}

export const localEmbeddingProvider: EmbeddingProvider = {
  id: "local",
  // Unknown until a real server responds — this is only a placeholder used
  // when no server is configured at all (and the mock embedding is used).
  dimensions: MOCK_EMBEDDING_DIMENSIONS,
  async embed(input): Promise<RagEmbedding> {
    const url = getLocalEmbeddingUrl();
    if (!url) return mockEmbedWithReason(input, "missing_api_key");

    try {
      const result = await withTimeout(callLocalServer(url, input.text), EMBEDDING_TIMEOUT_MS);
      if (!result.ok) return mockEmbedWithReason(input, "timeout");

      const vector = result.value.embedding;
      if (!Array.isArray(vector) || vector.length === 0) {
        return mockEmbedWithReason(input, "empty_response");
      }
      return {
        chunkId: input.chunkId,
        vector,
        dimensions: vector.length,
        model: "local",
        mock: false,
      };
    } catch {
      // Never throw a provider error into the app — degrade to mock.
      return mockEmbedWithReason(input, "provider_error");
    }
  },
};
