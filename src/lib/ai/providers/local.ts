import type { AIProvider, AIRequestInput, AIResponse } from "../types";

/**
 * Local provider adapter (Phase 12-A — mock only).
 *
 * Routed to for `deterministic` tasks (and as the hybrid router's safe
 * default for anything else) — see `router.ts`. Needs no API key and no
 * network call, by design: this is the provider the router can always fall
 * back to. Still a mock in this phase, same as the other two adapters.
 */
export const localProvider: AIProvider = {
  id: "local",
  async ask(input: AIRequestInput): Promise<AIResponse> {
    return {
      provider: "local",
      content: `[mock:local] ${input.prompt}`,
      metadata: {
        resolvedProvider: "local",
        taskKind: input.task,
        mock: true,
      },
    };
  },
};
