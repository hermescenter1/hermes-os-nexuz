/**
 * PHASE 103 — the governance decision for one voice leg.
 *
 * This is the ONLY place a voice route learns whether it may talk to an external
 * provider. It composes the Phase 95 primitives rather than re-implementing
 * them: the canonical model registry supplies identity, and
 * `resolveProviderAccess` supplies the fail-closed, deny-by-default decision
 * over an approved per-organisation policy.
 *
 * EVERY GATE MUST SAY YES
 *   1. the global kill switch is on            (HERMES_EXTERNAL_AI_ENABLED)
 *   2. a provider API key is configured
 *   3. the Phase 103 signing secret is configured
 *   4. the registry entry exists and is EXTERNAL
 *   5. the deployment environment is permitted by that entry
 *   6. the data class is permitted by that entry
 *   7. an approved, enabled, unexpired policy exists FOR THIS ORGANISATION
 *   8. that policy lists this data class AND this exact workflow
 *   9. the registry entry forbids tool calling (a structural assertion, so a
 *      registry edit that enabled tools would fail here rather than ship)
 *
 * Any "no" denies, and every denial resolves to the deterministic fallback: the
 * Copilot answer is produced and displayed regardless. Voice is an interface to
 * the answer, never a precondition for it.
 */

import {
  getRegistryEntry,
  VOICE_SPEECH_REGISTRY_ID,
  VOICE_TRANSCRIPTION_REGISTRY_ID,
} from "@/lib/ai-governance/model-registry";
import { resolveProviderAccess } from "@/lib/ai-governance/provider-policy";
import { prismaProviderPolicyStore } from "@/lib/ai-governance/runtime/policy-store";
import type { GovernanceDenyReason, ModelRegistryEntry } from "@/lib/ai-governance/types";

import {
  deploymentEnvironment,
  isExternalAiEnabled,
  providerApiKey,
  voiceSigningSecret,
} from "./config";
import {
  VOICE_DATA_CLASS,
  VOICE_SPEECH_WORKFLOW,
  VOICE_TRANSCRIPTION_WORKFLOW,
} from "./contract";

export type VoiceLeg = "transcription" | "speech";

/**
 * Denial reasons this module can produce on top of the Phase 95 vocabulary.
 *
 * They are kept separate from `GovernanceDenyReason` because they describe the
 * HOST's configuration rather than a tenant's policy, and because none of them
 * may ever reach a client: the routes collapse the whole union into one
 * undifferentiated code.
 */
export type VoiceGovernanceDenyReason =
  | GovernanceDenyReason
  | "API_KEY_MISSING"
  | "SIGNING_SECRET_MISSING"
  | "TOOL_CALLING_NOT_PERMITTED";

export type VoiceGovernanceDecision =
  | { allowed: true; entry: ModelRegistryEntry; apiKey: string }
  | { allowed: false; reason: VoiceGovernanceDenyReason; registryId: string };

function legIdentity(leg: VoiceLeg): { registryId: string; workflow: string } {
  return leg === "transcription"
    ? { registryId: VOICE_TRANSCRIPTION_REGISTRY_ID, workflow: VOICE_TRANSCRIPTION_WORKFLOW }
    : { registryId: VOICE_SPEECH_REGISTRY_ID, workflow: VOICE_SPEECH_WORKFLOW };
}

/** Registry identity for a leg, independent of any runtime approval. Used for
 *  audit metadata, which must be recorded even when the decision is a denial. */
export function voiceRegistryEntry(leg: VoiceLeg): ModelRegistryEntry | null {
  return getRegistryEntry(legIdentity(leg).registryId);
}

export interface VoiceGovernanceInput {
  /** Server-derived. Never read from the request. */
  readonly organizationId: string;
  readonly leg: VoiceLeg;
  readonly now?: Date;
}

/**
 * Resolve whether this organisation may use this leg, right now.
 *
 * The API key is returned ONLY inside an `allowed` decision, so a denied caller
 * never holds one, and it is returned to the provider module alone.
 */
export async function resolveVoiceGovernance(
  input: VoiceGovernanceInput,
): Promise<VoiceGovernanceDecision> {
  const { registryId, workflow } = legIdentity(input.leg);

  // Host configuration first: these need no database round-trip and are the
  // cheapest possible denial.
  const externalAiEnabled = isExternalAiEnabled();
  if (!externalAiEnabled) return { allowed: false, reason: "FEATURE_FLAG_OFF", registryId };

  const apiKey = providerApiKey();
  if (!apiKey) return { allowed: false, reason: "API_KEY_MISSING", registryId };

  // No signing secret means no grant can be minted or verified, so the whole
  // chain that keeps the spoken text honest is absent. Deny before calling out.
  if (!voiceSigningSecret()) return { allowed: false, reason: "SIGNING_SECRET_MISSING", registryId };

  const entry = getRegistryEntry(registryId);
  if (!entry) return { allowed: false, reason: "UNKNOWN_PROVIDER", registryId };

  // Structural assertion, not a runtime configuration: if a future registry edit
  // ever set this true, every voice request would deny rather than silently
  // acquire the ability to call tools.
  if (entry.toolCallingAllowed) {
    return { allowed: false, reason: "TOOL_CALLING_NOT_PERMITTED", registryId };
  }

  const decision = await resolveProviderAccess(prismaProviderPolicyStore(), {
    organisationId: input.organizationId,
    providerRegistryId: registryId,
    dataClass: VOICE_DATA_CLASS,
    workflow,
    environment: deploymentEnvironment(),
    externalAiEnabled,
    now: input.now ?? new Date(),
  });

  if (!decision.allowed) return { allowed: false, reason: decision.reason, registryId };
  return { allowed: true, entry, apiKey };
}
