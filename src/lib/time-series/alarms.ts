/**
 * Alarm analytics engine — Phase 37.
 *
 * Uses telemetry quality as the alarm signal:
 *   BAD     → fault / alarm condition
 *   STALE   → communication loss / watchdog alarm
 *   UNCERTAIN → degraded signal (informational)
 *
 * All counts are done in the DB via Prisma aggregate/count — no row loading.
 */

import { getPrisma }    from "@/lib/db/prisma";
import type { PeriodRange } from "./periods";

export interface AlarmFrequency {
  assetId:        string;
  totalAlarms:    number;   // BAD + STALE records
  badCount:       number;
  staleCount:     number;
  uncertainCount: number;
  alarmRate:      number;   // alarms / total records (0–1)
}

export interface TopAlarmAsset {
  assetId:     string;
  alarmCount:  number;
  alarmRate:   number;
}

export interface AlarmDuration {
  assetId:          string;
  alarmTag:         string;
  consecutiveCount: number;   // max consecutive BAD/STALE records for this tag
  firstAlarmAt:     string | null;
  lastAlarmAt:      string | null;
}

type CountModel  = { count: (a: unknown) => Promise<number> };
type FindModel   = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

export async function getAlarmFrequency(
  organizationId: string,
  assetId:        string,
  range:          PeriodRange,
): Promise<AlarmFrequency | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const db = prisma as unknown as Record<string, unknown>;
  const model = db.telemetryRecord as unknown as CountModel;

  const base = { organizationId, assetId, receivedAt: { gte: range.from, lte: range.to } };
  const [total, badCount, staleCount, uncertainCount] = await Promise.all([
    model.count({ where: base }),
    model.count({ where: { ...base, quality: "BAD"       } }),
    model.count({ where: { ...base, quality: "STALE"     } }),
    model.count({ where: { ...base, quality: "UNCERTAIN" } }),
  ]);

  const totalAlarms = badCount + staleCount;
  return {
    assetId,
    totalAlarms,
    badCount,
    staleCount,
    uncertainCount,
    alarmRate: total > 0 ? totalAlarms / total : 0,
  };
}

export async function getTopAlarmAssets(
  organizationId: string,
  siteId:         string,
  range:          PeriodRange,
  limit           = 10,
): Promise<TopAlarmAsset[]> {
  const prisma = await getPrisma();
  if (!prisma) return [];
  const db = prisma as unknown as Record<string, unknown>;

  // Load distinct assetIds for this site in the period
  const rows = await (db.telemetryRecord as unknown as FindModel).findMany({
    where: {
      organizationId, siteId,
      receivedAt: { gte: range.from, lte: range.to },
      assetId:    { not: null },
    },
    select:  { assetId: true },
    distinct: ["assetId"] as unknown as string[],
  });

  const assetIds = rows.map((r) => r.assetId as string).filter(Boolean);
  if (assetIds.length === 0) return [];

  const model = db.telemetryRecord as unknown as CountModel;
  const base  = { organizationId, receivedAt: { gte: range.from, lte: range.to } };

  const results = await Promise.all(
    assetIds.map(async (assetId) => {
      const [total, alarms] = await Promise.all([
        model.count({ where: { ...base, assetId } }),
        model.count({ where: { ...base, assetId, quality: { in: ["BAD", "STALE"] } } }),
      ]);
      return { assetId, alarmCount: alarms, alarmRate: total > 0 ? alarms / total : 0 };
    }),
  );

  return results
    .sort((a, b) => b.alarmCount - a.alarmCount)
    .slice(0, limit);
}

export async function getAlarmDuration(
  organizationId: string,
  assetId:        string,
  alarmTag:       string,
  range:          PeriodRange,
): Promise<AlarmDuration> {
  const prisma = await getPrisma();
  const empty: AlarmDuration = { assetId, alarmTag, consecutiveCount: 0, firstAlarmAt: null, lastAlarmAt: null };
  if (!prisma) return empty;

  const rows = await (prisma.telemetryRecord as unknown as FindModel).findMany({
    where: {
      organizationId,
      assetId,
      tag:        alarmTag,
      quality:    { in: ["BAD", "STALE"] },
      receivedAt: { gte: range.from, lte: range.to },
    },
    select:  { receivedAt: true },
    orderBy: { receivedAt: "asc" },
    take:    5000, // bounded scan
  });

  if (rows.length === 0) return empty;
  return {
    assetId,
    alarmTag,
    consecutiveCount: rows.length,
    firstAlarmAt:     new Date(rows[0].receivedAt as string).toISOString(),
    lastAlarmAt:      new Date(rows[rows.length - 1].receivedAt as string).toISOString(),
  };
}
