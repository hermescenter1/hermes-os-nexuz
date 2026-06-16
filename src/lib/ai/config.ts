import type { AIProviderId } from "./types";

/**
 * AI Provider Router — configuration (Phase 12-A).
 *
 * Mirrors the resolution pattern already used by
 * `src/lib/storage/storage-mode.ts`: an explicit env override, otherwise a
 * safe default. `hybrid` is the default — it is the router's documented
 * primary behavior (engineering reasoning -> claude, structured output ->
 * openai, deterministic tasks -> local), and is exactly as safe as any
 * other mode in this phase since every adapter is a mock: no mode calls a
 * real API yet, so there is no "fails closed without a key" risk to avoid.
 *
 * No external API is called in this phase regardless of mode; `configured`
 * below only records whether a future real adapter would have a key to use.
 */

const VALID_MODES: AIProviderId[] = ["openai", "claude", "local", "hybrid"];

const DEFAULT_MODE: AIProviderId = "hybrid";

export function getAIProviderMode(): AIProviderId {
  const override = process.env.HERMES_AI_PROVIDER?.trim().toLowerCase();
  if (override && (VALID_MODES as string[]).includes(override)) {
    return override as AIProviderId;
  }
  return DEFAULT_MODE;
}

/**
 * Whether each concrete provider has the credentials Phase 12-B would need.
 * Informational only in this phase — no adapter reads or uses these keys
 * yet, since no adapter calls a real API.
 */
export const AI_PROVIDER_CONFIG = {
  openai: {
    apiKeyEnv: "OPENAI_API_KEY",
    configured: Boolean(process.env.OPENAI_API_KEY),
  },
  claude: {
    apiKeyEnv: "ANTHROPIC_API_KEY",
    configured: Boolean(process.env.ANTHROPIC_API_KEY),
  },
  local: {
    apiKeyEnv: null,
    /** local never needs a key — always "configured" */
    configured: true,
  },
} as const;
