import { isRagEnabled, getRagMode, getEmbeddingProvider } from "./config";
import { chunkDocument, type ChunkOptions } from "./chunking";
import { mockEmbeddingProvider } from "./embedding-provider";
import { createInMemoryVectorStore } from "./vector-store";
import type { EmbeddingProvider, RagDocument, RagPipelineResult, RagSearchQuery } from "./types";

/**
 * RAG Pipeline (Phase 14A) — disabled by default, never throws.
 *
 * NOT wired into `/api/brain` or `retrieval-engine.ts` in this phase. This
 * is a self-contained, independently-testable capability: callers supply
 * the documents to index AND the query in one call (there is no persistent
 * corpus yet — that durability question is Phase 14B/pgvector's, not
 * this phase's).
 *
 * Phase 14A note: `HERMES_RAG_MODE` and `HERMES_EMBEDDING_PROVIDER` are
 * read and reported in the result for forward-compatibility, but every
 * configured value currently executes through the same in-memory mock
 * path below — there is no pgvector/external/openai/local execution path
 * yet. Resolving "openai"/"local"/"pgvector"/"external" to the mock
 * implementation here (rather than erroring) is deliberate: it lets ops
 * set the real target value in advance of Phase 14B shipping the matching
 * implementation, without that env var doing anything unsafe today.
 */

const EMBEDDING_PROVIDERS: Partial<Record<string, EmbeddingProvider>> = {
  mock: mockEmbeddingProvider,
};

function resolveEmbeddingProvider(): EmbeddingProvider {
  return EMBEDDING_PROVIDERS[getEmbeddingProvider()] ?? mockEmbeddingProvider;
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
    const store = createInMemoryVectorStore();

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
