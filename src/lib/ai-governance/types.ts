// PHASE 95 — AI Governance & Model Assurance: shared contracts.
//
// This module defines the fail-closed, deterministic-first governance types the
// rest of the ai-governance package builds on. It holds TYPES and CONSTANTS
// ONLY — no I/O, no provider calls, no secrets. Every downstream decision
// (routing, provider-policy, citation, safety) is expressed against these types
// so the "deterministic engine stays authoritative" invariant is structural.
//
// Non-negotiable invariants encoded here:
//   - LLM authority is PARAPHRASE_AND_EXPLANATION_ONLY.
//   - The model may never author confidence, evidence state, fault codes, rule
//     ids/versions, safety classification, approval requirements, citations or
//     tenant/site ownership.
//   - Unknown external-provider facts are recorded as EXTERNAL_REVIEW_REQUIRED,
//     never invented.

/** External-fact placeholder — used wherever a provider legal/retention/region
 *  fact has NOT been independently reviewed. Never guess these. */
export const EXTERNAL_REVIEW_REQUIRED = "EXTERNAL_REVIEW_REQUIRED" as const;
export type ExternalReviewRequired = typeof EXTERNAL_REVIEW_REQUIRED;

/** A value that is either a reviewed literal or an explicit unknown. */
export type ReviewedOr<T extends string> = T | ExternalReviewRequired;

export type ProviderType = "external_generation" | "external_embedding" | "internal_deterministic" | "mock";

export type AiCapability = "generation" | "embedding" | "deterministic_reasoning" | "retrieval";

/** Data-classification vocabulary. External providers may only receive classes
 *  a tenant policy explicitly approves; some classes are never sent by default. */
export type DataClass =
  | "public"
  | "tenant_operational"
  | "tenant_industrial_confidential"
  | "personal_data"
  | "secret"; // never permitted to leave — modeled so a policy can hard-deny it.

export type DeploymentEnvironment = "test" | "development" | "staging" | "production";

/** One governed AI engine or provider/model. Facts that require legal/vendor
 *  review are typed as ReviewedOr so they can be honestly marked unknown. */
export interface ModelRegistryEntry {
  /** Stable governance id, e.g. "anthropic:claude-sonnet-4-20250514". */
  readonly registryId: string;
  readonly provider: string;
  readonly providerType: ProviderType;
  /** The exact model identifier as it appears in executable code (for external
   *  providers). Internal engines use a symbolic id. */
  readonly modelId: string;
  readonly modelVersion: string;
  readonly capability: AiCapability;
  readonly purpose: string;
  /** True when invoking this entry can send data outside Hermes infrastructure. */
  readonly external: boolean;
  /** Whether this entry is active WITHOUT any additional flag/policy. External
   *  entries MUST be false (deny-by-default). */
  readonly defaultEnabled: boolean;
  readonly allowedEnvironments: readonly DeploymentEnvironment[];
  /** Data classes this entry is permitted to receive IF a tenant policy also
   *  approves them. Empty for internal/deterministic engines. */
  readonly allowedDataClasses: readonly DataClass[];
  /** External entries require an approved per-organisation policy to be used. */
  readonly tenantPolicyRequired: boolean;
  readonly toolCallingAllowed: boolean;
  readonly structuredOutputRequired: boolean;
  /** The deterministic engine/result this entry falls back to on any failure. */
  readonly deterministicFallback: string;
  readonly retentionPolicyStatus: ReviewedOr<string>;
  readonly trainingUseStatus: ReviewedOr<string>;
  readonly regionStatus: ReviewedOr<string>;
  readonly owner: string;
  readonly policyVersion: string;
}

/* ── Routing ─────────────────────────────────────────────────────────────── */

export type RouteDecision =
  | "DETERMINISTIC_ONLY"
  | "DETERMINISTIC_PLUS_LLM_REPHRASE"
  | "RETRIEVAL_ONLY"
  | "BLOCKED"
  | "HUMAN_REVIEW_REQUIRED";

/* ── Evidence & safety (deterministic-authoritative) ─────────────────────── */

export type EvidenceState =
  | "SUFFICIENT"
  | "PARTIALLY_SUFFICIENT"
  | "INSUFFICIENT"
  | "CONTRADICTORY"
  | "MISSING"
  | "UNAVAILABLE";

/** Industrial output risk classes, lowest → highest consequence. */
export type IndustrialOutputClass =
  | "INFORMATIONAL"
  | "DIAGNOSTIC"
  | "INSPECTION"
  | "MAINTENANCE"
  | "CONFIGURATION"
  | "OPERATIONAL"
  | "CONTROL_ACTION"
  | "SAFETY_RELATED"
  | "SIS_OR_SAFETY_PLC"
  | "DESTRUCTIVE"
  | "IRREVERSIBLE";

/** Retrieval trust/provenance tiers. Only the reviewed tiers may ground a
 *  safety-relevant claim; the rest are data-only or blocked. */
export type TrustClass =
  | "PLATFORM_REVIEWED"
  | "TENANT_REVIEWED"
  | "TENANT_UNREVIEWED"
  | "PUBLIC_UNVERIFIED"
  | "ARCHIVED"
  | "REVOKED"
  | "UNKNOWN";

/* ── Governance decision envelope ────────────────────────────────────────── */

/** The single fail-closed reason vocabulary surfaced by governance denials.
 *  Never carries a secret, prompt, or tenant payload. */
export type GovernanceDenyReason =
  | "NO_POLICY"
  | "POLICY_DISABLED"
  | "POLICY_EXPIRED"
  | "UNKNOWN_PROVIDER"
  | "UNKNOWN_MODEL"
  | "UNAPPROVED_DATA_CLASS"
  | "CROSS_TENANT"
  | "SECRET_OR_CREDENTIAL"
  | "FEATURE_FLAG_OFF"
  | "ENVIRONMENT_NOT_ALLOWED"
  | "UNSAFE_OUTPUT"
  | "INSUFFICIENT_EVIDENCE"
  | "INVALID_CITATION"
  | "INJECTION_DETECTED";
