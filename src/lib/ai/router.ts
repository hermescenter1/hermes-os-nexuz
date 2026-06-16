import { openaiProvider } from "./providers/openai";
import { claudeProvider } from "./providers/claude";
import { localProvider } from "./providers/local";
import { getAIProviderMode } from "./config";
import type {
  AIProvider,
  AIProviderId,
  AIRequestInput,
  AIResponse,
  AITaskKind,
  ConcreteProviderId,
} from "./types";

/**
 * AI Provider Router (Phase 12-A).
 *
 * Abstraction layer only — every adapter is a mock (see `providers/*.ts`),
 * and nothing in the existing Brain pipeline calls this yet. It exists so a
 * future phase can re-point real reasoning at openai/claude/local behind one
 * stable `ask()` call, without the current rule-based pipeline (`brain-core
 * .ts`, `pipeline.ts`, `retrieval-engine.ts`) changing at all.
 */

const PROVIDERS: Record<ConcreteProviderId, AIProvider> = {
  openai: openaiProvider,
  claude: claudeProvider,
  local: localProvider,
};

/**
 * Hybrid routing table — which concrete provider handles which task kind
 * when the router is in "hybrid" mode:
 *   - engineering reasoning -> claude  (deep, open-ended technical analysis)
 *   - structured output     -> openai (schema-constrained generation)
 *   - deterministic tasks    -> local  (no model call should be needed at all)
 *   - anything unclassified  -> local  (safe default; never fails closed)
 */
const HYBRID_ROUTE: Record<AITaskKind, ConcreteProviderId> = {
  engineeringReasoning: "claude",
  structuredOutput: "openai",
  deterministic: "local",
  general: "local",
};

/** Resolves which concrete provider handles a request, given the active
 *  provider mode and the request's task kind. Exported for tests/tools that
 *  want the routing decision without performing the (mock) call. */
export function resolveProvider(mode: AIProviderId, task: AITaskKind): ConcreteProviderId {
  if (mode === "hybrid") return HYBRID_ROUTE[task] ?? "local";
  return mode;
}

export const aiRouter: AIProvider = {
  id: "hybrid",
  async ask(input: AIRequestInput): Promise<AIResponse> {
    const mode = getAIProviderMode();
    const target = resolveProvider(mode, input.task);
    const result = await PROVIDERS[target].ask(input);
    return {
      ...result,
      // The router's own identity is "hybrid" only when it actually routed
      // per-task; a fixed mode (openai/claude/local) reports that provider
      // directly, since no delegation decision was made.
      provider: mode === "hybrid" ? "hybrid" : mode,
      metadata: {
        ...result.metadata,
        resolvedProvider: target,
        routingMode: mode,
      },
    };
  },
};

/** Convenience function form of `aiRouter.ask()` for callers that just want
 *  a single call rather than the provider object. */
export async function routeAIRequest(input: AIRequestInput): Promise<AIResponse> {
  return aiRouter.ask(input);
}
