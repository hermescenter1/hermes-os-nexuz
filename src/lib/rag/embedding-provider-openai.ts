import type { EmbeddingProvider, RagEmbedding } from "./types";
import { getOpenAIEmbeddingModel, OPENAI_EMBEDDING_DIMENSIONS, EMBEDDING_TIMEOUT_MS } from "./config";
import { mockEmbedWithReason } from "./embedding-provider";
import { loadOptionalPackage, withTimeout } from "@/lib/ai/providers/shared";

/**
 * OpenAI embedding provider (Phase 14B — real capability).
 *
 * Mirrors `src/lib/ai/providers/openai.ts`'s exact safety contract —
 * reusing its generic `loadOptionalPackage`/`withTimeout` helpers directly
 * rather than duplicating them, since neither is AI-router-specific. Falls
 * back to the mock embedding — never throws — when:
 *   - no `OPENAI_API_KEY` is configured ("missing_api_key"; the same key
 *     the AI router already reads — no separate key for embeddings)
 *   - the `openai` package isn't installed ("sdk_not_installed")
 *   - the call times out ("timeout") or the SDK throws ("provider_error")
 *   - the SDK returns an empty/malformed embedding ("empty_response")
 *
 * The `openai` package is NOT a dependency of this project. It is loaded
 * via `loadOptionalPackage()` with a variable specifier so neither
 * `npx tsc --noEmit` nor `npm run build` requires it to exist. Install it
 * with `npm install openai` to enable real calls; no code change needed.
 */

const PACKAGE_NAME = "openai";

/** Minimal shape of what this adapter needs from the `openai` package's
 *  client. Declared locally (not imported from the package's own types,
 *  since it isn't installed) so this file type-checks with or without it. */
interface OpenAIEmbeddingResponse {
  data?: { embedding?: number[] }[];
}
interface OpenAIClientLike {
  embeddings: {
    create(args: Record<string, unknown>): Promise<OpenAIEmbeddingResponse>;
  };
}
interface OpenAIModuleLike {
  default: new (opts: { apiKey: string }) => OpenAIClientLike;
}

// Cached across calls within one process — same rationale as
// ai/providers/openai.ts's client cache.
let cachedClient: OpenAIClientLike | null | undefined;

async function getClient(apiKey: string): Promise<OpenAIClientLike | null> {
  if (cachedClient !== undefined) return cachedClient;
  const mod = await loadOptionalPackage<OpenAIModuleLike>(PACKAGE_NAME);
  if (!mod) {
    cachedClient = null;
    return null;
  }
  try {
    const Ctor = mod.default ?? (mod as unknown as OpenAIModuleLike["default"]);
    cachedClient = new Ctor({ apiKey });
  } catch {
    cachedClient = null;
  }
  return cachedClient;
}

export const openaiEmbeddingProvider: EmbeddingProvider = {
  id: "openai",
  dimensions: OPENAI_EMBEDDING_DIMENSIONS,
  async embed(input): Promise<RagEmbedding> {
    // Read the key live (never cached) so callers/tests can configure it at
    // request time. Never logged, never echoed back in any response field.
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return mockEmbedWithReason(input, "missing_api_key");

    const client = await getClient(apiKey);
    if (!client) return mockEmbedWithReason(input, "sdk_not_installed");

    const model = getOpenAIEmbeddingModel();
    try {
      const result = await withTimeout(
        client.embeddings.create({ model, input: input.text }),
        EMBEDDING_TIMEOUT_MS
      );
      if (!result.ok) return mockEmbedWithReason(input, "timeout");

      const vector = result.value.data?.[0]?.embedding;
      if (!Array.isArray(vector) || vector.length === 0) {
        return mockEmbedWithReason(input, "empty_response");
      }
      return {
        chunkId: input.chunkId,
        vector,
        dimensions: vector.length,
        model,
        mock: false,
      };
    } catch {
      // Never throw a provider error into the app — degrade to mock.
      return mockEmbedWithReason(input, "provider_error");
    }
  },
};
