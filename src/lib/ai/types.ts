/**
 * AI Provider Router — shared types (Phase 12-A).
 *
 * Defines the provider abstraction every adapter (`providers/*.ts`) and the
 * router (`router.ts`) implement. This phase is the abstraction layer only:
 * no adapter calls a real API yet — every `ask()` below returns a
 * deterministic mock `AIResponse`. Phase 12-B re-points the adapters at
 * real providers behind this exact same interface; callers never change.
 */

/** Concrete providers, plus "hybrid" — the router's own self-id when it is
 *  delegating per-task rather than acting as a single fixed provider. */
export type AIProviderId = "openai" | "claude" | "local" | "hybrid";

export const AI_PROVIDER_IDS: AIProviderId[] = ["openai", "claude", "local", "hybrid"];

/** A concrete (non-routing) provider — every adapter implements exactly this. */
export type ConcreteProviderId = Exclude<AIProviderId, "hybrid">;

/**
 * Task kind drives hybrid routing (see `router.ts`'s HYBRID_ROUTE). Callers
 * outside the router only need to pick the right `task` — they never name a
 * concrete provider directly.
 */
export type AITaskKind =
  | "engineeringReasoning"
  | "structuredOutput"
  | "deterministic"
  | "general";

export interface AIRequestInput {
  /** what kind of work this is — the router's only routing signal */
  task: AITaskKind;
  /** the actual question/instruction for the provider */
  prompt: string;
  /** optional grounding text (e.g. retrieved evidence, case context) */
  context?: string;
  locale?: "en" | "fa";
  /** free-form passthrough; adapters may ignore it */
  metadata?: Record<string, unknown>;
}

export interface AIResponseMetadata {
  /** the provider that actually produced the content — same as the
   *  top-level `provider` field unless the router (id "hybrid") delegated */
  resolvedProvider: ConcreteProviderId;
  taskKind: AITaskKind;
  /** always true in Phase 12-A — no adapter calls a real API yet */
  mock: boolean;
  /** present when the router itself was invoked (id "hybrid") */
  routingMode?: AIProviderId;
  [key: string]: unknown;
}

export interface AIResponse {
  /** the identity the caller invoked — "hybrid" if routed, else the
   *  concrete provider id requested directly */
  provider: AIProviderId;
  content: string;
  metadata: AIResponseMetadata;
}

/** Every provider adapter and the router itself implement this. */
export interface AIProvider {
  id: AIProviderId;
  ask(input: AIRequestInput): Promise<AIResponse>;
}
