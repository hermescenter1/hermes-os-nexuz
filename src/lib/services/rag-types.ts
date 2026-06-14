import type { BrainDomainId, ServiceResult } from "./types";

/**
 * RAG-ready contracts (Step 5) — INTERFACES ONLY.
 *
 * No embeddings, no vector database, and no retrieval implementation exist
 * in V1; these types define the seam so a Phase 2 retrieval service
 * (pgvector / dedicated vector DB behind FastAPI) can slot in without
 * changing the Brain pipeline or the UI. The current keyword selector is,
 * in these terms, a "keyword" strategy Retriever over library summaries.
 */

/** A canonical content source the platform can cite. */
export interface KnowledgeSource {
  id: string;
  type: "library" | "document" | "manual" | "standard" | "telemetry";
  /** message-key for bilingual built-in sources (e.g. knowledge.vfd.name) */
  titleKey?: string;
  /** literal title for ingested external documents */
  title?: string;
  uri?: string;
  version?: string;
  locale?: "fa" | "en" | "both";
}

/** A retrievable unit of content, sized for embedding and citation. */
export interface DocumentChunk {
  id: string;
  sourceId: string;
  /** message-key reference for built-in bilingual content */
  contentKey?: string;
  /** literal text for ingested documents */
  content?: string;
  position: number;          // chunk index within the source
  domains?: BrainDomainId[];
  tokens?: number;
  embedding?: EmbeddingMetadata; // metadata only — vectors live server-side
}

export interface EmbeddingMetadata {
  model: string;             // e.g. "voyage-3" — undecided in V1
  dimensions: number;
  contentHash: string;       // invalidation key on content change
  createdAt: number;
}

export interface RetrievalQuery {
  text: string;
  locale: "fa" | "en";
  topK: number;
  filters?: {
    domains?: BrainDomainId[];
    sourceTypes?: KnowledgeSource["type"][];
    sourceIds?: string[];
  };
}

export interface ScoredChunk {
  chunk: DocumentChunk;
  score: number;             // strategy-relative relevance, 0..1
}

export interface RetrievalResult {
  chunks: ScoredChunk[];
  strategy: "keyword" | "vector" | "hybrid";
  latencyMs?: number;
}

/** A reference from a Brain answer back to its supporting evidence. */
export interface Citation {
  id: string;                // display ordinal, e.g. "1"
  sourceId: string;
  sourceType: KnowledgeSource["type"];
  /** evidence snippet as a message key (bilingual built-in content) */
  snippetKey?: string;
  /** literal evidence snippet (ingested documents / future RAG) */
  snippet?: string;
  score?: number;
}

/** The retrieval seam Phase 2 implements. V1 ships no implementation. */
export interface Retriever {
  retrieve(query: RetrievalQuery): Promise<ServiceResult<RetrievalResult>>;
}
