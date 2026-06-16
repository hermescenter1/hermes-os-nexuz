import { openaiProvider } from "./providers/openai";
import { claudeProvider } from "./providers/claude";
import { localProvider } from "./providers/local";
import { getAIProviderMode, type AIProviderMode } from "./config";
import { mockResponse } from "./providers/shared";
import type {
  AIProvider,
  AIRequestInput,
  AIResponse,
  AITaskKind,
  ConcreteProviderId,
} from "./types";

/**
 * AI Provider Router (Phase 12-A abstraction; Phase 12-B adds real-provider
 * capability behind the adapters, plus the mock/real/hybrid mode switch).
 *
 * Nothing in the existing Brain pipeline (`brain-core.ts`, `pipeline.ts`,
 * `retrieval-engine.ts`, `src/lib/llm/*`) calls this yet — it remains an
 * isolated, currently-unused abstraction layer by design, per Phase 12-B's
 * "do not wire into /api/brain yet" instruction.
 */

const PROVIDERS: Record<ConcreteProviderId, AIProvider> = {
  openai: openaiProvider,
  claude: claudeProvider,
  local: localProvider,
};

/**
 * Per-task routing table — which concrete provider handles which task kind:
 *   - engineering reasoning  -> claude  (deep, open-ended technical analysis)
 *   - structured output      -> openai (schema-constrained generation)
 *   - deterministic tasks     -> local  (no model call should be needed at all)
 *   - anything unclassified   -> local  (safe default; never fails closed)
 *
 * Consulted by "real" and "hybrid" modes alike — both honor task routing;
 * the difference between them is one of stated intent, not mechanics (see
 * resolveProvider). "mock" mode bypasses this table entirely.
 */
const TASK_ROUTE: Record<AITaskKind, ConcreteProviderId> = {
  engineeringReasoning: "claude",
  structuredOutput: "openai",
  deterministic: "local",
  general: "local",
};

/**
 * Resolves which concrete provider handles a request, given the active
 * provider mode and the request's task kind:
 *   - "mock"   -> always "local" — the router never reaches openai/claude
 *                 adapters at all, regardless of task or configured keys.
 *   - "real"   -> TASK_ROUTE[task]; the resolved adapter then attempts a
 *                 real call if its key (and SDK) are available, else it
 *                 degrades to its own mock — never the router's concern.
 *   - "hybrid" -> identical resolution to "real" (same TASK_ROUTE) — the
 *                 difference is purely how `aiRouter.ask` reports
 *                 `provider` (see below), not which adapter runs.
 */
export function resolveProvider(mode: AIProviderMode, task: AITaskKind): ConcreteProviderId {
  if (mode === "mock") return "local";
  return TASK_ROUTE[task] ?? "local";
}

export const aiRouter: AIProvider = {
  id: "hybrid",
  async ask(input: AIRequestInput): Promise<AIResponse> {
    const mode = getAIProviderMode();
    const target = resolveProvider(mode, input.task);

    // Phase 12-B: even in "mock" mode (target is always "local", which is
    // already an unconditional mock), call mockResponse directly rather
    // than the local adapter, so the metadata can record reason
    // "forced_mock" — distinct from local's own (also-mock) response,
    // which carries no reason at all since it has nothing to fall back from.
    const result =
      mode === "mock"
        ? mockResponse("local", input, "forced_mock")
        : await PROVIDERS[target].ask(input);

    return {
      ...result,
      // The router's own identity is "hybrid" only when it genuinely
      // multiplexed per-task; a fixed policy (mock/real) reports the
      // concrete provider it actually used.
      provider: mode === "hybrid" ? "hybrid" : target,
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
