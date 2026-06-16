import type { AIProvider, AIRequestInput, AIResponse } from "../types";

/**
 * OpenAI provider adapter (Phase 12-A — mock only).
 *
 * Routed to for `structuredOutput` tasks in hybrid mode (see `router.ts`).
 * No network call is made — this is the seam a future phase wires to the
 * real OpenAI API behind the exact same `ask()` signature; callers never
 * change.
 */
export const openaiProvider: AIProvider = {
  id: "openai",
  async ask(input: AIRequestInput): Promise<AIResponse> {
    return {
      provider: "openai",
      content: `[mock:openai] ${input.prompt}`,
      metadata: {
        resolvedProvider: "openai",
        taskKind: input.task,
        mock: true,
      },
    };
  },
};
