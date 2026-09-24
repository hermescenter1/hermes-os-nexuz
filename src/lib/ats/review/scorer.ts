/**
 * ATS-S1 — deterministic scoring and recommendation.
 *
 * Rules, all stated here and versioned by ATS_RUBRIC_VERSION:
 *
 *   HARD GATES
 *     experience gate  years OBSERVED ≥ min → PASS (evidence: the observation)
 *                      years OBSERVED < min → FAIL (evidence: the observation)
 *                      years UNKNOWN        → UNKNOWN
 *     must-have gate   any evidence → PASS; none → UNKNOWN (absence ≠ failure)
 *     disqualifier     explicit evidence → FAIL; none → PASS is NOT asserted —
 *                      a disqualifier with no evidence simply does not fire and
 *                      is reported UNKNOWN, because "not stated" is not "not so"
 *
 *   DIMENSION SCORE    Σ weight(matched must/nice) ÷ Σ weight(all must/nice)
 *                      in that dimension × 100; null when the dimension has no
 *                      criteria. Disqualifiers carry no weight.
 *   OVERALL            weighted mean of non-null dimension scores by the
 *                      profile's dimension weights; null if all are null.
 *   CONFIDENCE         starts at 40; +60 × evidence coverage; −15 per UNKNOWN
 *                      hard gate; −25 with no résumé text; −20 on suspected
 *                      injection; clamped 0..100.
 *   RECOMMENDATION     any FAIL gate            → REJECT_RECOMMENDED
 *                      any UNKNOWN gate         → REVIEW_REQUIRED
 *                      overall null or < 45     → REVIEW_REQUIRED
 *                      45 ≤ overall < 70        → HOLD
 *                      overall ≥ 70             → ADVANCE
 *
 * A recommendation is advice. Nothing in this module or its callers changes an
 * application's status; REJECT_RECOMMENDED in particular is a suggestion that a
 * human must confirm with a written reason, or overrule.
 */

import type { RoleProfile } from "./catalog";
import type { ExtractionResult } from "./extractor";
import { DIMENSIONS, type Dimension, type Evidence, type HardGateResult } from "./report-schema";

export const ADVANCE_THRESHOLD = 70;
export const HOLD_THRESHOLD = 45;

export interface DimensionScore {
  dimension: Dimension;
  score: number | null;
  weightApplied: number;
  matched: number;
  total: number;
}

export interface ScoreResult {
  hardGates: HardGateResult[];
  dimensionScores: DimensionScore[];
  overallScore: number | null;
  confidence: number;
  recommendation: "ADVANCE" | "REVIEW_REQUIRED" | "HOLD" | "REJECT_RECOMMENDED";
  yearsObserved: { status: "OBSERVED"; value: number; evidence: Evidence } | { status: "UNKNOWN"; reason: string };
  experienceContradiction: { a: Evidence; b: Evidence; note: string } | null;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** The single observed years value: the form field wins; else the LARGEST text mention. */
export function observeYears(x: ExtractionResult["years"]): ScoreResult["yearsObserved"] {
  if (x.form) return { status: "OBSERVED", value: Number(x.form.quote), evidence: x.form };
  if (x.mentions.length > 0) {
    const top = [...x.mentions].sort((a, b) => b.years - a.years)[0];
    return { status: "OBSERVED", value: top.years, evidence: top.evidence };
  }
  return { status: "UNKNOWN", reason: "no years-of-experience value was supplied or stated" };
}

/** Form says one thing, the résumé says something ≥ 3 years different. */
export function detectExperienceContradiction(x: ExtractionResult["years"]): ScoreResult["experienceContradiction"] {
  if (!x.form || x.mentions.length === 0) return null;
  const formYears = Number(x.form.quote);
  const top = [...x.mentions].sort((a, b) => b.years - a.years)[0];
  if (Math.abs(top.years - formYears) >= 3) {
    return {
      a: x.form,
      b: top.evidence,
      note: `form states ${formYears} years; text mentions ${top.years} years`,
    };
  }
  return null;
}

export function scoreExtraction(profile: RoleProfile, x: ExtractionResult): ScoreResult {
  const yearsObserved = observeYears(x.years);
  const experienceContradiction = detectExperienceContradiction(x.years);

  const hardGates: HardGateResult[] = [];
  for (const { criterion, evidence } of x.criteria) {
    if (!criterion.hardGate) continue;
    if (typeof criterion.minYears === "number") {
      if (yearsObserved.status === "UNKNOWN") {
        hardGates.push({ criterionCode: criterion.code, label: criterion.label, outcome: "UNKNOWN", evidence: [], note: yearsObserved.reason });
      } else if (yearsObserved.value >= criterion.minYears) {
        hardGates.push({ criterionCode: criterion.code, label: criterion.label, outcome: "PASS", evidence: [yearsObserved.evidence], note: `${yearsObserved.value} ≥ ${criterion.minYears} years` });
      } else {
        hardGates.push({ criterionCode: criterion.code, label: criterion.label, outcome: "FAIL", evidence: [yearsObserved.evidence], note: `${yearsObserved.value} < ${criterion.minYears} years` });
      }
      continue;
    }
    if (criterion.kind === "DISQUALIFIER") {
      hardGates.push(
        evidence.length > 0
          ? { criterionCode: criterion.code, label: criterion.label, outcome: "FAIL", evidence: evidence.slice(0, 5), note: "explicit disqualifying statement found" }
          : { criterionCode: criterion.code, label: criterion.label, outcome: "UNKNOWN", evidence: [], note: "no disqualifying statement found; not asserted either way" },
      );
      continue;
    }
    hardGates.push(
      evidence.length > 0
        ? { criterionCode: criterion.code, label: criterion.label, outcome: "PASS", evidence: evidence.slice(0, 5), note: `${evidence.length} evidence item(s)` }
        : { criterionCode: criterion.code, label: criterion.label, outcome: "UNKNOWN", evidence: [], note: "no evidence found; absence is not failure" },
    );
  }

  const dimensionScores: DimensionScore[] = DIMENSIONS.map((dimension) => {
    const rows = x.criteria.filter((c) => c.criterion.dimension === dimension && c.criterion.kind !== "DISQUALIFIER");
    const total = rows.reduce((s, r) => s + r.criterion.weight, 0);
    if (rows.length === 0 || total === 0) {
      return { dimension, score: null, weightApplied: profile.weights[dimension] ?? 0, matched: 0, total: rows.length };
    }
    let matchedWeight = 0;
    let matched = 0;
    for (const r of rows) {
      const isMatched =
        typeof r.criterion.minYears === "number"
          ? yearsObserved.status === "OBSERVED" && yearsObserved.value >= r.criterion.minYears
          : r.evidence.length > 0;
      if (isMatched) {
        matchedWeight += r.criterion.weight;
        matched++;
      }
    }
    return {
      dimension,
      score: Math.round((matchedWeight / total) * 100),
      weightApplied: profile.weights[dimension] ?? 0,
      matched,
      total: rows.length,
    };
  });

  const scored = dimensionScores.filter((d) => d.score !== null && d.weightApplied > 0);
  const weightSum = scored.reduce((s, d) => s + d.weightApplied, 0);
  const overallScore =
    scored.length === 0 || weightSum === 0
      ? null
      : Math.round(scored.reduce((s, d) => s + (d.score as number) * d.weightApplied, 0) / weightSum);

  const scorable = x.criteria.filter((c) => c.criterion.kind !== "DISQUALIFIER");
  const covered = scorable.filter((c) =>
    typeof c.criterion.minYears === "number" ? yearsObserved.status === "OBSERVED" : c.evidence.length > 0,
  ).length;
  const coverage = scorable.length === 0 ? 0 : covered / scorable.length;
  // Only gates that COULD have been decided count against confidence: a
  // disqualifier that did not fire is not missing evidence.
  const unknownGates = hardGates.filter((g) => g.outcome === "UNKNOWN" && !g.note.startsWith("no disqualifying")).length;
  let confidence = 40 + 60 * coverage - 15 * unknownGates;
  if (!x.sources.resumeText) confidence -= 25;
  if (x.injection.suspected) confidence -= 20;
  confidence = Math.round(clamp(confidence, 0, 100));

  const anyFail = hardGates.some((g) => g.outcome === "FAIL");
  const anyUnknownDecidable = unknownGates > 0;
  let recommendation: ScoreResult["recommendation"];
  if (anyFail) recommendation = "REJECT_RECOMMENDED";
  else if (anyUnknownDecidable) recommendation = "REVIEW_REQUIRED";
  else if (overallScore === null || overallScore < HOLD_THRESHOLD) recommendation = "REVIEW_REQUIRED";
  else if (overallScore < ADVANCE_THRESHOLD) recommendation = "HOLD";
  else recommendation = "ADVANCE";

  return { hardGates, dimensionScores, overallScore, confidence, recommendation, yearsObserved, experienceContradiction };
}
