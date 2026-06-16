/**
 * Embedding provider (Phase 16D) — re-exported, not recreated.
 *
 * The `EmbeddingProvider` interface, a deterministic mock implementation,
 * and an OpenAI stub already exist in `src/lib/rag/*` (Phase 14A/B),
 * built with exactly the pattern this phase asks for: optional SDK,
 * never throws, safe mock fallback when no real key/SDK is available.
 * Document chunk embedding reuses the SAME abstraction the RAG pipeline
 * already uses, rather than duplicating it under `src/lib/documents/` and
 * risking two copies drifting apart — this codebase has exactly one
 * embedding provider family.
 *
 *   - `mockEmbeddingProvider` — deterministic, fixed-dimension, the only
 *     provider this phase actually exercises ("do not require live
 *     OpenAI").
 *   - `openaiEmbeddingProvider` — a stub today (no `openai` package
 *     installed, explicitly out of scope this phase); already falls back
 *     to the mock on any missing key/SDK/error. Re-exported here for
 *     completeness/parity with Phase 16D's "OpenAIEmbeddingProvider stub
 *     (not active)" requirement — nothing in `src/lib/documents/` calls
 *     it yet.
 */
export type { EmbeddingProvider, RagEmbedding, EmbeddingProviderId } from "@/lib/rag/types";
export { mockEmbeddingProvider } from "@/lib/rag/embedding-provider";
export { openaiEmbeddingProvider } from "@/lib/rag/embedding-provider-openai";
