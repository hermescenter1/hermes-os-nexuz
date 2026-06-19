/**
 * Asset Baseline Engine — Phase 39.
 *
 * buildBaseline() computes historical averages over a configurable window
 * (30 / 90 / 180 days) and persists the result as an AssetBaseline record.
 *
 * A baseline cannot be built unless the asset meets the data-sufficiency gate
 * (MIN_HEALTH_POINTS_FOR_DEGRADATION + MIN_HISTORY_DAYS_FOR_DEGRADATION).
 *
 * updateBaseline() is an alias that rebuilds and overwrites.
 * getBaseline() reads the most recent persisted baseline.
 */

import { getPrisma } from "@/lib/db/prisma";
import {
  MIN_HEALTH_POINTS_FOR_DEGRADATION,
  MIN_HISTORY_DAYS_FOR_DEGRADATION,
  FORMULA_VERSION,
  WEIGHT_SET_VERSION,
  type BaselineResult,
  type InsufficientDataResult,
} from "./types";

type HistoryModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
type KPIModel     = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
type AlarmModel   = { count:   (a: unknown) => Promise<number> };
type BaselineModel = {
  create:    (a: unknown) => Promise<Record<string, unknown>>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
};

const ALLOWED_WINDOWS = [30, 90, 180] as const;
type WindowDays = typeof ALLOWED_WINDOWS[number];

function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export async function buildBaseline(
  organizationId: string,
  assetId:        string,
  windowDays:     WindowDays = 90,
): Promise<BaselineResult | InsufficientDataResult> {
  const prisma = await getPrisma();
  if (!prisma) {
    return { state: "insufficientData", confidence: "LOW", reason: "No database connection", assetId };
  }

  const db    = prisma as unknown as Record<string, unknown>;
  const since = new Date(Date.now() - windowDays * 86_400_000);

  // ── Health history ────────────────────────────────────────────────────────
  const healthRows = await (db.assetHealthHistory as unknown as HistoryModel).findMany({
    where:   { organizationId, assetId, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    select:  { createdAt: true, healthScore: true },
  });

  if (healthRows.length < MIN_HEALTH_POINTS_FOR_DEGRADATION) {
    return {
      state:      "insufficientData",
      confidence: "LOW",
      reason:     `Need ≥${MIN_HEALTH_POINTS_FOR_DEGRADATION} health history points (have ${healthRows.length})`,
      assetId,
    };
  }

  const oldest      = new Date(healthRows[0].createdAt as string).getTime();
  const newest      = new Date(healthRows[healthRows.length - 1].createdAt as string).getTime();
  const coverageDays = (newest - oldest) / 86_400_000;

  if (coverageDays < MIN_HISTORY_DAYS_FOR_DEGRADATION) {
    return {
      state:      "insufficientData",
      confidence: "LOW",
      reason:     `Need ≥${MIN_HISTORY_DAYS_FOR_DEGRADATION} days history span (have ${coverageDays.toFixed(1)})`,
      assetId,
    };
  }

  const healthScores = healthRows.map((r) => r.healthScore as number);
  const avgHealth    = healthScores.reduce((s, v) => s + v, 0) / healthScores.length;
  const stdHealth    = stdDev(healthScores, avgHealth);

  // ── KPI baselines (availability, efficiency, runtime, downtime) ───────────
  const kpiRows = await (db.kPIRecord as unknown as KPIModel).findMany({
    where:   { organizationId, assetId, calculatedAt: { gte: since } },
    orderBy: { calculatedAt: "asc" },
    select:  { kpiName: true, value: true },
  });

  function avgKPI(name: string): number | null {
    const vals = kpiRows.filter((r) => r.kpiName === name).map((r) => r.value as number);
    return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  }

  // ── Alarm rate baseline ───────────────────────────────────────────────────
  const [totalTel, alarmTel] = await Promise.all([
    (db.telemetryRecord as unknown as AlarmModel).count({
      where: { organizationId, assetId, receivedAt: { gte: since } },
    }),
    (db.telemetryRecord as unknown as AlarmModel).count({
      where: { organizationId, assetId, receivedAt: { gte: since }, quality: { in: ["BAD", "STALE"] } },
    }),
  ]);
  const avgAlarmRate = totalTel > 0 ? alarmTel / totalTel : null;

  const result: BaselineResult = {
    assetId,
    windowDays,
    avgHealthScore:    avgHealth,
    stdDevHealthScore: stdHealth,
    avgEfficiency:     avgKPI("efficiency"),
    avgAvailability:   avgKPI("availability"),
    avgRuntime:        avgKPI("runtime"),
    avgDowntime:       avgKPI("downtime"),
    avgAlarmRate,
    sampleCount:       healthRows.length,
    coverageDays,
    meetsDataGate:     true,
  };

  // Persist
  await (db.assetBaseline as unknown as BaselineModel).create({
    data: {
      organizationId,
      assetId,
      windowDays,
      avgHealthScore:    result.avgHealthScore,
      stdDevHealthScore: result.stdDevHealthScore,
      avgEfficiency:     result.avgEfficiency,
      avgAvailability:   result.avgAvailability,
      avgRuntime:        result.avgRuntime,
      avgDowntime:       result.avgDowntime,
      avgAlarmRate:      result.avgAlarmRate,
      sampleCount:       result.sampleCount,
      coverageDays:      result.coverageDays,
      metadata:          { formulaVersion: FORMULA_VERSION, weightSetVersion: WEIGHT_SET_VERSION },
    },
  });

  return result;
}

export const updateBaseline = buildBaseline;

export async function getBaseline(
  organizationId: string,
  assetId:        string,
  windowDays:     WindowDays = 90,
): Promise<BaselineResult | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const db = prisma as unknown as Record<string, unknown>;

  const row = await (db.assetBaseline as unknown as BaselineModel).findFirst({
    where:   { organizationId, assetId, windowDays },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;

  return {
    assetId,
    windowDays:         row.windowDays        as number,
    avgHealthScore:     row.avgHealthScore     as number | null,
    stdDevHealthScore:  row.stdDevHealthScore  as number | null,
    avgEfficiency:      row.avgEfficiency      as number | null,
    avgAvailability:    row.avgAvailability    as number | null,
    avgRuntime:         row.avgRuntime         as number | null,
    avgDowntime:        row.avgDowntime        as number | null,
    avgAlarmRate:       row.avgAlarmRate       as number | null,
    sampleCount:        row.sampleCount        as number,
    coverageDays:       row.coverageDays       as number,
    meetsDataGate:      true,
  };
}
