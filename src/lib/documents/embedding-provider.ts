/**
 * Embedding provider (Phase 16D / 17C) — re-exported and resolved here.
 *
 * The `EmbeddingProvider` interface, the mock implementation, and the OpenAI
 * adapter all live in `src/lib/rag/*` — document chunk embedding reuses the
 * same abstraction the RAG pipeline uses, rather than duplicating it.
 *
 * Phase 17C adds `resolveDocumentEmbeddingProvider()`: an env-driven selector
 * controlled by DOCUMENT_EMBEDDINGS_PROVIDER (separate from the RAG pipeline's
 * HERMES_EMBEDDING_PROVIDER so document and brain embeddings can be configured
 * independently).
 *
 *   DOCUMENT_EMBEDDINGS_PROVIDER=openai  →  openaiEmbeddingProvider (default)
 *   DOCUMENT_EMBEDDINGS_PROVIDER=mock    →  mockEmbeddingProvider (dev/test)
 *
 * openaiEmbeddingProvider already degrades to mock on any failure (missing
 * OPENAI_API_KEY, SDK error, timeout) — it never throws.
 */
export type { EmbeddingProvider, RagEmbedding, EmbeddingProviderId } from "@/lib/rag/types";
export { mockEmbeddingProvider } from "@/lib/rag/embedding-provider";
export { openaiEmbeddingProvider } from "@/lib/rag/embedding-provider-openai";

import type { EmbeddingProvider } from "@/lib/rag/types";
import { mockEmbeddingProvider } from "@/lib/rag/embedding-provider";
import { openaiEmbeddingProvider } from "@/lib/rag/embedding-provider-openai";

export function resolveDocumentEmbeddingProvider(): EmbeddingProvider {
  const val = process.env.DOCUMENT_EMBEDDINGS_PROVIDER?.trim().toLowerCase();
  return val === "mock" ? mockEmbeddingProvider : openaiEmbeddingProvider;
}
