/**
 * Remaining Useful Life (RUL) Engine — Phase 39.
 *
 * Deterministic projection only. No ML, no forecasting model.
 *
 * Formula: RUL_point = (currentScore - FAILURE_THRESHOLD_SCORE) / |degradationRate|
 * Range:   [RUL_point × (1 - UNCERTAINTY), RUL_point × (1 + UNCERTAINTY)]
 *
 * Bounds and honesty rules:
 *   - Non-negative slope (improving/stable) → state: "no_degradation"
 *   - RUL_point ≤ 0 → state: "at_threshold" (immediate inspection)
 *   - RUL_point > RUL_MAX_DAYS → capped at RUL_MAX_DAYS
 *   - Below data gate → state: "insufficientData"
 *   - Never returns a negative number
 */

import { getPrisma }               from "@/lib/db/prisma";
import { getHealthTrend }          from "@/lib/time-series/health-history";
import { getPeriodRange }          from "@/lib/time-series/periods";
import { calculateDegradationRate } from "./degradation";
import {
  FAILURE_THRESHOLD_SCORE,
  RUL_MAX_DAYS,
  RUL_UNCERTAINTY_FACTOR,
  MIN_HEALTH_POINTS_FOR_RUL,
  MIN_HISTORY_DAYS_FOR_RUL,
  FORMULA_VERSION,
  WEIGHT_SET_VERSION,
  type RULResult,
  type InsufficientDataResult,
  type PredictiveEvidence,
  type DegradationClass,
} from "./types";

type RULModel = { create: (a: unknown) => Promise<Record<string, unknown>> };

export async function calculateRUL(
  organizationId: string,
  assetId:        string,
  windowDays      = 90,
): Promise<RULResult | InsufficientDataResult> {
  const prisma = await getPrisma();
  if (!prisma) {
    return { state: "insufficientData", confidence: "LOW", reason: "No database connection", assetId };
  }

  const range = getPeriodRange("last30Days");
  const healthPoints = await getHealthTrend(organizationId, assetId, range);

  // Check RUL-specific data gate (stricter than degradation gate)
  if (healthPoints.length < MIN_HEALTH_POINTS_FOR_RUL) {
    return {
      state:      "insufficientData",
      confidence: "LOW",
      reason:     `RUL requires ≥${MIN_HEALTH_POINTS_FOR_RUL} health history points (have ${healthPoints.length})`,
      assetId,
    };
  }

  const oldest       = new Date(healthPoints[0].createdAt).getTime();
  const newest       = new Date(healthPoints[healthPoints.length - 1].createdAt).getTime();
  const coverageDays = (newest - oldest) / 86_400_000;

  if (coverageDays < MIN_HISTORY_DAYS_FOR_RUL) {
    return {
      state:      "insufficientData",
      confidence: "LOW",
      reason:     `RUL requires ≥${MIN_HISTORY_DAYS_FOR_RUL} days history span (have ${coverageDays.toFixed(1)})`,
      assetId,
    };
  }

  const degResult = await calculateDegradationRate(organizationId, assetId, windowDays);

  if ("state" in degResult) {
    return { state: "insufficientData", confidence: "LOW", reason: degResult.reason, assetId };
  }

  const currentScore     = healthPoints[healthPoints.length - 1].healthScore;
  const degradationRate  = degResult.slopePerDay;  // negative = degrading
  const degradationClass: DegradationClass = degResult.degradationClass;

  const evidence: PredictiveEvidence[] = [
    ...degResult.evidence,
    {
      type:        "health",
      assetId,
      value:       currentScore,
      description: `Current health score: ${currentScore.toFixed(1)} / 100 (failure threshold: ${FAILURE_THRESHOLD_SCORE})`,
    },
  ];

  const db = prisma as unknown as Record<string, unknown>;

  // Non-negative slope → no degradation detected
  if (degradationRate >= 0) {
    const result: RULResult = {
      assetId,
      state:            "no_degradation",
      degradationClass,
      confidence:       degResult.confidence,
      currentScore,
      degradationRate,
      evidence,
      formulaVersion:   FORMULA_VERSION,
      weightSetVersion: WEIGHT_SET_VERSION,
    };
    await persistRUL(db, organizationId, assetId, result, degradationClass);
    return result;
  }

  // Current score already at or below threshold
  if (currentScore <= FAILURE_THRESHOLD_SCORE) {
    const result: RULResult = {
      assetId,
      state:            "at_threshold",
      degradationClass,
      confidence:       degResult.confidence,
      currentScore,
      degradationRate,
      evidence: [
        ...evidence,
        { type: "health", assetId, value: currentScore, description: `Score ${currentScore.toFixed(1)} ≤ failure threshold ${FAILURE_THRESHOLD_SCORE} — immediate inspection recommended` },
      ],
      formulaVersion:   FORMULA_VERSION,
      weightSetVersion: WEIGHT_SET_VERSION,
    };
    await persistRUL(db, organizationId, assetId, result, degradationClass);
    return result;
  }

  // Normal RUL computation
  const headroom    = currentScore - FAILURE_THRESHOLD_SCORE;   // guaranteed > 0
  const absRate     = Math.abs(degradationRate);                 // guaranteed > 0
  const rulPoint    = headroom / absRate;

  const cappedRUL   = Math.min(rulPoint, RUL_MAX_DAYS);
  const minDays     = Math.max(0, cappedRUL * (1 - RUL_UNCERTAINTY_FACTOR));
  const maxDays     = cappedRUL * (1 + RUL_UNCERTAINTY_FACTOR);

  evidence.push({
    type:        "health",
    assetId,
    description: `RUL projection: ${headroom.toFixed(1)} score headroom ÷ ${absRate.toFixed(4)}/day = ${rulPoint.toFixed(1)} days (capped at ${RUL_MAX_DAYS}, ±${RUL_UNCERTAINTY_FACTOR * 100}% uncertainty)`,
  });

  const result: RULResult = {
    assetId,
    state:            "estimated",
    minDays,
    maxDays,
    currentScore,
    degradationRate,
    degradationClass,
    confidence:       degResult.confidence,
    evidence,
    formulaVersion:   FORMULA_VERSION,
    weightSetVersion: WEIGHT_SET_VERSION,
  };

  await persistRUL(db, organizationId, assetId, result, degradationClass);
  return result;
}

async function persistRUL(
  db:               Record<string, unknown>,
  organizationId:   string,
  assetId:          string,
  result:           RULResult,
  degradationClass: DegradationClass,
): Promise<void> {
  try {
    await (db.rULSnapshot as unknown as RULModel).create({
      data: {
        organizationId,
        assetId,
        state:           result.state,
        minDays:         result.minDays   ?? null,
        maxDays:         result.maxDays   ?? null,
        currentScore:    result.currentScore  ?? null,
        degradationRate: result.degradationRate ?? null,
        degradationClass: degradationClass.toUpperCase(),
        confidence:      result.confidence,
        metadata: {
          evidence:         result.evidence,
          formulaVersion:   result.formulaVersion,
          weightSetVersion: result.weightSetVersion,
        },
      },
    });
  } catch { /* fire-and-forget */ }
}
