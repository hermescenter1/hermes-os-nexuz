import type { BrainAnalysis } from "@/lib/services/types";

/**
 * Engineering Report assembler (Phase 9B).
 *
 * Pure, deterministic projection over an existing BrainAnalysis. It invents
 * nothing: every field is sourced from data the Brain already produced
 * (ranked root cause, reasoning engine, domain/vendor classification,
 * matched cases, knowledge libraries). No LLM, no network, no randomness —
 * identical analysis always yields an identical report.
 *
 * Localized strings (labels for the Supporting Evidence bullets) are passed
 * in by the caller so this stays framework-agnostic and testable.
 */

export interface EvidenceLabels {
  maintenanceEvent: string;
  domainDetected: (domain: string) => string;
  vendorDetected: (vendor: string) => string;
  casesFound: (n: number) => string;
  relatedCaseLow: string;
  evidenceScore: (n: number) => string;
}

export interface EngineeringReport {
  /** true only when there is enough signal to be worth showing a report */
  available: boolean;
  problemSummary: string;
  rootCause: string | null;
  rootCauseLowConfidence: boolean;
  supportingEvidence: string[];
  verificationSteps: string[];
  correctiveActions: string[];
  safetyNote: string;
}

/** Maintenance-context terms (mirrors the domain-expansion vocabulary). */
const MAINTENANCE_HINTS = [
  "after maintenance", "maintenance", "shutdown", "after replacement",
  "replacement", "replaced", "replacing", "swapped", "changed", "after work",
  "تعمیر", "تعویض", "جایگزین", "خاموشی", "پس از کار",
];

function mentionsMaintenance(question: string): boolean {
  const q = question.toLowerCase();
  return MAINTENANCE_HINTS.some((h) => q.includes(h));
}

export function buildEngineeringReport(
  question: string,
  a: BrainAnalysis,
  labels: EvidenceLabels,
  safetyNote: string
): EngineeringReport {
  // Unknown analyses carry no reliable signal — no report.
  if (a.unknown) {
    return {
      available: false,
      problemSummary: question.trim(),
      rootCause: null,
      rootCauseLowConfidence: false,
      supportingEvidence: [],
      verificationSteps: [],
      correctiveActions: [],
      safetyNote,
    };
  }

  const rc = a.rootCause;

  // Problem Summary — the user's own description, trimmed. Deterministic and
  // faithful; we do not paraphrase (that would require generation).
  const problemSummary = question.trim();

  // Most Likely Root Cause — the ranked primary, when one exists.
  const rootCause = rc?.primary ?? a.probableCauses?.[0] ?? null;
  const rootCauseLowConfidence = rc?.relatedCase?.lowConfidence === true;

  // Supporting Evidence — assembled from classification facets, in priority
  // order: maintenance context, domains, vendors, matched cases, evidence.
  const supportingEvidence: string[] = [];
  if (mentionsMaintenance(question)) supportingEvidence.push(labels.maintenanceEvent);
  for (const d of a.domains ?? []) supportingEvidence.push(labels.domainDetected(d.id));
  for (const v of a.vendors ?? []) supportingEvidence.push(labels.vendorDetected(v));
  const caseCount = a.evidence?.cases?.length ?? 0;
  if (caseCount > 0) supportingEvidence.push(labels.casesFound(caseCount));
  else if (rc?.relatedCase) supportingEvidence.push(labels.relatedCaseLow);

  // Verification Steps — from the ranked root cause, else the reasoning engine.
  const verificationSteps = rc?.verification?.length
    ? [...rc.verification]
    : [];

  // Corrective Actions — case-promoted root causes carry them; otherwise fall
  // back to the deterministic reasoning engine's recommended actions.
  const correctiveActions =
    rc?.correctiveActions?.length
      ? [...rc.correctiveActions]
      : [...(a.recommendedActions ?? [])];

  return {
    available: rootCause !== null,
    problemSummary,
    rootCause,
    rootCauseLowConfidence,
    supportingEvidence,
    verificationSteps,
    correctiveActions,
    safetyNote,
  };
}
