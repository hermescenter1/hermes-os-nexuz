/**
 * AI Provider Router — shared types (Phase 12-A; Phase 12-B adds real
 * provider capability behind the same shapes).
 *
 * Defines the provider abstraction every adapter (`providers/*.ts`) and the
 * router (`router.ts`) implement. `AIResponse`/`AIProvider` never changed
 * between phases — Phase 12-B's openai/claude adapters attempt a real call
 * when a key (and the optional SDK) is available, and fall back to the same
 * mock shape Phase 12-A always returned, on any missing prerequisite or
 * failure. Callers never need to know which happened beyond `metadata.mock`.
 */

// Type-only import (erased at compile time) — config.ts does not import
// anything from this file, so there is no runtime circularity either way.
import type { AIProviderMode } from "./config";

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
  /** false only for a genuine Phase 12-B real-provider success */
  mock: boolean;
  /** present when the request went through `aiRouter` — the runtime policy
   *  in effect: mock | real | hybrid (see config.ts) */
  routingMode?: AIProviderMode;
  /** present whenever `mock` is true: why this call degraded —
   *  "missing_api_key" | "sdk_not_installed" | "provider_error" |
   *  "timeout" | "empty_response" | "forced_mock" */
  reason?: string;
  /** present only when reason === "sdk_not_installed" */
  requiredPackage?: string;
  installCommand?: string;
  /** present on a real (mock: false) success */
  model?: string;
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
