/**
 * RAG Foundation Layer — shared types (Phase 14A).
 *
 * A self-contained, currently-UNWIRED type system for the future RAG
 * pipeline. It deliberately does not import from or extend
 * `src/lib/services/rag-types.ts` (the Phase 5/10 interfaces-only
 * scaffold used by the existing keyword `retrieval-engine.ts`) — unifying
 * the two is an explicit Phase 14B decision, not made here. Nothing in
 * `src/lib/industrial/*`, `src/lib/retrieval/*`, or `/api/brain` imports
 * anything from this module yet.
 */

export type RagMode = "mock" | "pgvector" | "external";
export type EmbeddingProviderId = "mock" | "openai" | "local";

/** A source document before chunking — e.g. a knowledge article, an
 *  engineering case, or (Phase 14B+) an ingested vendor manual/PDF page.
 *  `sourceType` is an open string (not yet a closed union) because future
 *  document categories aren't decided yet. */
export interface RagDocument {
  id: string;
  sourceType: string;
  text: string;
  metadata?: Record<string, unknown>;
}

/** A chunk of a document, sized for embedding. */
export interface RagChunk {
  /** stable and deterministic for a given (documentId, position) — see
   *  chunking.ts; re-chunking identical input always yields identical ids */
  id: string;
  documentId: string;
  sourceType: string;
  text: string;
  /** 0-based chunk index within the document */
  position: number;
  /** the source document's metadata, plus a contentHash for future
   *  invalidation — see chunking.ts */
  metadata?: Record<string, unknown>;
}

/** An embedding vector for one chunk (or a query — embedding a query uses
 *  the exact same shape/provider as embedding a chunk). */
export interface RagEmbedding {
  chunkId: string;
  vector: number[];
  dimensions: number;
  model: string;
  /** Phase 14B: true when this vector came from the mock provider rather
   *  than a genuine real-provider call — mirrors `AIResponseMetadata.mock`
   *  from `src/lib/ai/types.ts` for consistency across the two provider
   *  families. Optional so Phase 14A code that never set it stays valid. */
  mock?: boolean;
  /** present only when `mock` is true and something specifically degraded
   *  (vs. simply being configured as the mock provider by choice) —
   *  "missing_api_key" | "sdk_not_installed" | "provider_error" |
   *  "timeout" | "empty_response" */
  reason?: string;
}

export interface RagSearchQuery {
  text: string;
  topK?: number;
  /** equality filters matched against a chunk's metadata */
  filters?: Record<string, unknown>;
}

export interface RagSearchResult {
  chunk: RagChunk;
  /** cosine similarity, clamped to [-1, 1] */
  score: number;
}

/**
 * The pipeline's outer contract — always returned, never thrown.
 * `enabled` reflects whether HERMES_RAG_ENABLED was on for this call, not
 * whether the call fully succeeded (mirrors the Phase 13 `aiEnhancement`
 * design: `enabled` = "the feature was on", `reason` = "what degraded, if
 * anything"). `mode`/`embeddingProvider` report the configured values for
 * forward-compatibility; in Phase 14A every mode/provider value resolves to
 * the same in-memory mock execution path (see rag-pipeline.ts).
 */
export interface RagPipelineResult {
  enabled: boolean;
  results: RagSearchResult[];
  mode: RagMode;
  embeddingProvider: EmbeddingProviderId;
  /** present only when something degraded — never a raw error/stack trace */
  reason?: string;
}

/** Every embedding provider (mock today; real adapters in Phase 14B)
 *  implements exactly this — mirrors `AIProvider.ask()`'s shape from
 *  `src/lib/ai/types.ts` for consistency across the two provider families. */
export interface EmbeddingProvider {
  id: EmbeddingProviderId;
  dimensions: number;
  embed(input: { chunkId: string; text: string }): Promise<RagEmbedding>;
}

/** Every vector store (in-memory mock today; pgvector/external in Phase
 *  14B) implements exactly this. */
export interface VectorStore {
  add(chunk: RagChunk, embedding: RagEmbedding): Promise<void>;
  search(query: {
    vector: number[];
    topK: number;
    filters?: Record<string, unknown>;
  }): Promise<RagSearchResult[]>;
  /** test/dev convenience — not part of the minimum contract */
  clear?(): Promise<void>;
}
