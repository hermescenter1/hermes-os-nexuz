import type { RagMode, EmbeddingProviderId } from "./types";

/**
 * RAG Foundation Layer — configuration (Phase 14A; Phase 14B adds real
 * provider/store settings).
 *
 * Mirrors the resolution pattern already used by
 * `src/lib/storage/storage-mode.ts` and `src/lib/ai/config.ts`: an explicit
 * env override, otherwise a safe default. All flags default to the
 * inert/no-op value so the absence of any configuration is indistinguishable
 * from RAG never having been added:
 *
 *   HERMES_RAG_ENABLED        = true | false   (default: false)
 *   HERMES_RAG_MODE           = mock | pgvector | external   (default: mock)
 *   HERMES_EMBEDDING_PROVIDER = mock | openai | local         (default: mock)
 *   OPENAI_API_KEY / OPENAI_EMBEDDING_MODEL   (read only by embedding-provider-openai.ts;
 *                                               reuses the same key the AI router already
 *                                               reads — embeddings and chat completions
 *                                               share one OpenAI account/key)
 *   HERMES_LOCAL_EMBEDDING_URL                (read only by embedding-provider-local.ts)
 *
 * Phase 14B note: `getRagMode() === "pgvector"` now actually selects the
 * pgvector-backed store (vector-store-pgvector.ts) and
 * `getEmbeddingProvider() === "openai" | "local"` now actually select real
 * adapters (embedding-provider-openai.ts / -local.ts) — see rag-pipeline.ts.
 * `"external"` still has no implementation and resolves to the safe
 * in-memory store, exactly like an unrecognized value would.
 */

function isTrue(v: string | undefined): boolean {
  return v?.trim().toLowerCase() === "true";
}

/** Phase 14A/B feature flag — gates the entire RAG pipeline. Defaults to
 *  false (anything other than the literal string "true" is disabled). */
export function isRagEnabled(): boolean {
  return isTrue(process.env.HERMES_RAG_ENABLED);
}

const VALID_MODES: RagMode[] = ["mock", "pgvector", "external"];

export function getRagMode(): RagMode {
  const override = process.env.HERMES_RAG_MODE?.trim().toLowerCase();
  if (override && (VALID_MODES as string[]).includes(override)) {
    return override as RagMode;
  }
  return "mock";
}

const VALID_PROVIDERS: EmbeddingProviderId[] = ["mock", "openai", "local"];

export function getEmbeddingProvider(): EmbeddingProviderId {
  const override = process.env.HERMES_EMBEDDING_PROVIDER?.trim().toLowerCase();
  if (override && (VALID_PROVIDERS as string[]).includes(override)) {
    return override as EmbeddingProviderId;
  }
  return "mock";
}

/** Chunking defaults (characters, not tokens — no tokenizer dependency).
 *  Both are overridable per-call via chunking.ts's ChunkOptions. */
export const DEFAULT_CHUNK_SIZE = 500;
export const DEFAULT_CHUNK_OVERLAP = 50;

/** Fixed dimension for the mock embedding provider. Deliberately small —
 *  this is a deterministic test/dev vector, not a real embedding model's
 *  output, so there is no reason to pay the cost of a large vector. */
export const MOCK_EMBEDDING_DIMENSIONS = 64;

export const MOCK_EMBEDDING_MODEL = "mock-embedding-v1";

/** Shared timeout for any real embedding call (OpenAI or a local server) —
 *  same 15s budget as the AI router's outer enhancement timeout, since
 *  embedding a chunk is a comparably small, fast call. */
export const EMBEDDING_TIMEOUT_MS = 15_000;

const OPENAI_EMBEDDING_DEFAULT_MODEL = "text-embedding-3-small";

/** Model id for the OpenAI embedding adapter — OPENAI_EMBEDDING_MODEL, else
 *  a small, current default. Deliberately a separate env var from
 *  `ai/config.ts`'s `OPENAI_MODEL` (a chat model) — embedding and chat
 *  models are different model families on the same OpenAI account. */
export function getOpenAIEmbeddingModel(): string {
  return process.env.OPENAI_EMBEDDING_MODEL?.trim() || OPENAI_EMBEDDING_DEFAULT_MODEL;
}

/** `text-embedding-3-small`'s native output size. Real OpenAI embeddings
 *  are NOT the same dimension as the mock provider — any future vector
 *  store schema must size its column to whichever provider actually wrote
 *  to it (see vector-store-pgvector.ts's documentation of this gap). */
export const OPENAI_EMBEDDING_DIMENSIONS = 1536;

/**
 * Base URL of a self-hosted embedding server (e.g. sentence-transformers
 * behind a small HTTP wrapper) for the "local" provider — the Factory Edge
 * "Local AI fallback" pillar from the Phase 14 architecture audit. No SDK,
 * no package: a plain `fetch` POST. Undefined (the default) means "not
 * configured" — the local provider then degrades to the mock embedding,
 * exactly like the OpenAI adapter degrades on a missing API key.
 */
export function getLocalEmbeddingUrl(): string | undefined {
  return process.env.HERMES_LOCAL_EMBEDDING_URL?.trim() || undefined;
}
