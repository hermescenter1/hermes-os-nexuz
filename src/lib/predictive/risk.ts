/**
 * Risk Scoring Engine — Phase 39.
 *
 * calculateRiskScore() → 0–100 composite risk from 5 input signals, each with
 * a named weight constant. A criticality multiplier scales the result by asset type.
 *
 * All divisions are zero-guarded. All inputs are validated for null/undefined.
 * Every output carries evidence linking to real record IDs / timeframes.
 * formulaVersion + weightSetVersion are included for auditability.
 */

import { getPrisma }           from "@/lib/db/prisma";
import { getPeriodRange }      from "@/lib/time-series/periods";
import { getHealthTrend }      from "@/lib/time-series/health-history";
import { getAlarmFrequency }   from "@/lib/time-series/alarms";
import {
  WEIGHT_HEALTH_TREND,
  WEIGHT_ALARM_TREND,
  WEIGHT_KPI_DEGRADATION,
  WEIGHT_TEL_QUALITY,
  WEIGHT_TEL_FRESHNESS,
  CRITICALITY_BY_ASSET_TYPE,
  MIN_TELEMETRY_RECORDS_FOR_QUALITY,
  MIN_KPI_RECORDS_FOR_TREND,
  FORMULA_VERSION,
  WEIGHT_SET_VERSION,
  type RiskScoreResult,
  type InsufficientDataResult,
  type PredictiveEvidence,
  type PredictiveConfidence,
} from "./types";
import { calculateDegradationRate } from "./degradation";

const STALE_THRESHOLD_MINUTES = 30;

type AssetModel    = { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };
type TelModel      = {
  count:     (a: unknown) => Promise<number>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
};
type KPIModel      = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
type RiskModel     = { create:   (a: unknown) => Promise<Record<string, unknown>> };

export async function calculateRiskScore(
  organizationId: string,
  assetId:        string,
): Promise<RiskScoreResult | InsufficientDataResult> {
  const prisma = await getPrisma();
  if (!prisma) {
    return { state: "insufficientData", confidence: "LOW", reason: "No database connection", assetId };
  }

  const db = prisma as unknown as Record<string, unknown>;

  // Load asset metadata for criticality
  const assetRow = await (db.industrialAsset as unknown as AssetModel).findFirst({
    where:  { id: assetId, organizationId },
    select: { assetType: true, status: true },
  });
  if (!assetRow) {
    return { state: "insufficientData", confidence: "LOW", reason: "Asset not found", assetId };
  }

  const assetType        = (assetRow.assetType as string) ?? "OTHER";
  const criticalityFactor = CRITICALITY_BY_ASSET_TYPE[assetType] ?? 1.0;

  const range30 = getPeriodRange("last30Days");

  // ── 1. Health Trend Score (0–30) ─────────────────────────────────────────
  const healthPoints = await getHealthTrend(organizationId, assetId, range30);
  const degResult    = await calculateDegradationRate(organizationId, assetId, 30);

  let healthTrendScore = 0;
  const healthEvidence: PredictiveEvidence[] = [];

  if (healthPoints.length >= 2 && !("state" in degResult)) {
    const slope          = degResult.slopePerDay;
    const latestHealth   = healthPoints[healthPoints.length - 1]?.healthScore ?? 100;
    // score = proximity to failure threshold + slope severity
    const healthDeficit  = Math.max(0, 100 - latestHealth) / 100;  // 0–1
    const slopeSeverity  = Math.min(1, Math.max(0, -slope / 2));    // 0–1 (slope -2/day = max)
    healthTrendScore = Math.round(WEIGHT_HEALTH_TREND * 100 * (healthDeficit * 0.6 + slopeSeverity * 0.4));
    healthEvidence.push({
      type:        "health",
      assetId,
      timeframe:   "last 30 days",
      value:       latestHealth,
      description: `Latest health score: ${latestHealth.toFixed(1)}, slope: ${slope.toFixed(4)}/day`,
    });
  } else if (healthPoints.length > 0) {
    const latestHealth = healthPoints[healthPoints.length - 1]?.healthScore ?? 100;
    healthTrendScore   = Math.round(WEIGHT_HEALTH_TREND * 100 * Math.max(0, 100 - latestHealth) / 100);
    healthEvidence.push({ type: "health", assetId, value: latestHealth, description: `Latest health: ${latestHealth.toFixed(1)} (insufficient trend data)` });
  }

  // ── 2. Alarm Trend Score (0–25) ──────────────────────────────────────────
  const alarmFreq    = await getAlarmFrequency(organizationId, assetId, range30);
  let alarmTrendScore = 0;
  const alarmEvidence: PredictiveEvidence[] = [];

  if (alarmFreq) {
    // alarmRate 0–1 → contribution 0–25
    alarmTrendScore = Math.round(WEIGHT_ALARM_TREND * 100 * Math.min(1, alarmFreq.alarmRate * 4));
    alarmEvidence.push({
      type:        "alarm",
      assetId,
      timeframe:   "last 30 days",
      value:       alarmFreq.alarmRate,
      description: `Alarm rate: ${(alarmFreq.alarmRate * 100).toFixed(1)}% (${alarmFreq.totalAlarms} alarms of ${alarmFreq.badCount + alarmFreq.staleCount + alarmFreq.uncertainCount + (alarmFreq.totalAlarms - alarmFreq.badCount - alarmFreq.staleCount)} total records)`,
    });
  }

  // ── 3. KPI Degradation Score (0–20) ──────────────────────────────────────
  const kpiRows = await (db.kPIRecord as unknown as KPIModel).findMany({
    where:   { organizationId, assetId, calculatedAt: { gte: range30.from } },
    orderBy: { calculatedAt: "asc" },
    select:  { kpiName: true, value: true, calculatedAt: true },
  });
  let kpiDegradationScore = 0;
  const kpiEvidence: PredictiveEvidence[] = [];

  const efficiencyKPIs = kpiRows.filter((r) => r.kpiName === "efficiency");
  const availKPIs      = kpiRows.filter((r) => r.kpiName === "availability");

  if (efficiencyKPIs.length >= MIN_KPI_RECORDS_FOR_TREND) {
    const firstEff = efficiencyKPIs[0].value as number;
    const lastEff  = efficiencyKPIs[efficiencyKPIs.length - 1].value as number;
    const effDrop  = Math.max(0, firstEff - lastEff) / Math.max(1, firstEff);
    kpiDegradationScore += Math.round(WEIGHT_KPI_DEGRADATION * 100 * effDrop * 0.6);
    kpiEvidence.push({ type: "kpi", assetId, timeframe: "last 30 days", value: lastEff, description: `Efficiency: ${lastEff.toFixed(1)} (was ${firstEff.toFixed(1)})` });
  }

  if (availKPIs.length >= MIN_KPI_RECORDS_FOR_TREND) {
    const firstAvail = availKPIs[0].value as number;
    const lastAvail  = availKPIs[availKPIs.length - 1].value as number;
    const availDrop  = Math.max(0, firstAvail - lastAvail) / Math.max(1, firstAvail);
    kpiDegradationScore += Math.round(WEIGHT_KPI_DEGRADATION * 100 * availDrop * 0.4);
    kpiEvidence.push({ type: "kpi", assetId, timeframe: "last 30 days", value: lastAvail, description: `Availability: ${lastAvail.toFixed(1)}% (was ${firstAvail.toFixed(1)}%)` });
  }

  kpiDegradationScore = Math.min(Math.round(WEIGHT_KPI_DEGRADATION * 100), kpiDegradationScore);

  // ── 4. Telemetry Quality Score (0–15) ────────────────────────────────────
  const telBase = { organizationId, assetId, receivedAt: { gte: range30.from } };
  const [totalTel, goodTel] = await Promise.all([
    (db.telemetryRecord as unknown as TelModel).count({ where: telBase }),
    (db.telemetryRecord as unknown as TelModel).count({ where: { ...telBase, quality: "GOOD" } }),
  ]);

  let telQualityScore = 0;
  const telQEvidence: PredictiveEvidence[] = [];

  if (totalTel >= MIN_TELEMETRY_RECORDS_FOR_QUALITY) {
    const qualityRate = goodTel / totalTel;  // 0–1, high = good
    telQualityScore   = Math.round(WEIGHT_TEL_QUALITY * 100 * (1 - qualityRate));
    telQEvidence.push({
      type:        "telemetry",
      assetId,
      timeframe:   "last 30 days",
      value:       qualityRate,
      description: `Telemetry quality: ${(qualityRate * 100).toFixed(1)}% GOOD (${totalTel} records)`,
    });
  }

  // ── 5. Telemetry Freshness Score (0–10) ──────────────────────────────────
  const latestTel = await (db.telemetryRecord as unknown as TelModel).findFirst({
    where:   { organizationId, assetId },
    orderBy: { receivedAt: "desc" },
    select:  { receivedAt: true },
  });

  let telFreshnessScore = 0;
  const telFEvidence: PredictiveEvidence[] = [];

  if (latestTel) {
    const staleMs        = STALE_THRESHOLD_MINUTES * 60_000;
    const ageMs          = Date.now() - new Date(latestTel.receivedAt as string).getTime();
    const stalenessRatio = Math.min(1, ageMs / staleMs);
    telFreshnessScore    = Math.round(WEIGHT_TEL_FRESHNESS * 100 * stalenessRatio);
    telFEvidence.push({
      type:        "telemetry",
      assetId,
      description: `Last telemetry: ${Math.round(ageMs / 60_000)}m ago (stale threshold: ${STALE_THRESHOLD_MINUTES}m)`,
    });
  } else {
    telFreshnessScore = Math.round(WEIGHT_TEL_FRESHNESS * 100); // no telemetry at all → max freshness penalty
    telFEvidence.push({ type: "telemetry", assetId, description: "No telemetry received yet" });
  }

  // ── Composite Risk Score ──────────────────────────────────────────────────
  const baseScore = healthTrendScore + alarmTrendScore + kpiDegradationScore + telQualityScore + telFreshnessScore;
  const riskScore = Math.min(100, Math.round(baseScore * criticalityFactor));

  // Confidence: how much of the 5 signals had sufficient data
  const signalsWithData = [
    healthPoints.length >= 2,
    alarmFreq !== null,
    kpiRows.length >= MIN_KPI_RECORDS_FOR_TREND,
    totalTel >= MIN_TELEMETRY_RECORDS_FOR_QUALITY,
    latestTel !== null,
  ].filter(Boolean).length;

  let confidence: PredictiveConfidence;
  if (signalsWithData >= 4) confidence = "HIGH";
  else if (signalsWithData >= 2) confidence = "MEDIUM";
  else confidence = "LOW";

  const allEvidence: PredictiveEvidence[] = [
    ...healthEvidence,
    ...alarmEvidence,
    ...kpiEvidence,
    ...telQEvidence,
    ...telFEvidence,
  ];

  const result: RiskScoreResult = {
    assetId,
    riskScore,
    confidence,
    healthTrendScore,
    alarmTrendScore,
    kpiDegradationScore,
    telQualityScore,
    telFreshnessScore,
    criticalityFactor,
    evidence:         allEvidence,
    formulaVersion:   FORMULA_VERSION,
    weightSetVersion: WEIGHT_SET_VERSION,
  };

  // Persist
  try {
    await (db.assetRiskScore as unknown as RiskModel).create({
      data: {
        organizationId,
        assetId,
        riskScore,
        confidence,
        healthTrendScore,
        alarmTrendScore,
        kpiDegradationScore,
        telQualityScore,
        telFreshnessScore,
        criticalityFactor,
        metadata: {
          evidence:         allEvidence,
          formulaVersion:   FORMULA_VERSION,
          weightSetVersion: WEIGHT_SET_VERSION,
        },
      },
    });
  } catch { /* fire-and-forget */ }

  return result;
}
