import { isRagEnabled, getRagMode, getEmbeddingProvider } from "./config";
import { chunkDocument, type ChunkOptions } from "./chunking";
import { mockEmbeddingProvider } from "./embedding-provider";
import { openaiEmbeddingProvider } from "./embedding-provider-openai";
import { localEmbeddingProvider } from "./embedding-provider-local";
import { createInMemoryVectorStore } from "./vector-store";
import { createPgVectorStore } from "./vector-store-pgvector";
import type {
  EmbeddingProvider,
  RagDocument,
  RagPipelineResult,
  RagSearchQuery,
  VectorStore,
} from "./types";

/**
 * RAG Pipeline (Phase 14A foundation; Phase 14B wires in real providers and
 * a real store) — disabled by default, never throws.
 *
 * NOT wired into `/api/brain` or `retrieval-engine.ts` in this phase. This
 * is a self-contained, independently-testable capability: callers supply
 * the documents to index AND the query in one call. Even in "pgvector"
 * mode there is no durable, populate-once-query-many ingestion path yet —
 * see vector-store-pgvector.ts's documentation of that gap.
 *
 * Phase 14B: `getEmbeddingProvider()` now selects a genuinely different
 * adapter per value — "openai"/"local" attempt a real call and degrade to
 * the mock embedding on any missing key/SDK/server/timeout/error (see
 * embedding-provider-openai.ts / -local.ts). `getRagMode() === "pgvector"`
 * now selects the pgvector-backed store (vector-store-pgvector.ts), which
 * itself degrades to an empty result when the database/table isn't
 * reachable. `"external"` still has no implementation and resolves to the
 * safe in-memory store, exactly like an unrecognized value would.
 */

const EMBEDDING_PROVIDERS: Partial<Record<string, EmbeddingProvider>> = {
  mock: mockEmbeddingProvider,
  openai: openaiEmbeddingProvider,
  local: localEmbeddingProvider,
};

function resolveEmbeddingProvider(): EmbeddingProvider {
  return EMBEDDING_PROVIDERS[getEmbeddingProvider()] ?? mockEmbeddingProvider;
}

function resolveVectorStore(): VectorStore {
  return getRagMode() === "pgvector" ? createPgVectorStore() : createInMemoryVectorStore();
}

export interface RagPipelineInput {
  documents: RagDocument[];
  query: RagSearchQuery;
  chunkOptions?: ChunkOptions;
}

/**
 * if RAG is disabled (default): returns `{ enabled: false, results: [] }`
 * immediately — no chunking, no embedding, no store touched at all.
 *
 * if enabled: chunk every document → embed every chunk → embed the query →
 * search → return ranked results.
 *
 * On ANY failure anywhere in the enabled path (malformed input, a provider
 * throwing, anything unforeseen), resolves to a safe fallback result
 * instead of rejecting — the caller (eventually `/api/brain`, in a later
 * phase) can always treat this function's return value as final, with no
 * try/catch of its own required.
 */
export async function runRagPipeline(input: RagPipelineInput): Promise<RagPipelineResult> {
  const mode = getRagMode();
  const embeddingProvider = getEmbeddingProvider();

  if (!isRagEnabled()) {
    return { enabled: false, results: [], mode, embeddingProvider };
  }

  try {
    const provider = resolveEmbeddingProvider();
    const store = resolveVectorStore();

    for (const doc of input.documents) {
      const chunks = chunkDocument(doc, input.chunkOptions);
      for (const chunk of chunks) {
        const embedding = await provider.embed({ chunkId: chunk.id, text: chunk.text });
        await store.add(chunk, embedding);
      }
    }

    const queryEmbedding = await provider.embed({
      chunkId: "__query__",
      text: input.query.text,
    });
    const results = await store.search({
      vector: queryEmbedding.vector,
      topK: input.query.topK ?? 5,
      filters: input.query.filters,
    });

    return { enabled: true, results, mode, embeddingProvider };
  } catch {
    // Never let a chunking/embedding/store failure escape as a rejected
    // promise — degrade to an empty, clearly-marked result instead.
    return { enabled: true, results: [], mode, embeddingProvider, reason: "pipeline_error" };
  }
}
