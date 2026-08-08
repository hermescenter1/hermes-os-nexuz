// PHASE 95 runtime — the Brain governance enforcement pipeline.
//
// The single place the governance library is composed into a real completion
// flow. The deterministic result is ALWAYS authoritative; the LLM may only add
// approved explanatory fields. Any denial, provider failure, malformed output,
// invalid citation, unsafe content, injection, or insufficient evidence falls
// back to the deterministic result. Produces a privacy-preserving execution
// trace (hashes only). The LLM runner is INJECTED, so this is fully testable
// offline with no provider call.

import { screenForInjection } from "../injection-screen";
import { filterRetrievableSources, type SourceProvenance } from "../rag-provenance";
import { assessSufficiency, type EvidenceCounts } from "../evidence-sufficiency";
import { evaluateProviderAccess, type ProviderPolicyStore } from "../provider-policy";
import { decideRoute } from "../router";
import { buildPromptEnvelope, type EnvelopeSource } from "../prompt-envelope";
import { parseLlmOutput, type DeterministicResult } from "../output-schema";
import { verifyCitations, type RetrievedSource } from "../citation-verifier";
import { enforceUnsafeOutputPolicy } from "../unsafe-output";
import { buildExecutionTrace, type ExecutionTraceRecord } from "../execution-trace";
import type { DataClass, DeploymentEnvironment, IndustrialOutputClass, RouteDecision } from "../types";

export interface GovernedSource {
  provenance: SourceProvenance;
  /** The retrieved text (untrusted evidence data). */
  text: string;
  accessibleToUser: boolean;
}

export interface GovernedBrainInput {
  context: {
    organisationId: string | null;
    siteId: string | null;
    userId: string | null;
    workflow: string;
    environment: DeploymentEnvironment;
    externalAiEnabled: boolean;
    dataClass: DataClass;
  };
  deterministic: DeterministicResult & {
    resultVersion: string;
    outputClass: IndustrialOutputClass;
    /** The authoritative deterministic explanation shown when no LLM runs. */
    facts: string;
  };
  question: string;
  retrievedSources: GovernedSource[];
  evidenceCounts: EvidenceCounts;
  providerRegistryId: string;
  systemPolicy: string;
  /** Injected LLM runner — returns provider text or a failure. No real call in tests. */
  runLlm: (envelope: { system: string; user: string }) => Promise<{ ok: true; text: string; inputTokens?: number; outputTokens?: number; latencyMs?: number } | { ok: false; code: string }>;
  policyStore: ProviderPolicyStore;
  traceId: string;
  now: string; // ISO
}

export interface GovernedBrainResult {
  executionMode: RouteDecision;
  status: "ALLOW" | "REVIEW_REQUIRED" | "BLOCKED";
  rephrasedSummary: string | null;
  explanation: string | null;
  /** Server-issued citation ids that survived verification (for display). */
  citations: string[];
  humanApprovalRequired: boolean;
  fallbackReason: string | null;
  /** Deterministic authoritative fields — never altered by the LLM. */
  deterministic: DeterministicResult;
  trace: ExecutionTraceRecord;
}

export async function enforceBrainGovernance(input: GovernedBrainInput): Promise<GovernedBrainResult> {
  const { context: ctx, deterministic: det } = input;

  // 1. Injection screen on the user question.
  const injection = screenForInjection(input.question);

  // 2. Provenance filter — never retrieve cross-tenant / revoked / archived, etc.
  const filtered = filterRetrievableSources(
    input.retrievedSources.map((s) => s.provenance),
    { organisationId: ctx.organisationId, siteId: ctx.siteId, safetyRelevant: isSafetyRelevant(det.outputClass), includeArchived: false },
  );
  // Assign opaque, server-issued citation ids (S1..) to usable sources only.
  const usable = filtered.usable.map((u, i) => {
    const original = input.retrievedSources.find((s) => s.provenance.sourceRef === u.source.sourceRef)!;
    return { citationId: `S${i + 1}`, source: u.source, decision: u.decision, text: original.text, accessibleToUser: original.accessibleToUser };
  });
  const envelopeSources: EnvelopeSource[] = usable.map((u) => ({ citationId: u.citationId, trustClass: u.decision.trustClass, text: u.text }));
  const verifySet: RetrievedSource[] = usable.map((u) => ({
    citationId: u.citationId,
    sourceRef: u.source.sourceRef,
    organisationId: u.source.organisationId,
    siteId: u.source.siteId,
    version: u.source.version,
    accessibleToUser: u.accessibleToUser,
    deleted: u.source.deleted,
    revoked: u.source.revoked,
    retrievedThisExecution: true,
  }));
  const allowedCitationIds = usable.map((u) => u.citationId);

  // 3. Evidence sufficiency (deterministic-authoritative).
  const sufficiency = assessSufficiency(input.evidenceCounts, det.outputClass);

  // 4. Provider access (fail-closed, default-deny).
  const policy = await input.policyStore.find(ctx.organisationId ?? "", input.providerRegistryId);
  const access = evaluateProviderAccess(
    {
      organisationId: ctx.organisationId ?? "",
      providerRegistryId: input.providerRegistryId,
      dataClass: ctx.dataClass,
      workflow: ctx.workflow,
      environment: ctx.environment,
      externalAiEnabled: ctx.externalAiEnabled,
      now: new Date(input.now),
    },
    policy,
  );

  // 5. Route.
  const route = decideRoute({
    workflow: ctx.workflow,
    environment: ctx.environment,
    externalProviderAuthorised: access.allowed,
    providerAvailable: true,
    evidenceState: sufficiency.state,
    outputClass: det.outputClass,
    injectionHighRisk: injection.highRisk,
    productionMockEmbeddingFallback: false,
    retrievalOnly: false,
  });

  let rephrasedSummary: string | null = null;
  let explanation: string | null = null;
  let citations: string[] = [];
  let fallbackReason: string | null = access.allowed ? null : `provider_denied_${access.reason}`;
  let providerAttempted = false;
  let providerSucceeded = false;
  let providerText = "";
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let latencyMs: number | null = null;

  if (route.llmAllowed) {
    const envelope = buildPromptEnvelope({
      systemPolicy: input.systemPolicy,
      userQuestion: input.question,
      deterministicFacts: det.facts,
      retrievedSources: envelopeSources,
      allowedCitationIds,
    });
    providerAttempted = true;
    const llm = await input.runLlm({ system: envelope.system, user: envelope.user });
    if (!llm.ok) {
      fallbackReason = `provider_${llm.code}`;
    } else {
      providerSucceeded = true;
      providerText = llm.text;
      inputTokens = llm.inputTokens ?? null;
      outputTokens = llm.outputTokens ?? null;
      latencyMs = llm.latencyMs ?? null;
      const parsed = parseLlmOutput(llm.text, allowedCitationIds);
      if (!parsed.ok) {
        fallbackReason = `output_${parsed.reason}`;
      } else {
        // Citations must ALL verify, else reject the whole LLM output.
        const verified = verifyCitations(parsed.value.citationIds, verifySet, { organisationId: ctx.organisationId, siteId: ctx.siteId });
        if (verified.rejected.length > 0) {
          fallbackReason = "citation_invalid";
        } else if (enforceUnsafeOutputPolicy(det.outputClass, det.humanApprovalRequired, `${parsed.value.rephrasedSummary}\n${parsed.value.explanation}`).status === "BLOCKED") {
          fallbackReason = "unsafe_output";
        } else {
          rephrasedSummary = parsed.value.rephrasedSummary;
          explanation = parsed.value.explanation;
          citations = verified.valid;
        }
      }
    }
  } else {
    fallbackReason = fallbackReason ?? route.reason;
  }

  // 6. Unsafe-output policy over the FINAL text (deterministic + any rephrase).
  const finalText = [det.facts, rephrasedSummary ?? "", explanation ?? ""].join("\n");
  const unsafe = enforceUnsafeOutputPolicy(det.outputClass, det.humanApprovalRequired, finalText);
  if (unsafe.status === "BLOCKED") {
    rephrasedSummary = null;
    explanation = null;
    citations = [];
    fallbackReason = fallbackReason ?? "unsafe_output";
  }
  // The model can only RAISE the approval requirement, never lower it.
  const humanApprovalRequired = det.humanApprovalRequired || unsafe.humanApprovalRequired;

  const executionMode: RouteDecision =
    unsafe.status === "BLOCKED" ? "BLOCKED" : rephrasedSummary !== null ? "DETERMINISTIC_PLUS_LLM_REPHRASE" : route.decision === "DETERMINISTIC_PLUS_LLM_REPHRASE" ? "DETERMINISTIC_ONLY" : route.decision;

  const trace = buildExecutionTrace({
    traceId: input.traceId,
    organisationId: ctx.organisationId,
    siteId: ctx.siteId,
    userId: ctx.userId,
    workflow: ctx.workflow,
    executionMode,
    providerRegistryId: providerAttempted ? input.providerRegistryId : null,
    modelId: providerAttempted ? input.providerRegistryId : null,
    policyVersion: access.allowed ? access.policyVersion : null,
    deterministicResultVersion: det.resultVersion,
    rawInput: `${det.facts}\n${input.question}`,
    rawOutput: providerText,
    sourceReferenceIds: allowedCitationIds,
    citationVerificationStatus: rephrasedSummary !== null ? "ok" : citations.length === 0 && providerAttempted ? "none" : "not_applicable",
    evidenceSufficiency: sufficiency.state,
    confidence: det.confidence,
    safetyDecision: unsafe.status,
    humanApprovalRequired,
    fallbackReason,
    providerAttempted,
    providerSucceeded,
    latencyMs,
    inputTokenCount: inputTokens,
    outputTokenCount: outputTokens,
    createdAt: input.now,
  });

  return {
    executionMode,
    status: unsafe.status,
    rephrasedSummary,
    explanation,
    citations,
    humanApprovalRequired,
    fallbackReason,
    deterministic: {
      confidence: det.confidence,
      evidenceState: det.evidenceState,
      faultCode: det.faultCode,
      ruleId: det.ruleId,
      ruleVersion: det.ruleVersion,
      safetyClass: det.safetyClass,
      humanApprovalRequired,
      citationIds: det.citationIds,
    },
    trace,
  };
}

function isSafetyRelevant(cls: IndustrialOutputClass): boolean {
  return ["SAFETY_RELATED", "SIS_OR_SAFETY_PLC", "CONTROL_ACTION", "DESTRUCTIVE", "IRREVERSIBLE"].includes(cls);
}
