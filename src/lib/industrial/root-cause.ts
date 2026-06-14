import type { CaseMatch } from "./cases";

/**
 * Case-Driven Root Cause Engine (Step 8).
 *
 * Generation priority: Engineering Case > Vendor Knowledge > Generic
 * Library. When at least one engineering case matches, the highest-ranked
 * match becomes the primary case and supplies the analysis; the generic
 * "based on library X" cause is suppressed downstream. With no case match,
 * this engine returns undefined and current behavior is fully preserved.
 * Deterministic; no LLM involvement.
 */

export interface RootCauseAnalysis {
  primary: string;
  secondary: string[];
  verification: string[];
  correctiveActions?: string[];
  /* ---- Cause Ranking (case-memory-bias fix), all additive ---- */
  alternative?: string[];
  /** transparency: top candidates with scores */
  ranking?: { label: string; score: number; source: "rule" | "case" | "catalog" }[];
  /** present when a case matched below the similarity threshold */
  relatedCase?: { caseId: string; similarity: number; lowConfidence: true };
}

export function buildRootCause(
  caseMatches: CaseMatch[],
  locale: "fa" | "en"
): RootCauseAnalysis | undefined {
  if (caseMatches.length === 0) return undefined;

  const primaryCase = caseMatches[0].case;
  const c = primaryCase[locale];

  const primary = c.rootCauses[0] ?? c.rootCause;
  // secondary: remaining causes of the primary case, then leading causes
  // of other matched cases (deduplicated, capped)
  const secondary = [
    ...c.rootCauses.slice(1),
    ...caseMatches.slice(1).flatMap((m) => m.case[locale].rootCauses.slice(0, 1)),
  ];

  return {
    primary,
    secondary: [...new Set(secondary)].filter((s) => s !== primary).slice(0, 4),
    verification: c.verificationSteps.slice(0, 4),
    correctiveActions: c.correctiveActions.slice(0, 4),
  };
}
