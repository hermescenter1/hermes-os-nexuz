import type {
  ScoredCase,
  ScoredKnowledge,
  ScoredEvidence,
  ConfidenceBand,
} from "./retrieval-types";

/**
 * Evidence ranking + confidence derivation (Phase 10).
 *
 * Sorts evidence highest-first, takes the top 3 of each kind, and derives a
 * NON-FIXED confidence from the strongest case, strongest knowledge, and
 * vendor certainty. Deterministic; ties broken by id for stable output.
 */

function byScoreThenId(a: ScoredEvidence, b: ScoredEvidence): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.id.localeCompare(b.id);
}

export function rankCases(scored: ScoredCase[]): ScoredCase[] {
  return [...scored].sort(byScoreThenId).slice(0, 3) as ScoredCase[];
}

export function rankKnowledge(scored: ScoredKnowledge[]): ScoredKnowledge[] {
  return [...scored].sort(byScoreThenId).slice(0, 3) as ScoredKnowledge[];
}

/** Merged ranking across both kinds for the Evidence Ranking card. */
export function mergeRanking(
  cases: ScoredCase[],
  knowledge: ScoredKnowledge[]
): ScoredEvidence[] {
  return [...cases, ...knowledge].sort(byScoreThenId).slice(0, 6);
}

export function bandFor(confidence: number): ConfidenceBand {
  if (confidence >= 0.7) return "high";
  if (confidence >= 0.4) return "medium";
  return "low";
}

/**
 * Non-fixed confidence in 0..1. Evidence-led, so a single strong source can
 * carry the result rather than being diluted by a fixed split:
 *   - dominant = the stronger of best case / best knowledge (weight 0.65)
 *   - corroboration = the weaker of the two (weight 0.20), rewarding
 *     agreement between independent evidence streams
 *   - vendor certainty (weight 0.15): one clear vendor = full, several = less
 * Each score component is the candidate's 0..100 normalized to 0..1.
 */
export function deriveConfidence(
  topCases: ScoredCase[],
  topKnowledge: ScoredKnowledge[],
  vendorCount: number
): number {
  const bestCase = (topCases[0]?.score ?? 0) / 100;
  const bestKnow = (topKnowledge[0]?.score ?? 0) / 100;
  const dominant = Math.max(bestCase, bestKnow);
  const corroboration = Math.min(bestCase, bestKnow);
  const vendorCertainty =
    vendorCount <= 0 ? 0 : vendorCount === 1 ? 1 : vendorCount === 2 ? 0.7 : 0.5;

  const raw = dominant * 0.65 + corroboration * 0.2 + vendorCertainty * 0.15;
  let conf = Math.min(Math.max(raw, 0), 1);

  // Floor: a domain-confirmed knowledge match (>=40, the domain component
  // fired) is genuine medium-grade evidence even with no vendor or case, so
  // it should not read "low". Mirrors how the pipeline treats a confident
  // domain classification.
  const bestKnowScore = topKnowledge[0]?.score ?? 0;
  if (bestKnowScore >= 40 && conf < 0.4) conf = 0.4;

  return Math.round(conf * 100) / 100;
}
