// PHASE 95 — deterministic-first policy router.
//
// The single decision point that says HOW an AI-like workflow may run. The
// deterministic engine is always authoritative; the LLM is optional and
// paraphrase-only. Provider outage/denial ⇒ deterministic result. No automatic
// fallback to a second external provider. Production must never silently use
// mock embeddings — a missing/invalid production embedding config disables
// retrieval / fails closed.

import type {
  DeploymentEnvironment,
  EvidenceState,
  IndustrialOutputClass,
  RouteDecision,
} from "./types";

export interface RouterInput {
  workflow: string;
  environment: DeploymentEnvironment;
  /** From evaluateProviderAccess: is an external provider authorised NOW? */
  externalProviderAuthorised: boolean;
  /** Is the authorised provider actually reachable/configured? */
  providerAvailable: boolean;
  /** Deterministic-authoritative signals. */
  evidenceState: EvidenceState;
  outputClass: IndustrialOutputClass;
  /** High-risk prompt-injection detected in the request. */
  injectionHighRisk: boolean;
  /** True when the (production) embedding/retrieval config would fall back to
   *  mock vectors — must NOT be used in production. */
  productionMockEmbeddingFallback: boolean;
  /** Whether this workflow is retrieval-only (no generation step). */
  retrievalOnly: boolean;
}

export interface RouterDecision {
  decision: RouteDecision;
  /** Fixed, non-sensitive reason. */
  reason: string;
  llmAllowed: boolean;
}

const SAFETY_CRITICAL: readonly IndustrialOutputClass[] = [
  "CONTROL_ACTION",
  "SAFETY_RELATED",
  "SIS_OR_SAFETY_PLC",
  "DESTRUCTIVE",
  "IRREVERSIBLE",
];

const INSUFFICIENT: readonly EvidenceState[] = ["INSUFFICIENT", "MISSING", "UNAVAILABLE", "CONTRADICTORY"];

export function decideRoute(input: RouterInput): RouterDecision {
  // 1. High-risk injection never influences a model.
  if (input.injectionHighRisk) {
    return { decision: "BLOCKED", reason: "injection_high_risk", llmAllowed: false };
  }

  // 2. Safety-critical + insufficient evidence must not become an operational
  //    recommendation — force human review.
  if (SAFETY_CRITICAL.includes(input.outputClass) && INSUFFICIENT.includes(input.evidenceState)) {
    return { decision: "HUMAN_REVIEW_REQUIRED", reason: "safety_critical_insufficient_evidence", llmAllowed: false };
  }

  // 3. Production must not silently use mock vectors.
  if (input.environment === "production" && input.productionMockEmbeddingFallback) {
    if (input.retrievalOnly) {
      return { decision: "BLOCKED", reason: "production_mock_embedding_disabled", llmAllowed: false };
    }
    // Non-retrieval workflow can still run deterministically.
    return { decision: "DETERMINISTIC_ONLY", reason: "production_mock_embedding_disabled", llmAllowed: false };
  }

  if (input.retrievalOnly) {
    return { decision: "RETRIEVAL_ONLY", reason: "retrieval_workflow", llmAllowed: false };
  }

  // 4. LLM rephrase only when an external provider is BOTH authorised and
  //    available; otherwise the deterministic result stands (no auto-fallback).
  if (input.externalProviderAuthorised && input.providerAvailable) {
    return { decision: "DETERMINISTIC_PLUS_LLM_REPHRASE", reason: "authorised_and_available", llmAllowed: true };
  }
  return {
    decision: "DETERMINISTIC_ONLY",
    reason: input.externalProviderAuthorised ? "provider_unavailable" : "provider_not_authorised",
    llmAllowed: false,
  };
}
