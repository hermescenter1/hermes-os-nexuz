// PHASE 95 — the single version-controlled governance registry for every
// AI-like engine, provider and model in Hermes OS.
//
// This is the ONE authoritative inventory. Downstream governance (router,
// provider-policy, execution-trace) reads model/provider identity from here —
// never from duplicated literals. A static test (model-registry.static.test.ts)
// fails the build if a production provider/model identifier appears anywhere in
// executable code but is absent from this registry.
//
// External-provider legal/retention/region facts are recorded as
// EXTERNAL_REVIEW_REQUIRED. They are NOT invented here; enabling an external
// provider for real tenant data is gated on an owner-reviewed tenant policy
// (provider-policy.ts) regardless of what this registry says.

import {
  EXTERNAL_REVIEW_REQUIRED,
  type ModelRegistryEntry,
} from "./types";

/** Regexes matching production model identifiers that MUST be registered if
 *  they appear in executable code. Used by the static completeness gate. */
export const PRODUCTION_MODEL_ID_PATTERNS: readonly RegExp[] = [
  /claude-[a-z0-9.-]+-\d{8}/g, // e.g. claude-sonnet-4-20250514
  /gpt-[a-z0-9.-]+/g, // e.g. gpt-4o-mini
  /text-embedding-3-(?:small|large)/g,
  /gemini-[a-z0-9.-]+/g,
];

export const MODEL_REGISTRY: readonly ModelRegistryEntry[] = [
  {
    registryId: "anthropic:claude-sonnet-4-20250514",
    provider: "anthropic",
    providerType: "external_generation",
    modelId: "claude-sonnet-4-20250514",
    modelVersion: "20250514",
    capability: "generation",
    purpose: "Paraphrase/explanation of DETERMINISTIC Brain results only (non-authoritative).",
    external: true,
    defaultEnabled: false,
    allowedEnvironments: ["staging", "production"],
    allowedDataClasses: ["public", "tenant_operational"],
    tenantPolicyRequired: true,
    toolCallingAllowed: false,
    structuredOutputRequired: true,
    deterministicFallback: "hermes:brain-deterministic",
    retentionPolicyStatus: EXTERNAL_REVIEW_REQUIRED,
    trainingUseStatus: EXTERNAL_REVIEW_REQUIRED,
    regionStatus: EXTERNAL_REVIEW_REQUIRED,
    owner: "platform",
    policyVersion: "phase95.1",
  },
  {
    registryId: "openai:text-embedding-3-small",
    provider: "openai",
    providerType: "external_embedding",
    modelId: "text-embedding-3-small",
    modelVersion: "3-small",
    capability: "embedding",
    purpose: "Document/knowledge chunk embeddings for retrieval (opt-in only).",
    external: true,
    defaultEnabled: false,
    allowedEnvironments: ["staging", "production"],
    allowedDataClasses: ["public", "tenant_operational"],
    tenantPolicyRequired: true,
    toolCallingAllowed: false,
    structuredOutputRequired: false,
    deterministicFallback: "hermes:mock-embedding",
    retentionPolicyStatus: EXTERNAL_REVIEW_REQUIRED,
    trainingUseStatus: EXTERNAL_REVIEW_REQUIRED,
    regionStatus: EXTERNAL_REVIEW_REQUIRED,
    owner: "platform",
    policyVersion: "phase95.1",
  },
  {
    // Dormant: referenced only by the disabled src/lib/ai/* router
    // (HERMES_AI_ROUTER_ENABLED=false; its Anthropic SDK is not installed).
    // Registered so it is governed and the static gate stays at zero unregistered.
    registryId: "openai:gpt-4o-mini",
    provider: "openai",
    providerType: "external_generation",
    modelId: "gpt-4o-mini",
    modelVersion: "gpt-4o-mini",
    capability: "generation",
    purpose: "Dormant alternative generation in the disabled ai/* router (governed, not active).",
    external: true,
    defaultEnabled: false,
    allowedEnvironments: ["staging", "production"],
    allowedDataClasses: ["public", "tenant_operational"],
    tenantPolicyRequired: true,
    toolCallingAllowed: false,
    structuredOutputRequired: true,
    deterministicFallback: "hermes:brain-deterministic",
    retentionPolicyStatus: EXTERNAL_REVIEW_REQUIRED,
    trainingUseStatus: EXTERNAL_REVIEW_REQUIRED,
    regionStatus: EXTERNAL_REVIEW_REQUIRED,
    owner: "platform",
    policyVersion: "phase95.1",
  },
  {
    // PHASE 103 — Hermes Live Voice Intelligence, transcription leg.
    //
    // This entry governs SPEECH-TO-TEXT ONLY. The session it authorises is a
    // transcription session (`session.type: "transcription"` in the current
    // Realtime API — the contract earlier spelled `create_response: false`), so
    // the provider returns transcript text and NEVER an assistant turn, a tool
    // call or an analysis. Whatever it transcribes is shown to the operator for
    // review; only an explicitly confirmed transcript reaches the deterministic
    // Copilot, which remains the sole author of every answer.
    registryId: "openai:gpt-live-transcribe",
    provider: "openai",
    providerType: "external_generation",
    modelId: "gpt-live-transcribe",
    modelVersion: "gpt-live-transcribe",
    capability: "generation",
    purpose:
      "Live speech-to-text for the Industrial Copilot voice panel (transcription-only; never authors an answer).",
    external: true,
    defaultEnabled: false,
    allowedEnvironments: ["staging", "production"],
    allowedDataClasses: ["public", "tenant_operational"],
    tenantPolicyRequired: true,
    toolCallingAllowed: false,
    // A transcript is free-form text, not a structured envelope; the structure
    // this feature depends on comes from the deterministic engine downstream.
    structuredOutputRequired: false,
    deterministicFallback: "hermes:copilot-deterministic",
    retentionPolicyStatus: EXTERNAL_REVIEW_REQUIRED,
    trainingUseStatus: EXTERNAL_REVIEW_REQUIRED,
    regionStatus: EXTERNAL_REVIEW_REQUIRED,
    owner: "platform",
    policyVersion: "phase103.1",
  },
  {
    // PHASE 103 — Hermes Live Voice Intelligence, speech leg.
    //
    // Reads back the EXACT text the deterministic Copilot produced, proven by a
    // server-signed grant that binds the text hash to one organisation, user,
    // locale and expiry. The model receives text and returns audio; it is never
    // asked to compose, summarise or extend anything.
    registryId: "openai:gpt-4o-mini-tts",
    provider: "openai",
    providerType: "external_generation",
    modelId: "gpt-4o-mini-tts",
    modelVersion: "gpt-4o-mini-tts",
    capability: "generation",
    purpose:
      "Text-to-speech playback of the signed, deterministic Copilot answer (verbatim only; authors nothing).",
    external: true,
    defaultEnabled: false,
    allowedEnvironments: ["staging", "production"],
    allowedDataClasses: ["public", "tenant_operational"],
    tenantPolicyRequired: true,
    toolCallingAllowed: false,
    structuredOutputRequired: false,
    deterministicFallback: "hermes:copilot-deterministic",
    retentionPolicyStatus: EXTERNAL_REVIEW_REQUIRED,
    trainingUseStatus: EXTERNAL_REVIEW_REQUIRED,
    regionStatus: EXTERNAL_REVIEW_REQUIRED,
    owner: "platform",
    policyVersion: "phase103.1",
  },
  {
    registryId: "hermes:brain-deterministic",
    provider: "hermes",
    providerType: "internal_deterministic",
    modelId: "hermes-brain-deterministic",
    modelVersion: "phase94",
    capability: "deterministic_reasoning",
    purpose: "Authoritative engineering fault analysis (deterministic pipeline).",
    external: false,
    defaultEnabled: true,
    allowedEnvironments: ["test", "development", "staging", "production"],
    allowedDataClasses: [],
    tenantPolicyRequired: false,
    toolCallingAllowed: false,
    structuredOutputRequired: true,
    deterministicFallback: "hermes:brain-deterministic",
    retentionPolicyStatus: "internal-no-external-retention",
    trainingUseStatus: "internal-not-used-for-training",
    regionStatus: "hermes-controlled",
    owner: "platform",
    policyVersion: "phase95.1",
  },
  {
    registryId: "hermes:industrial-brain",
    provider: "hermes",
    providerType: "internal_deterministic",
    modelId: "hermes-industrial-brain",
    modelVersion: "phase94",
    capability: "deterministic_reasoning",
    purpose: "Deterministic industrial signal/fault analysis (no external AI).",
    external: false,
    defaultEnabled: true,
    allowedEnvironments: ["test", "development", "staging", "production"],
    allowedDataClasses: [],
    tenantPolicyRequired: false,
    toolCallingAllowed: false,
    structuredOutputRequired: true,
    deterministicFallback: "hermes:industrial-brain",
    retentionPolicyStatus: "internal-no-external-retention",
    trainingUseStatus: "internal-not-used-for-training",
    regionStatus: "hermes-controlled",
    owner: "platform",
    policyVersion: "phase95.1",
  },
  {
    registryId: "hermes:copilot-deterministic",
    provider: "hermes",
    providerType: "internal_deterministic",
    modelId: "hermes-copilot-deterministic",
    modelVersion: "phase87",
    capability: "deterministic_reasoning",
    purpose: "Deterministic industrial Copilot (template/intent, no LLM).",
    external: false,
    defaultEnabled: true,
    allowedEnvironments: ["test", "development", "staging", "production"],
    allowedDataClasses: [],
    tenantPolicyRequired: false,
    toolCallingAllowed: false,
    structuredOutputRequired: true,
    deterministicFallback: "hermes:copilot-deterministic",
    retentionPolicyStatus: "internal-no-external-retention",
    trainingUseStatus: "internal-not-used-for-training",
    regionStatus: "hermes-controlled",
    owner: "platform",
    policyVersion: "phase95.1",
  },
  {
    registryId: "hermes:predictive-non-llm",
    provider: "hermes",
    providerType: "internal_deterministic",
    modelId: "hermes-predictive-non-llm",
    modelVersion: "phase87",
    capability: "deterministic_reasoning",
    purpose: "Statistical (non-LLM) predictive maintenance.",
    external: false,
    defaultEnabled: true,
    allowedEnvironments: ["test", "development", "staging", "production"],
    allowedDataClasses: [],
    tenantPolicyRequired: false,
    toolCallingAllowed: false,
    structuredOutputRequired: true,
    deterministicFallback: "hermes:predictive-non-llm",
    retentionPolicyStatus: "internal-no-external-retention",
    trainingUseStatus: "internal-not-used-for-training",
    regionStatus: "hermes-controlled",
    owner: "platform",
    policyVersion: "phase95.1",
  },
  {
    registryId: "hermes:mock-generation",
    provider: "hermes",
    providerType: "mock",
    modelId: "hermes-mock-generation",
    modelVersion: "phase95",
    capability: "generation",
    purpose: "Deterministic mock generation for test/development and offline CI evaluation.",
    external: false,
    defaultEnabled: false,
    allowedEnvironments: ["test", "development"],
    allowedDataClasses: [],
    tenantPolicyRequired: false,
    toolCallingAllowed: false,
    structuredOutputRequired: true,
    deterministicFallback: "hermes:brain-deterministic",
    retentionPolicyStatus: "internal-no-external-retention",
    trainingUseStatus: "internal-not-used-for-training",
    regionStatus: "hermes-controlled",
    owner: "platform",
    policyVersion: "phase95.1",
  },
  {
    registryId: "hermes:mock-embedding",
    provider: "hermes",
    providerType: "mock",
    modelId: "hermes-mock-embedding",
    modelVersion: "phase95",
    capability: "embedding",
    purpose: "Deterministic mock embeddings for test/development (never production retrieval).",
    external: false,
    defaultEnabled: false,
    allowedEnvironments: ["test", "development"],
    allowedDataClasses: [],
    tenantPolicyRequired: false,
    toolCallingAllowed: false,
    structuredOutputRequired: false,
    deterministicFallback: "hermes:mock-embedding",
    retentionPolicyStatus: "internal-no-external-retention",
    trainingUseStatus: "internal-not-used-for-training",
    regionStatus: "hermes-controlled",
    owner: "platform",
    policyVersion: "phase95.1",
  },
] as const;

const BY_REGISTRY_ID = new Map(MODEL_REGISTRY.map((e) => [e.registryId, e]));
const EXTERNAL_MODEL_IDS = new Set(MODEL_REGISTRY.filter((e) => e.external).map((e) => e.modelId));
const ALL_MODEL_IDS = new Set(MODEL_REGISTRY.map((e) => e.modelId));

/**
 * PHASE 103 — the two governance identities the Live Voice panel may use.
 *
 * Exported as CONSTANTS so no downstream module ever re-spells a provider model
 * id. `src/lib/copilot/voice/*` resolves the raw `modelId` through
 * {@link getRegistryEntry}, which keeps this file the only place a production
 * model identifier is written and keeps the MODEL_INVENTORY gate meaningful.
 */
export const VOICE_TRANSCRIPTION_REGISTRY_ID = "openai:gpt-live-transcribe";
export const VOICE_SPEECH_REGISTRY_ID = "openai:gpt-4o-mini-tts";

export function getRegistryEntry(registryId: string): ModelRegistryEntry | null {
  return BY_REGISTRY_ID.get(registryId) ?? null;
}

export function findByModelId(modelId: string): ModelRegistryEntry | null {
  return MODEL_REGISTRY.find((e) => e.modelId === modelId) ?? null;
}

/** True when a raw model identifier is a registered production (external) model. */
export function isRegisteredExternalModelId(modelId: string): boolean {
  return EXTERNAL_MODEL_IDS.has(modelId);
}

export function isRegisteredModelId(modelId: string): boolean {
  return ALL_MODEL_IDS.has(modelId);
}

export function externalRegistryEntries(): readonly ModelRegistryEntry[] {
  return MODEL_REGISTRY.filter((e) => e.external);
}

/** The set of production model-id literals the static gate must find registered. */
export function registeredModelIdSet(): ReadonlySet<string> {
  return ALL_MODEL_IDS;
}
