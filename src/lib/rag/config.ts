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
 *   HERMES_RAG_BRAIN_ENABLED  = true | false   (default: false; read only by
 *                                                /api/brain/route.ts)
 *
 * Phase 14B note: `getRagMode() === "pgvector"` now actually selects the
 * pgvector-backed store (vector-store-pgvector.ts) and
 * `getEmbeddingProvider() === "openai" | "local"` now actually select real
 * adapters (embedding-provider-openai.ts / -local.ts) — see rag-pipeline.ts.
 * `"external"` still has no implementation and resolves to the safe
 * in-memory store, exactly like an unrecognized value would.
 *
 * Phase 15 note: two independent flags gate `/api/brain`'s RAG evidence
 * layer, deliberately mirroring Phase 13's `HERMES_AI_ROUTER_ENABLED` vs.
 * `AI_PROVIDER_MODE` split:
 *   - `HERMES_RAG_BRAIN_ENABLED` (this file) — whether the ROUTE even
 *     attempts to call `runRagPipeline()` at all. False (default) ⇒
 *     `/api/brain`'s response is byte-for-byte identical to before Phase 15.
 *   - `HERMES_RAG_ENABLED` (above) — whether `runRagPipeline()` ITSELF does
 *     anything once called. Both must be true for `ragEvidence.enabled` to
 *     be true; if only the route flag is on, `ragEvidence` is still
 *     attached (so the shape is consistent) but reports `enabled: false`.
 */

function isTrue(v: string | undefined): boolean {
  return v?.trim().toLowerCase() === "true";
}

/** Phase 14A/B feature flag — gates the entire RAG pipeline. Defaults to
 *  false (anything other than the literal string "true" is disabled). */
export function isRagEnabled(): boolean {
  return isTrue(process.env.HERMES_RAG_ENABLED);
}

/** Phase 15 feature flag — gates whether `/api/brain` attempts to call
 *  `runRagPipeline()` at all. Defaults to false. See the module doc above
 *  for how this relates to `isRagEnabled()`. */
export function isRagBrainEnabled(): boolean {
  return isTrue(process.env.HERMES_RAG_BRAIN_ENABLED);
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

/** `text-embedding-3-small`'s native output size. */
export const OPENAI_EMBEDDING_DIMENSIONS = 1536;

/**
 * Phase 14C — the pgvector `DocumentChunk.embedding` column's fixed width.
 * Aliased to `OPENAI_EMBEDDING_DIMENSIONS` because that's the provider this
 * project standardizes the persisted vector space on (see
 * prisma/schema.prisma's `DocumentChunk` model comment and
 * prisma/migrations/20260616000000_add_document_chunk_pgvector).
 *
 * This is NOT a generic "pad/truncate to fit" knob. Embeddings from
 * different models occupy different, mutually-incomparable vector spaces —
 * resizing a vector's array length does not make it semantically
 * comparable to another model's output, even at equal length. So
 * `vector-store-pgvector.ts` REJECTS (no-ops) any embedding whose
 * `dimensions` doesn't equal this constant, rather than attempting to
 * reshape it. The practical implication: the mock provider's vectors
 * (64-dim) and an unconfigured/non-1536 local server's vectors are simply
 * never persisted to pgvector — only a provider that natively emits
 * exactly `PGVECTOR_DIMENSIONS` floats can be stored. Changing the
 * canonical provider/dimension requires a NEW migration (a pgvector
 * column's width cannot be altered in place without rewriting every row),
 * and this constant must be updated to match it in the same change.
 */
export const PGVECTOR_DIMENSIONS = OPENAI_EMBEDDING_DIMENSIONS;

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
