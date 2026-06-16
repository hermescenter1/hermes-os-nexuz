import type { AIProvider, AIRequestInput, AIResponse } from "../types";

/**
 * Local provider adapter — always a mock, by design (Phase 12-A; unchanged
 * by Phase 12-B's real-provider work).
 *
 * Routed to for `deterministic` tasks, as the `mock`-mode router's forced
 * target for every task, and as the hybrid/real router's safe default for
 * anything else — see `router.ts`. There is no "real" local provider to
 * integrate: this is intentionally the no-API-key, no-network tier the
 * router can always fall back to without any failure mode at all.
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
