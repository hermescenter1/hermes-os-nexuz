/**
 * Degradation Engine — Phase 39.
 *
 * calculateTrendSlope() uses the Theil-Sen estimator: the median of all pairwise
 * slopes between sample points. This is robust to outliers in noisy industrial
 * telemetry without assuming a normally distributed error term.
 *
 * Pre-processing: IQR-based outlier filter removes extreme values before slope
 * computation (values outside [Q1 - 1.5*IQR, Q3 + 1.5*IQR] are dropped).
 *
 * Guards:
 *   - zero-variance after filtering → { class: "stable", slope: 0 }
 *   - single point or empty → insufficientData
 *   - all points at same timestamp → insufficientData
 */

import { getPrisma } from "@/lib/db/prisma";
import {
  MIN_HEALTH_POINTS_FOR_DEGRADATION,
  MIN_HISTORY_DAYS_FOR_DEGRADATION,
  SLOPE_IMPROVING_THRESHOLD,
  SLOPE_STABLE_THRESHOLD,
  SLOPE_RAPIDLY_DEGRADING_THRESHOLD,
  FORMULA_VERSION,
  WEIGHT_SET_VERSION,
  type DegradationResult,
  type PredictiveEvidence,
  type DegradationClass,
} from "./types";

type HistoryModel = {
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
};

function classifySlope(slope: number): DegradationClass {
  if (slope > SLOPE_IMPROVING_THRESHOLD)           return "improving";
  if (Math.abs(slope) <= SLOPE_STABLE_THRESHOLD)   return "stable";
  if (slope < SLOPE_RAPIDLY_DEGRADING_THRESHOLD)   return "rapidly_degrading";
  return "degrading";
}

/** IQR-based outlier filter. Returns filtered array of [timeMs, score] pairs. */
function filterOutliers(points: [number, number][]): [number, number][] {
  if (points.length < 4) return points;
  const scores = points.map(([, s]) => s).sort((a, b) => a - b);
  const q1 = scores[Math.floor(scores.length * 0.25)];
  const q3 = scores[Math.floor(scores.length * 0.75)];
  const iqr = q3 - q1;
  if (iqr === 0) return points; // zero IQR — nothing to filter
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return points.filter(([, s]) => s >= lo && s <= hi);
}

/**
 * Theil-Sen slope estimator.
 * Returns slope in units of (score/day).
 * Returns null if fewer than 2 distinct time points remain after filtering.
 */
function theilSenSlope(points: [number, number][]): number | null {
  if (points.length < 2) return null;

  const MS_PER_DAY = 86_400_000;
  const slopes: number[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dt = (points[j][0] - points[i][0]) / MS_PER_DAY;
      if (dt === 0) continue; // same timestamp — skip
      slopes.push((points[j][1] - points[i][1]) / dt);
    }
  }

  if (slopes.length === 0) return null;
  slopes.sort((a, b) => a - b);
  const mid = Math.floor(slopes.length / 2);
  return slopes.length % 2 === 0
    ? (slopes[mid - 1] + slopes[mid]) / 2
    : slopes[mid];
}

export async function calculateDegradationRate(
  organizationId: string,
  assetId:        string,
  windowDays      = 90,
): Promise<DegradationResult | { state: "insufficientData"; reason: string; assetId: string }> {
  const prisma = await getPrisma();
  if (!prisma) {
    return { state: "insufficientData", reason: "No database connection", assetId };
  }

  const db    = prisma as unknown as Record<string, unknown>;
  const since = new Date(Date.now() - windowDays * 86_400_000);

  const rows = await (db.assetHealthHistory as unknown as HistoryModel).findMany({
    where:   { organizationId, assetId, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    select:  { createdAt: true, healthScore: true, id: true },
  });

  if (rows.length < MIN_HEALTH_POINTS_FOR_DEGRADATION) {
    return {
      state:  "insufficientData",
      reason: `Need ≥${MIN_HEALTH_POINTS_FOR_DEGRADATION} health history points (have ${rows.length})`,
      assetId,
    };
  }

  const oldest   = new Date(rows[0].createdAt as string).getTime();
  const newest   = new Date(rows[rows.length - 1].createdAt as string).getTime();
  const coverageMs = newest - oldest;
  const coverageDays = coverageMs / 86_400_000;

  if (coverageDays < MIN_HISTORY_DAYS_FOR_DEGRADATION) {
    return {
      state:  "insufficientData",
      reason: `Need ≥${MIN_HISTORY_DAYS_FOR_DEGRADATION} days history span (have ${coverageDays.toFixed(1)})`,
      assetId,
    };
  }

  const rawPoints: [number, number][] = rows.map((r) => [
    new Date(r.createdAt as string).getTime(),
    r.healthScore as number,
  ]);

  const filtered = filterOutliers(rawPoints);
  const slope    = theilSenSlope(filtered);

  if (slope === null) {
    return {
      state:  "insufficientData",
      reason: "All data points share the same timestamp; cannot compute slope",
      assetId,
    };
  }

  const scores = filtered.map(([, s]) => s);
  const zeroVariance = Math.max(...scores) - Math.min(...scores) < 0.001;
  const effectiveSlope = zeroVariance ? 0 : slope;

  const degradationClass = classifySlope(effectiveSlope);

  // Confidence from sample size + coverage
  let confidence: "LOW" | "MEDIUM" | "HIGH";
  if (filtered.length >= 30 && coverageDays >= 60) confidence = "HIGH";
  else if (filtered.length >= 10 && coverageDays >= 14) confidence = "MEDIUM";
  else confidence = "LOW";

  const evidence: PredictiveEvidence[] = [
    {
      type:        "health",
      assetId,
      timeframe:   `last ${windowDays} days`,
      value:       effectiveSlope,
      description: `Theil-Sen slope over ${filtered.length} health history points (${coverageDays.toFixed(1)} day span): ${effectiveSlope.toFixed(4)} score/day`,
    },
  ];

  if (rows.length > filtered.length) {
    evidence.push({
      type:        "health",
      assetId,
      description: `${rows.length - filtered.length} outlier(s) removed via IQR filter before slope computation`,
    });
  }

  return {
    assetId,
    slopePerDay:      effectiveSlope,
    degradationClass,
    confidence,
    sampleCount:      filtered.length,
    coverageDays,
    method:           "theil_sen",
    evidence,
  };
}

/**
 * Public alias used by other engines to read the slope in isolation.
 * Returns slope in score/day (negative = degrading) or null if insufficient data.
 */
export async function calculateTrendSlope(
  organizationId: string,
  assetId:        string,
  windowDays      = 90,
): Promise<number | null> {
  const result = await calculateDegradationRate(organizationId, assetId, windowDays);
  if ("state" in result) return null;
  return result.slopePerDay;
}

// Re-export version for persisted metadata
export { FORMULA_VERSION, WEIGHT_SET_VERSION };
