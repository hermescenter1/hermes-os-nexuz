// PHASE 95 runtime — deterministic adapter mapping the actual Brain pipeline
// result + retrieved corpus into the governance pipeline's authoritative inputs.
//
// Pure and deterministic: no I/O, no provider call, no invention of values.
// Where the Brain result lacks a governance field (e.g. an explicit rule
// id/version or output class), it is DERIVED here by a documented deterministic
// rule and covered by tests — never guessed at the call site.

import type { DeterministicResult } from "../output-schema";
import type { EvidenceCounts } from "../evidence-sufficiency";
import type { EvidenceState, IndustrialOutputClass } from "../types";
import type { GovernedSource } from "./brain-governance";

/** The exact deterministic facts the route already computed. */
export interface BrainDeterministicSnapshot {
  confidence: number;
  /** reasoning.riskLevel — "low" | "medium" | "high" | "critical" | "unknown". */
  riskLevel: string;
  /** analysis.safety — "electrical" | "mechanical" | "general" | ... */
  safety: string;
  /** True when the guardrail flagged a safety-bypass intent. */
  guardrailFlagged: boolean;
  /** The deterministic human-approval requirement (Brain sets this true). */
  humanApprovalRequired: boolean;
  rootCauseId: string | null;
  domainId: string | null;
  probableCauses: string[];
  recommendedActions: string[];
  /** Deterministic case-match ids (the authoritative citation set). */
  caseIds: string[];
  /** Count of deterministic evidence items (reasoning.evidence.length). */
  evidenceCount: number;
}

export interface DeterministicBrainInput extends DeterministicResult {
  resultVersion: string;
  outputClass: IndustrialOutputClass;
  facts: string;
}

const RESULT_VERSION = "phase94";

function clampConfidence(c: number): number {
  if (!Number.isFinite(c)) return 0;
  return Math.max(0, Math.min(1, c));
}

/** Brain emits diagnostic reasoning only. A guardrail-flagged request is
 *  SAFETY_RELATED; everything else is DIAGNOSTIC. Brain never emits control/
 *  operational actions, so higher classes are never derived here. */
export function deriveOutputClass(snap: BrainDeterministicSnapshot): IndustrialOutputClass {
  return snap.guardrailFlagged ? "SAFETY_RELATED" : "DIAGNOSTIC";
}

export function deriveEvidenceState(snap: BrainDeterministicSnapshot): EvidenceState {
  const cases = snap.caseIds.length;
  const ev = snap.evidenceCount;
  if (cases >= 1 && ev >= 2) return "SUFFICIENT";
  if (cases >= 1 || ev >= 1) return "PARTIALLY_SUFFICIENT";
  return "INSUFFICIENT";
}

export function deriveEvidenceCounts(snap: BrainDeterministicSnapshot): EvidenceCounts {
  return {
    supporting: Math.max(snap.evidenceCount, snap.caseIds.length),
    contradictory: 0,
    missing: snap.caseIds.length === 0 && snap.evidenceCount === 0 ? 1 : 0,
    available: true,
  };
}

export function deriveDeterministicInput(snap: BrainDeterministicSnapshot): DeterministicBrainInput {
  const outputClass = deriveOutputClass(snap);
  const faultCode = snap.rootCauseId ?? snap.domainId ?? "UNSPECIFIED";
  return {
    confidence: clampConfidence(snap.confidence),
    evidenceState: deriveEvidenceState(snap),
    faultCode,
    ruleId: `brain:${faultCode}`,
    ruleVersion: RESULT_VERSION,
    safetyClass: outputClass,
    humanApprovalRequired: snap.humanApprovalRequired,
    citationIds: snap.caseIds,
    resultVersion: RESULT_VERSION,
    outputClass,
    facts: [
      `Probable causes: ${snap.probableCauses.join(" | ")}`,
      `Recommended actions: ${snap.recommendedActions.join(" | ")}`,
      `Risk level: ${snap.riskLevel}`,
    ].join("\n"),
  };
}

/** A retrieved corpus item as seen by the route (published knowledge). */
export interface CorpusItem {
  id: string;
  text: string;
  kind: "case" | "library";
}

/**
 * Map published-corpus items to GovernedSource records. `getPublishedCorpus`
 * returns PUBLISHED, cross-tenant-visible knowledge, so these carry no private
 * tenant ownership (organisationId = null = platform-published). Libraries are
 * platform reference docs (platform_reviewed); cases are the published knowledge
 * base (tenant_reviewed). Every item is untrusted DATA in the envelope; the
 * provenance filter still applies (draft/revoked/archived are excluded upstream
 * by getPublishedCorpus returning published-only). Nothing is over-trusted.
 */
export function mapCorpusToSources(items: readonly CorpusItem[]): GovernedSource[] {
  return items.map((it) => ({
    provenance: {
      sourceRef: it.id,
      organisationId: null,
      siteId: null,
      publicationState: "published",
      reviewState: it.kind === "library" ? "platform_reviewed" : "tenant_reviewed",
      archived: false,
      revoked: false,
      deleted: false,
      version: "published",
      checksum: null,
      authorId: null,
      isPublic: true,
    },
    text: it.text,
    accessibleToUser: true,
  }));
}
