import type { RagMode, EmbeddingProviderId } from "./types";

/**
 * RAG Foundation Layer — configuration (Phase 14A).
 *
 * Mirrors the resolution pattern already used by
 * `src/lib/storage/storage-mode.ts` and `src/lib/ai/config.ts`: an explicit
 * env override, otherwise a safe default. All three flags default to the
 * inert/no-op value so the absence of any configuration is indistinguishable
 * from RAG never having been added:
 *
 *   HERMES_RAG_ENABLED        = true | false   (default: false)
 *   HERMES_RAG_MODE           = mock | pgvector | external   (default: mock)
 *   HERMES_EMBEDDING_PROVIDER = mock | openai | local         (default: mock)
 *
 * Phase 14A note: `getRagMode()`/`getEmbeddingProvider()` are read and
 * reported by the pipeline for forward-compatibility, but every value
 * currently executes through the same in-memory mock path — there is no
 * pgvector/external/openai/local implementation yet (that is Phase 14B).
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
