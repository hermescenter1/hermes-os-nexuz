/**
 * Maintenance Recommendation Engine — Phase 39.
 *
 * READ-ONLY OUTPUT ONLY: generateMaintenanceRecommendations() NEVER executes
 * maintenance, controls equipment, writes to PLCs, or acts autonomously.
 * It produces text recommendations backed by traceable evidence records.
 *
 * Rules:
 *   - Health decline → "inspection"
 *   - Rising alarms → "alarm_review"
 *   - Efficiency drop → "maintenance_review"
 *   - Telemetry quality issues → "comms_inspection"
 *
 * Each recommendation requires evidence, confidence, and linked record IDs.
 */

import { getPrisma }            from "@/lib/db/prisma";
import { getPeriodRange }       from "@/lib/time-series/periods";
import { getHealthTrend }       from "@/lib/time-series/health-history";
import { getAlarmFrequency }    from "@/lib/time-series/alarms";
import { calculateRiskScore }   from "./risk";
import { calculateDegradationRate } from "./degradation";
import {
  FAILURE_THRESHOLD_SCORE,
  FORMULA_VERSION,
  WEIGHT_SET_VERSION,
  type MaintenanceRecommendationResult,
  type PredictiveEvidence,
  type PredictiveConfidence,
} from "./types";

type RecModel = { create: (a: unknown) => Promise<Record<string, unknown>> };
type KPIModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
type TelModel = { count: (a: unknown) => Promise<number>; findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };

function makeId(type: string, assetId: string): string {
  return `${type}_${assetId}`;
}

export async function generateMaintenanceRecommendations(
  organizationId: string,
  assetId:        string,
): Promise<MaintenanceRecommendationResult[]> {
  const prisma = await getPrisma();
  if (!prisma) return [];

  const db      = prisma as unknown as Record<string, unknown>;
  const range30 = getPeriodRange("last30Days");
  const range7  = getPeriodRange("last7Days");

  const [healthPoints, degResult, riskResult, alarmFreq30, alarmFreq7] = await Promise.all([
    getHealthTrend(organizationId, assetId, range30),
    calculateDegradationRate(organizationId, assetId, 30),
    calculateRiskScore(organizationId, assetId),
    getAlarmFrequency(organizationId, assetId, range30),
    getAlarmFrequency(organizationId, assetId, range7),
  ]);

  const recommendations: MaintenanceRecommendationResult[] = [];

  // ── Rule 1: Health decline → Inspection ──────────────────────────────────
  const latestHealth = healthPoints.length > 0 ? healthPoints[healthPoints.length - 1].healthScore : null;
  const hasDegradation = !("state" in degResult) && (degResult.degradationClass === "degrading" || degResult.degradationClass === "rapidly_degrading");

  if (latestHealth !== null && (latestHealth <= 60 || hasDegradation)) {
    const confidence: PredictiveConfidence = healthPoints.length >= 10 ? "HIGH" : healthPoints.length >= 5 ? "MEDIUM" : "LOW";
    const evidence: PredictiveEvidence[] = [
      { type: "health", assetId, value: latestHealth, timeframe: "last 30 days", description: `Health score: ${latestHealth.toFixed(1)}/100` },
    ];
    if (!("state" in degResult)) {
      evidence.push({ type: "health", assetId, value: degResult.slopePerDay, description: `Degradation slope: ${degResult.slopePerDay.toFixed(4)}/day (${degResult.degradationClass})` });
    }

    const rec: MaintenanceRecommendationResult = {
      id:                  makeId("inspection", assetId),
      assetId,
      recommendationType:  "inspection",
      priority:            latestHealth <= FAILURE_THRESHOLD_SCORE ? "HIGH" : hasDegradation && !("state" in degResult) && degResult.degradationClass === "rapidly_degrading" ? "HIGH" : "MEDIUM",
      title:               "Schedule Asset Inspection",
      description:         `Health score is ${latestHealth.toFixed(1)}/100${hasDegradation && !("state" in degResult) ? ` and declining at ${Math.abs(degResult.slopePerDay).toFixed(2)}/day` : ""}. Physical inspection recommended to identify root cause.`,
      confidence,
      evidence,
      evidenceRecordIds:   [],
      formulaVersion:      FORMULA_VERSION,
      weightSetVersion:    WEIGHT_SET_VERSION,
    };
    recommendations.push(rec);
    await persistRec(db, organizationId, rec);
  }

  // ── Rule 2: Rising alarms → Alarm Review ─────────────────────────────────
  const alarmRate30 = alarmFreq30?.alarmRate ?? 0;
  const alarmRate7  = alarmFreq7?.alarmRate  ?? 0;
  const alarmsRising = alarmRate7 > alarmRate30 + 0.05 || alarmRate7 > 0.25;

  if (alarmsRising && alarmFreq7) {
    const evidence: PredictiveEvidence[] = [
      { type: "alarm", assetId, value: alarmRate7,  timeframe: "last 7 days",  description: `Alarm rate (7d): ${(alarmRate7 * 100).toFixed(1)}%` },
      { type: "alarm", assetId, value: alarmRate30, timeframe: "last 30 days", description: `Alarm rate (30d): ${(alarmRate30 * 100).toFixed(1)}%` },
    ];
    const rec: MaintenanceRecommendationResult = {
      id:                  makeId("alarm_review", assetId),
      assetId,
      recommendationType:  "alarm_review",
      priority:            alarmRate7 > 0.40 ? "HIGH" : "MEDIUM",
      title:               "Review Alarm Pattern",
      description:         `Alarm rate has risen to ${(alarmRate7 * 100).toFixed(1)}% in the last 7 days (baseline: ${(alarmRate30 * 100).toFixed(1)}% over 30 days). Review alarm configuration and root causes.`,
      confidence:          "MEDIUM",
      evidence,
      evidenceRecordIds:   [],
      formulaVersion:      FORMULA_VERSION,
      weightSetVersion:    WEIGHT_SET_VERSION,
    };
    recommendations.push(rec);
    await persistRec(db, organizationId, rec);
  }

  // ── Rule 3: Efficiency drop → Maintenance Review ──────────────────────────
  const kpiRows = await (db.kPIRecord as unknown as KPIModel).findMany({
    where:   { organizationId, assetId, kpiName: "efficiency", calculatedAt: { gte: range30.from } },
    orderBy: { calculatedAt: "asc" },
    select:  { value: true, calculatedAt: true },
  });

  if (kpiRows.length >= 5) {
    const first = kpiRows[0].value as number;
    const last  = kpiRows[kpiRows.length - 1].value as number;
    const drop  = first - last;

    if (drop >= 10) {
      const evidence: PredictiveEvidence[] = [
        { type: "kpi", assetId, value: first, timeframe: "30 days ago",  description: `Efficiency was ${first.toFixed(1)}` },
        { type: "kpi", assetId, value: last,  timeframe: "most recent",  description: `Efficiency is now ${last.toFixed(1)} (drop: ${drop.toFixed(1)})` },
      ];
      const rec: MaintenanceRecommendationResult = {
        id:                  makeId("maintenance_review", assetId),
        assetId,
        recommendationType:  "maintenance_review",
        priority:            drop >= 25 ? "HIGH" : "MEDIUM",
        title:               "Schedule Maintenance Review",
        description:         `Efficiency has dropped ${drop.toFixed(1)} points over 30 days (${first.toFixed(1)} → ${last.toFixed(1)}). Preventive maintenance is recommended.`,
        confidence:          kpiRows.length >= 10 ? "HIGH" : "MEDIUM",
        evidence,
        evidenceRecordIds:   [],
        formulaVersion:      FORMULA_VERSION,
        weightSetVersion:    WEIGHT_SET_VERSION,
      };
      recommendations.push(rec);
      await persistRec(db, organizationId, rec);
    }
  }

  // ── Rule 4: Telemetry quality issues → Comms Inspection ──────────────────
  const telBase = { organizationId, assetId, receivedAt: { gte: range7.from } };
  const [totalTel, badTel] = await Promise.all([
    (db.telemetryRecord as unknown as TelModel).count({ where: telBase }),
    (db.telemetryRecord as unknown as TelModel).count({ where: { ...telBase, quality: { in: ["BAD", "STALE"] } } }),
  ]);

  const badRate = totalTel > 0 ? badTel / totalTel : 0;
  if (badRate >= 0.20 && totalTel >= 10) {
    const evidence: PredictiveEvidence[] = [
      { type: "telemetry", assetId, value: badRate, timeframe: "last 7 days", description: `${(badRate * 100).toFixed(1)}% of ${totalTel} telemetry records are BAD or STALE` },
    ];
    const rec: MaintenanceRecommendationResult = {
      id:                  makeId("comms_inspection", assetId),
      assetId,
      recommendationType:  "comms_inspection",
      priority:            badRate >= 0.50 ? "HIGH" : "MEDIUM",
      title:               "Inspect Communication Link",
      description:         `${(badRate * 100).toFixed(1)}% of telemetry in the last 7 days has BAD or STALE quality (${badTel}/${totalTel} records). Check network, gateway, and sensor wiring.`,
      confidence:          totalTel >= 50 ? "HIGH" : "MEDIUM",
      evidence,
      evidenceRecordIds:   [],
      formulaVersion:      FORMULA_VERSION,
      weightSetVersion:    WEIGHT_SET_VERSION,
    };
    recommendations.push(rec);
    await persistRec(db, organizationId, rec);
  }

  return recommendations;
}

async function persistRec(
  db:             Record<string, unknown>,
  organizationId: string,
  rec:            MaintenanceRecommendationResult,
): Promise<void> {
  try {
    await (db.maintenanceRecommendation as unknown as RecModel).create({
      data: {
        organizationId,
        assetId:           rec.assetId,
        recommendationType: rec.recommendationType,
        priority:          rec.priority,
        title:             rec.title,
        description:       rec.description,
        confidence:        rec.confidence,
        evidence:          rec.evidence,
        evidenceRecordIds: rec.evidenceRecordIds,
        metadata: { formulaVersion: rec.formulaVersion, weightSetVersion: rec.weightSetVersion },
      },
    });
  } catch { /* fire-and-forget */ }
}
