/**
 * Engineering Memory Learning Loop (Phase 18C).
 *
 * Pure deterministic functions — no I/O, no network, no LLM.
 * Takes a memory (with its feedback history loaded) and derives:
 *
 *   computeOutcomeScore     — aggregates all feedback into a 0–10 score
 *   computeMemoryConfidence — adjusts stored confidence by feedback balance
 *   computeLearningWeight   — 0.3–1.5 multiplier for the final ranking score
 *
 * Intentionally imports only from `@/lib/storage/types` so this file can be
 * imported by `memory-retrieval.ts` without creating a circular dependency.
 *
 * Learning weight math (with examples):
 *   2 successes:               1.0 + 2×0.15          = 1.30  (+30 %)
 *   1 partial:                 1.0 + 1×0.05           = 1.05  (+5 %)
 *   2 failures:                1.0 - 2×0.10           = 0.80  (−20 %)
 *   1 success + 1 failure:     1.0 + 0.15 - 0.10      = 1.05  (+5 %)
 *   No feedback:               1.0                    (neutral)
 *   4 failures (floor):        max(0.3, 0.60)         = 0.60
 */

import type { StoredMemoryFeedback, MemoryWithFeedback } from "@/lib/storage/types";

// Internal constant — same numeric values as OUTCOME_SCORES in memory-retrieval.ts
// but intentionally kept separate to avoid a circular import.
const FEEDBACK_OUTCOME_WEIGHTS: Record<string, number> = {
  success: 10,
  partial: 7,
  unknown: 3,
  failed: 0,
};

// ---- Public functions -------------------------------------------------------

/**
 * Aggregates all feedback entries into a single 0–10 outcome score.
 * With no feedback: returns 3 (neutral / "unknown" equivalent).
 * With feedback: weighted average of each entry's outcome score, rounded.
 */
export function computeOutcomeScore(feedback: StoredMemoryFeedback[]): number {
  if (feedback.length === 0) return FEEDBACK_OUTCOME_WEIGHTS.unknown ?? 3;
  const sum = feedback.reduce(
    (acc, f) => acc + (FEEDBACK_OUTCOME_WEIGHTS[f.outcome] ?? FEEDBACK_OUTCOME_WEIGHTS.unknown),
    0
  );
  return Math.round(sum / feedback.length);
}

/**
 * Derives a feedback-adjusted confidence score (0–100).
 *
 * Algorithm:
 *   resolvedRatio = (successCount + partialCount) / total  → 0..1
 *   failedRatio   = failedCount / total                    → 0..1
 *   adjustment    = (resolvedRatio − failedRatio) × 20     → −20..+20
 *   learnedConf   = clamp(base + adjustment, 0, 100)
 *
 * With no feedback: returns `memory.confidence` unchanged.
 * All successes (+20): shifts confidence up by up to 20 points.
 * All failures (−20): shifts confidence down by up to 20 points.
 */
export function computeMemoryConfidence(memory: MemoryWithFeedback): number {
  const { feedback } = memory;
  if (feedback.length === 0) return memory.confidence;

  const total        = feedback.length;
  const successCount = feedback.filter((f) => f.outcome === "success").length;
  const partialCount = feedback.filter((f) => f.outcome === "partial").length;
  const failedCount  = feedback.filter((f) => f.outcome === "failed").length;

  const resolvedRatio = (successCount + partialCount) / total;
  const failedRatio   = failedCount / total;
  const adjustment    = (resolvedRatio - failedRatio) * 20;

  return Math.max(0, Math.min(100, Math.round(memory.confidence + adjustment)));
}

/**
 * Computes a multiplicative learning weight (0.30–1.50).
 *
 * Applied to the raw score at the end of `scoreLearned`:
 *   finalScore = clamp(rawScore × learningWeight, 0, 100)
 *
 * With no feedback: 1.0 (neutral — identical to Phase 18B behaviour).
 * Each success:    +0.15
 * Each partial:    +0.05
 * Each failure:    −0.10
 * Floor 0.3, ceiling 1.5 — prevents extreme outliers.
 */
export function computeLearningWeight(memory: MemoryWithFeedback): number {
  const { feedback } = memory;
  if (feedback.length === 0) return 1.0;

  const successCount = feedback.filter((f) => f.outcome === "success").length;
  const partialCount = feedback.filter((f) => f.outcome === "partial").length;
  const failedCount  = feedback.filter((f) => f.outcome === "failed").length;

  const raw = 1.0 + successCount * 0.15 + partialCount * 0.05 - failedCount * 0.10;
  return Math.max(0.3, Math.min(1.5, Math.round(raw * 100) / 100));
}
