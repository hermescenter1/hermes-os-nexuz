// PHASE 95 — AI execution trace (privacy-preserving).
//
// Every provider decision and AI-assisted execution produces a structured trace
// of IDENTIFIERS, HASHES and CLASSIFICATIONS — never raw prompts, raw responses,
// secrets or confidential source text. This module BUILDS the trace record (pure
// + hashing only); persistence is the caller's concern (an additive Prisma model
// is proposed in docs, bound via a store). Audit-event names are defined here so
// the governance decisions are auditable through the existing audit pipeline.

import { createHash } from "node:crypto";

export type ExecutionMode =
  | "DETERMINISTIC_ONLY"
  | "DETERMINISTIC_PLUS_LLM_REPHRASE"
  | "RETRIEVAL_ONLY"
  | "BLOCKED"
  | "HUMAN_REVIEW_REQUIRED";

export interface ExecutionTraceInput {
  traceId: string;
  organisationId: string | null;
  siteId: string | null;
  userId: string | null;
  workflow: string;
  executionMode: ExecutionMode;
  providerRegistryId: string | null;
  modelId: string | null;
  policyVersion: string | null;
  deterministicResultVersion: string;
  /** Raw input/output — HASHED here, never stored. */
  rawInput: string;
  rawOutput: string;
  sourceReferenceIds: string[];
  citationVerificationStatus: "ok" | "partial" | "none" | "not_applicable";
  evidenceSufficiency: string;
  confidence: number;
  safetyDecision: string;
  humanApprovalRequired: boolean;
  fallbackReason: string | null;
  providerAttempted: boolean;
  providerSucceeded: boolean;
  latencyMs: number | null;
  inputTokenCount: number | null;
  outputTokenCount: number | null;
  createdAt: string; // ISO — injected for determinism
}

export interface ExecutionTraceRecord {
  traceId: string;
  organisationId: string | null;
  siteId: string | null;
  userId: string | null;
  workflow: string;
  executionMode: ExecutionMode;
  providerRegistryId: string | null;
  modelId: string | null;
  policyVersion: string | null;
  deterministicResultVersion: string;
  /** SHA-256 hex of the raw input/output. The raw text is discarded. */
  inputHash: string;
  outputHash: string;
  sourceReferenceIds: string[];
  citationVerificationStatus: string;
  evidenceSufficiency: string;
  confidence: number;
  safetyDecision: string;
  humanApprovalRequired: boolean;
  fallbackReason: string | null;
  providerAttempted: boolean;
  providerSucceeded: boolean;
  latencyMs: number | null;
  inputTokenCount: number | null;
  outputTokenCount: number | null;
  createdAt: string;
}

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

/** Build a trace record. Guarantees raw prompt/response never appear in output. */
export function buildExecutionTrace(input: ExecutionTraceInput): ExecutionTraceRecord {
  const { rawInput, rawOutput, ...rest } = input;
  return {
    ...rest,
    inputHash: sha256(rawInput ?? ""),
    outputHash: sha256(rawOutput ?? ""),
  };
}

/** Governance audit-event names (routed through the existing audit pipeline). */
export const AI_GOVERNANCE_AUDIT = {
  PROVIDER_ALLOWED: "ai.provider.allowed",
  PROVIDER_DENIED: "ai.provider.denied",
  PROVIDER_FALLBACK: "ai.provider.fallback",
  MALFORMED_OUTPUT: "ai.output.malformed",
  INVALID_CITATION: "ai.citation.invalid",
  INJECTION_DETECTED: "ai.injection.detected",
  RAG_POISONING_BLOCKED: "ai.rag.poisoning_blocked",
  UNSAFE_OUTPUT_BLOCKED: "ai.output.unsafe_blocked",
  HUMAN_APPROVAL_REQUIRED: "ai.output.human_approval_required",
} as const;

export type AiGovernanceAuditAction = (typeof AI_GOVERNANCE_AUDIT)[keyof typeof AI_GOVERNANCE_AUDIT];
