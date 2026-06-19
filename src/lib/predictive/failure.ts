/**
 * Failure Probability Engine — Phase 39.
 *
 * calculateFailureProbability() classifies failure risk as LOW / MEDIUM / HIGH.
 * Never a raw probability float — deterministic classification is more defensible.
 *
 * Inputs: risk score, degradation class, alarm trend, health trend.
 * All outputs include evidence and respect the data-sufficiency gate.
 */

import { getPeriodRange }      from "@/lib/time-series/periods";
import { getHealthTrend }      from "@/lib/time-series/health-history";
import { getAlarmFrequency }   from "@/lib/time-series/alarms";
import { calculateRiskScore }  from "./risk";
import { calculateDegradationRate } from "./degradation";
import {
  FORMULA_VERSION,
  WEIGHT_SET_VERSION,
  type FailureProbabilityResult,
  type InsufficientDataResult,
  type PredictiveEvidence,
  type DegradationClass,
} from "./types";
import { getPrisma } from "@/lib/db/prisma";

type FailureModel = { create: (a: unknown) => Promise<Record<string, unknown>> };

function alarmTrendDirection(
  alarmRate:   number,
  prevAlarmRate: number | null,
): "rising" | "stable" | "falling" | "unknown" {
  if (prevAlarmRate === null) return "unknown";
  const delta = alarmRate - prevAlarmRate;
  if (delta > 0.05)  return "rising";
  if (delta < -0.05) return "falling";
  return "stable";
}

function healthTrendDirection(
  healthPoints: { healthScore: number }[],
): "improving" | "stable" | "declining" | "unknown" {
  if (healthPoints.length < 3) return "unknown";
  const half    = Math.floor(healthPoints.length / 2);
  const earlyAvg = healthPoints.slice(0, half).reduce((s, p) => s + p.healthScore, 0) / half;
  const lateAvg  = healthPoints.slice(half).reduce((s, p) => s + p.healthScore, 0) / (healthPoints.length - half);
  const delta    = lateAvg - earlyAvg;
  if (delta > 5)   return "improving";
  if (delta < -5)  return "declining";
  return "stable";
}

type FailureProbabilityLevel = "LOW" | "MEDIUM" | "HIGH";

function classify(
  riskScore:        number,
  degradationClass: DegradationClass,
  alarmTrend:       "rising" | "stable" | "falling" | "unknown",
  healthTrend:      "improving" | "stable" | "declining" | "unknown",
): FailureProbabilityLevel {
  let score = 0;

  // Risk score contribution
  if (riskScore >= 70) score += 3;
  else if (riskScore >= 40) score += 2;
  else if (riskScore >= 20) score += 1;

  // Degradation contribution
  if (degradationClass === "rapidly_degrading") score += 3;
  else if (degradationClass === "degrading")    score += 2;
  else if (degradationClass === "stable")       score += 0;
  else if (degradationClass === "improving")    score -= 1;

  // Alarm trend contribution
  if (alarmTrend === "rising")  score += 2;
  else if (alarmTrend === "falling") score -= 1;

  // Health trend contribution
  if (healthTrend === "declining")  score += 2;
  else if (healthTrend === "improving") score -= 1;

  if (score >= 7) return "HIGH";
  if (score >= 4) return "MEDIUM";
  return "LOW";
}

export async function calculateFailureProbability(
  organizationId: string,
  assetId:        string,
): Promise<FailureProbabilityResult | InsufficientDataResult> {
  const prisma = await getPrisma();
  if (!prisma) {
    return { state: "insufficientData", confidence: "LOW", reason: "No database connection", assetId };
  }

  const range30 = getPeriodRange("last30Days");
  const range7  = getPeriodRange("last7Days");

  const [riskResult, degResult, healthPoints30, alarmFreq30, alarmFreq7] = await Promise.all([
    calculateRiskScore(organizationId, assetId),
    calculateDegradationRate(organizationId, assetId, 30),
    getHealthTrend(organizationId, assetId, range30),
    getAlarmFrequency(organizationId, assetId, range30),
    getAlarmFrequency(organizationId, assetId, range7),
  ]);

  if ("state" in riskResult) return riskResult;
  if ("state" in degResult)  {
    // Can still produce a failure estimate from risk alone if risk data is available
    if (riskResult.riskScore === 0 && riskResult.confidence === "LOW") {
      return { state: "insufficientData", confidence: "LOW", reason: degResult.reason, assetId };
    }
  }

  const degradationClass: DegradationClass = "state" in degResult
    ? "insufficientData"
    : degResult.degradationClass;

  const alarmRate30  = alarmFreq30?.alarmRate ?? null;
  const alarmRate7   = alarmFreq7?.alarmRate  ?? null;
  const alarmTrend   = alarmTrendDirection(alarmRate7 ?? alarmRate30 ?? 0, alarmRate30);
  const healthTrend  = healthTrendDirection(healthPoints30);

  if (degradationClass === "insufficientData" && riskResult.confidence === "LOW") {
    return {
      state:      "insufficientData",
      confidence: "LOW",
      reason:     "Insufficient data for both degradation and risk scoring",
      assetId,
    };
  }

  const probability = classify(
    riskResult.riskScore,
    degradationClass,
    alarmTrend,
    healthTrend,
  );

  const evidence: PredictiveEvidence[] = [
    ...riskResult.evidence,
    {
      type:        "asset",
      assetId,
      value:       riskResult.riskScore,
      description: `Risk score: ${riskResult.riskScore}/100 (confidence: ${riskResult.confidence})`,
    },
    {
      type:        "health",
      assetId,
      description: `Degradation class: ${degradationClass}, health trend: ${healthTrend}`,
    },
    {
      type:        "alarm",
      assetId,
      description: `Alarm trend: ${alarmTrend} (30d rate: ${alarmRate30 !== null ? (alarmRate30 * 100).toFixed(1) + "%" : "n/a"}, 7d rate: ${alarmRate7 !== null ? (alarmRate7 * 100).toFixed(1) + "%" : "n/a"})`,
    },
  ];

  const result: FailureProbabilityResult = {
    assetId,
    probability:     probability as "LOW" | "MEDIUM" | "HIGH",
    confidence:      riskResult.confidence,
    riskScore:       riskResult.riskScore,
    degradationClass,
    alarmTrend,
    healthTrend,
    evidence,
    formulaVersion:  FORMULA_VERSION,
    weightSetVersion: WEIGHT_SET_VERSION,
  };

  // Persist
  try {
    const db = prisma as unknown as Record<string, unknown>;
    await (db.failureIndicator as unknown as FailureModel).create({
      data: {
        organizationId,
        assetId,
        probability:      probability.toUpperCase() === "INSUFFICIENT_DATA" ? "INSUFFICIENT_DATA" : probability,
        confidence:       riskResult.confidence,
        riskScore:        riskResult.riskScore,
        degradationClass: degradationClass.toUpperCase().replace("INSUFFICIENT_DATA", "INSUFFICIENT_DATA"),
        alarmTrend,
        healthTrend,
        evidence,
        metadata: { formulaVersion: FORMULA_VERSION, weightSetVersion: WEIGHT_SET_VERSION },
      },
    });
  } catch { /* fire-and-forget */ }

  return result;
}
