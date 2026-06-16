/**
 * AI Provider Router — configuration (Phase 12-A; Phase 12-B adds real
 * provider settings; Phase 13 adds the /api/brain integration flag).
 *
 * Mirrors the resolution pattern already used by
 * `src/lib/storage/storage-mode.ts`: an explicit env override, otherwise a
 * computed default.
 *
 *   HERMES_AI_ROUTER_ENABLED = true | false    (default: false — see below)
 *   AI_PROVIDER_MODE = mock | real | hybrid     (explicit override)
 *   OPENAI_API_KEY   / OPENAI_MODEL              (read only by providers/openai.ts)
 *   ANTHROPIC_API_KEY / ANTHROPIC_MODEL           (read only by providers/claude.ts)
 *
 * No key is ever read, returned, or logged here beyond a boolean
 * "configured" presence check.
 */

/**
 * Phase 13 feature flag — gates whether `/api/brain` attaches an optional
 * `aiEnhancement` block after the deterministic Brain pipeline runs.
 * Defaults to false (anything other than the literal string "true" is
 * treated as disabled) so a missing/misspelled env var fails safely toward
 * "router not wired in" rather than toward "router unexpectedly active".
 * When false, `/api/brain` checks this flag and returns immediately without
 * calling the router at all — the response is byte-for-byte identical to
 * before Phase 13.
 */
export function isAIRouterEnabled(): boolean {
  return process.env.HERMES_AI_ROUTER_ENABLED?.trim().toLowerCase() === "true";
}

export type AIProviderMode = "mock" | "real" | "hybrid";

const VALID_MODES: AIProviderMode[] = ["mock", "real", "hybrid"];

function anyProviderKeyConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY) || Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Resolution order:
 *  1. AI_PROVIDER_MODE — explicit override.
 *  2. Otherwise: "hybrid" when at least one provider key is configured,
 *     else "mock" — the router never defaults into attempting a real call
 *     when nothing is configured anywhere.
 */
export function getAIProviderMode(): AIProviderMode {
  const override = process.env.AI_PROVIDER_MODE?.trim().toLowerCase();
  if (override && (VALID_MODES as string[]).includes(override)) {
    return override as AIProviderMode;
  }
  return anyProviderKeyConfigured() ? "hybrid" : "mock";
}

const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-20250514";

/** Model id for the OpenAI adapter — OPENAI_MODEL, else a small default. */
export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL?.trim() || OPENAI_DEFAULT_MODEL;
}

/** Model id for the Claude adapter — ANTHROPIC_MODEL, else the same model
 *  id the existing `src/lib/llm/provider.ts` gateway already uses, so a
 *  deployment with one key configured behaves consistently across both. */
export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || ANTHROPIC_DEFAULT_MODEL;
}

/**
 * Whether each concrete provider has the credentials its adapter needs.
 * Booleans only — never the key value itself. `local` is always
 * "configured" since it never calls out.
 */
export const AI_PROVIDER_CONFIG = {
  openai: {
    apiKeyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    configured: Boolean(process.env.OPENAI_API_KEY),
  },
  claude: {
    apiKeyEnv: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    configured: Boolean(process.env.ANTHROPIC_API_KEY),
  },
  local: {
    apiKeyEnv: null,
    modelEnv: null,
    configured: true,
  },
} as const;
