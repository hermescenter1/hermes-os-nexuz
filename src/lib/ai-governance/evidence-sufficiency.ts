// PHASE 95 — evidence sufficiency contract (deterministic-authoritative).
//
// Extends (does not replace) the deterministic engine's evidence view. The LLM
// may NEVER change the sufficiency state. Higher-risk recommendation classes
// require stronger evidence; when evidence is insufficient, the system must not
// express certainty or emit an action-ready industrial instruction — it lists
// missing evidence and safe data-collection steps, preserving deterministic
// confidence.

import type { EvidenceState, IndustrialOutputClass } from "./types";

/** Minimum sufficiency required to emit an ACTION-READY recommendation of a
 *  given class. Below this ⇒ downgrade to inspection/data-collection guidance. */
const MIN_SUFFICIENCY: Record<IndustrialOutputClass, EvidenceState> = {
  INFORMATIONAL: "PARTIALLY_SUFFICIENT",
  DIAGNOSTIC: "PARTIALLY_SUFFICIENT",
  INSPECTION: "PARTIALLY_SUFFICIENT",
  MAINTENANCE: "SUFFICIENT",
  CONFIGURATION: "SUFFICIENT",
  OPERATIONAL: "SUFFICIENT",
  CONTROL_ACTION: "SUFFICIENT",
  SAFETY_RELATED: "SUFFICIENT",
  SIS_OR_SAFETY_PLC: "SUFFICIENT",
  DESTRUCTIVE: "SUFFICIENT",
  IRREVERSIBLE: "SUFFICIENT",
};

const RANK: Record<EvidenceState, number> = {
  UNAVAILABLE: 0,
  MISSING: 0,
  CONTRADICTORY: 1,
  INSUFFICIENT: 1,
  PARTIALLY_SUFFICIENT: 2,
  SUFFICIENT: 3,
};

export interface EvidenceCounts {
  supporting: number;
  contradictory: number;
  /** Distinct evidence items the rule set expected but did not find. */
  missing: number;
  available: boolean;
}

/** Derive a sufficiency state from deterministic evidence counts. */
export function deriveSufficiency(counts: EvidenceCounts): EvidenceState {
  if (!counts.available) return "UNAVAILABLE";
  if (counts.supporting === 0 && counts.contradictory === 0) return "MISSING";
  if (counts.contradictory > 0 && counts.contradictory >= counts.supporting) return "CONTRADICTORY";
  if (counts.supporting >= 3 && counts.missing === 0) return "SUFFICIENT";
  if (counts.supporting >= 1) return "PARTIALLY_SUFFICIENT";
  return "INSUFFICIENT";
}

/** True when the evidence state meets the minimum for an action-ready output of
 *  the given class. */
export function meetsSufficiency(state: EvidenceState, outputClass: IndustrialOutputClass): boolean {
  return RANK[state] >= RANK[MIN_SUFFICIENCY[outputClass]];
}

export interface SufficiencyDecision {
  state: EvidenceState;
  actionReadyAllowed: boolean;
  /** When not action-ready, the caller must present inspection/data-collection
   *  guidance instead of an imperative recommendation. */
  mode: "ACTION_READY" | "DATA_COLLECTION_ONLY";
}

export function assessSufficiency(
  counts: EvidenceCounts,
  outputClass: IndustrialOutputClass,
): SufficiencyDecision {
  const state = deriveSufficiency(counts);
  const ok = meetsSufficiency(state, outputClass);
  return { state, actionReadyAllowed: ok, mode: ok ? "ACTION_READY" : "DATA_COLLECTION_ONLY" };
}
