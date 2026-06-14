/**
 * Confidence Engine (Step 8C).
 *
 * Pure deterministic scoring — no AI estimation anywhere. The score is a
 * documented weighted sum of the four specified signals; identical input
 * always yields identical output.
 *
 * Weights (max 101, clamped to 100):
 *   domain confidence  × 50   — classification signal strength (0..1)
 *   vendor confidence  × 15   — vendor context certainty (0..1)
 *   case matches       × 8    — field-case corroboration, capped at 3 (24)
 *   evidence count     × 2    — breadth of evidence basis, capped at 6 (12)
 *
 * Case matches carry the heaviest per-unit weight deliberately: a matched
 * engineering case is the strongest corroboration a keyword system has.
 *
 * Classification bands (spec-exact):
 *   90–100 expert · 70–89 high · 50–69 medium · 0–49 low
 */

export interface ConfidenceInput {
  /** classifier signal strength, 0..1 (pipeline confidence) */
  domainConfidence: number;
  /** vendor detection certainty, 0..1 (see vendorCertainty) */
  vendorConfidence: number;
  /** number of matched engineering cases */
  caseMatches: number;
  /** number of evidence entries from the reasoning engine */
  evidenceCount: number;
}

export type ConfidenceClass = "expert" | "high" | "medium" | "low";

export interface ConfidenceResult {
  /** integer 0..100 */
  score: number;
  classification: ConfidenceClass;
}

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);

/** Vendor list → certainty: one clear vendor is certainty; several
 *  competing vendor mentions are ambiguity, not strength. */
export function vendorCertainty(vendorCount: number): number {
  if (vendorCount <= 0) return 0;
  if (vendorCount === 1) return 1;
  if (vendorCount === 2) return 0.7;
  return 0.5;
}

export function classify(score: number): ConfidenceClass {
  if (score >= 90) return "expert";
  if (score >= 70) return "high";
  if (score >= 50) return "medium";
  return "low";
}

export function computeConfidence(input: ConfidenceInput): ConfidenceResult {
  const domain = clamp01(input.domainConfidence) * 50;
  const vendor = clamp01(input.vendorConfidence) * 15;
  const cases = Math.min(Math.max(input.caseMatches, 0), 3) * 8;
  const evidence = Math.min(Math.max(input.evidenceCount, 0), 6) * 2;

  const score = Math.min(Math.round(domain + vendor + cases + evidence), 100);
  return { score, classification: classify(score) };
}
