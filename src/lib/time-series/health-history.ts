/**
 * Asset health history engine — Phase 37.
 *
 * Imports STALE_THRESHOLD_MINUTES from Phase 36 — does NOT redefine it.
 * Computes a health score for a snapshot in time and persists AssetHealthHistory.
 * Provides getTrend for health score over time (reads persisted history).
 */

import { getPrisma }            from "@/lib/db/prisma";
import { STALE_THRESHOLD_MINUTES } from "@/lib/digital-twin/health";
import { recordAuditEvent, ANALYTICS_AUDIT } from "@/lib/audit/audit-service";
import type { PeriodRange }     from "./periods";

export interface HealthHistoryPoint {
  createdAt:    string;
  healthScore:  number;
  healthStatus: string;
}

type HistoryModel = {
  create:   (a: unknown) => Promise<Record<string, unknown>>;
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
};
type TelemetryModel = {
  findFirst:  (a: unknown) => Promise<Record<string, unknown> | null>;
  findMany:   (a: unknown) => Promise<Record<string, unknown>[]>;
  count:      (a: unknown) => Promise<number>;
};

function scoreToStatus(score: number): string {
  if (score >= 75) return "healthy";
  if (score >= 45) return "degraded";
  if (score >  0)  return "critical";
  return "unknown";
}

export async function snapshotAssetHealth(
  organizationId: string,
  assetId:        string,
  assetStatus     = "ACTIVE",
): Promise<HealthHistoryPoint | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const db       = prisma as unknown as Record<string, unknown>;
  const telModel = db.telemetryRecord as unknown as TelemetryModel;

  const staleMs  = STALE_THRESHOLD_MINUTES * 60_000;
  const nowMs    = Date.now();

  // freshness score (40 pts)
  const latest = await telModel.findFirst({
    where:   { organizationId, assetId },
    orderBy: { receivedAt: "desc" },
  });
  const lastAt         = latest ? new Date(latest.receivedAt as string) : null;
  const stale          = !lastAt || (nowMs - lastAt.getTime()) > staleMs;
  const freshnessScore = lastAt
    ? Math.round(40 * (1 - Math.min((nowMs - lastAt.getTime()) / staleMs, 1)))
    : 0;

  // quality score (35 pts)
  const sample = await telModel.findMany({
    where:   { organizationId, assetId },
    orderBy: { receivedAt: "desc" },
    take:    20,
    select:  { quality: true },
  });
  const qualityScore = sample.length > 0
    ? Math.round(35 * (sample.filter((r) => r.quality === "GOOD").length / sample.length))
    : 0;

  // status score (25 pts)
  const statusMap: Record<string, number> = { ACTIVE: 1.0, MAINTENANCE: 0.5, INACTIVE: 0.2 };
  const statusScore = Math.round(25 * (statusMap[assetStatus.toUpperCase()] ?? 0.6));

  const healthScore  = Math.min(100, freshnessScore + qualityScore + statusScore);
  const healthStatus = scoreToStatus(healthScore);

  await (db.assetHealthHistory as unknown as HistoryModel).create({
    data: { organizationId, assetId, healthScore, healthStatus },
  });

  const point: HealthHistoryPoint = {
    createdAt:    new Date().toISOString(),
    healthScore,
    healthStatus,
  };

  // Audit summary only — stale flag, score, status (no raw telemetry rows)
  recordAuditEvent({
    action:     ANALYTICS_AUDIT.HEALTH_ANALYTICS_RUN,
    entityType: "IndustrialAsset",
    entityId:   assetId,
    metadata:   { organizationId, assetId, healthScore, healthStatus, stale },
  }).catch(() => undefined);

  return point;
}

export async function getHealthTrend(
  organizationId: string,
  assetId:        string,
  range:          PeriodRange,
): Promise<HealthHistoryPoint[]> {
  const prisma = await getPrisma();
  if (!prisma) return [];
  const db = prisma as unknown as Record<string, unknown>;

  const rows = await (db.assetHealthHistory as unknown as HistoryModel).findMany({
    where:   { organizationId, assetId, createdAt: { gte: range.from, lte: range.to } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    createdAt:    new Date(r.createdAt as string).toISOString(),
    healthScore:  r.healthScore  as number,
    healthStatus: r.healthStatus as string,
  }));
}
