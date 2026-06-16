import type { AIProvider, AIRequestInput, AIResponse } from "../types";

/**
 * Claude provider adapter (Phase 12-A — mock only).
 *
 * Routed to for `engineeringReasoning` tasks in hybrid mode (see
 * `router.ts`). No network call is made — this is the seam a future phase
 * wires to the real Claude API behind the exact same `ask()` signature;
 * callers never change.
 */
export const claudeProvider: AIProvider = {
  id: "claude",
  async ask(input: AIRequestInput): Promise<AIResponse> {
    return {
      provider: "claude",
      content: `[mock:claude] ${input.prompt}`,
      metadata: {
        resolvedProvider: "claude",
        taskKind: input.task,
        mock: true,
      },
    };
  },
};
