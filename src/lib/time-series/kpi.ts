/**
 * KPI Engine — Phase 37.
 *
 * Computes and persists KPI values.
 * All aggregation is done in the database — no raw row loading for counting.
 *
 * KPIs:
 *   - availability   = fraction of time window with GOOD quality telemetry
 *   - runtime        = total records with quality=GOOD  (proxy for active time)
 *   - downtime       = total records with quality=BAD|STALE (proxy for down time)
 *   - efficiency     = avg(numericValue) where numericValue IS NOT NULL, normalized 0–100
 *
 * MTBF / MTTR: extension points exist but formulas not yet implemented.
 * Phase 39 will implement them once maintenance event data is available.
 */

import { getPrisma }    from "@/lib/db/prisma";
import { recordAuditEvent, ANALYTICS_AUDIT } from "@/lib/audit/audit-service";
import type { PeriodRange } from "./periods";

export interface KPIResult {
  assetId:      string;
  kpiName:      string;
  value:        number;   // 0–100 (percentage) or raw count
  period:       string;
  calculatedAt: string;
}

type CountModel = { count: (a: unknown) => Promise<number> };
type AggModel   = { aggregate: (a: unknown) => Promise<Record<string, unknown>> };
type KPIModel   = { create: (a: unknown) => Promise<Record<string, unknown>> };

async function countWhere(
  prisma: Record<string, unknown>,
  where:  Record<string, unknown>,
): Promise<number> {
  return (prisma.telemetryRecord as unknown as CountModel).count({ where });
}

export async function calculateAvailability(
  organizationId: string,
  assetId:        string,
  range:          PeriodRange,
  periodLabel:    string,
): Promise<KPIResult | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const db = prisma as unknown as Record<string, unknown>;

  const base  = { organizationId, assetId, receivedAt: { gte: range.from, lte: range.to } };
  const [total, good] = await Promise.all([
    countWhere(db, base),
    countWhere(db, { ...base, quality: "GOOD" }),
  ]);

  const value = total > 0 ? Math.round((good / total) * 100 * 100) / 100 : 0;
  await persistKPI(db, organizationId, assetId, "availability", value, periodLabel);
  return { assetId, kpiName: "availability", value, period: periodLabel, calculatedAt: new Date().toISOString() };
}

export async function calculateRuntime(
  organizationId: string,
  assetId:        string,
  range:          PeriodRange,
  periodLabel:    string,
): Promise<KPIResult | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const db = prisma as unknown as Record<string, unknown>;

  const value = await countWhere(db, {
    organizationId, assetId, quality: "GOOD",
    receivedAt: { gte: range.from, lte: range.to },
  });

  await persistKPI(db, organizationId, assetId, "runtime", value, periodLabel);
  return { assetId, kpiName: "runtime", value, period: periodLabel, calculatedAt: new Date().toISOString() };
}

export async function calculateDowntime(
  organizationId: string,
  assetId:        string,
  range:          PeriodRange,
  periodLabel:    string,
): Promise<KPIResult | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const db = prisma as unknown as Record<string, unknown>;

  const value = await countWhere(db, {
    organizationId, assetId, quality: { in: ["BAD", "STALE"] },
    receivedAt: { gte: range.from, lte: range.to },
  });

  await persistKPI(db, organizationId, assetId, "downtime", value, periodLabel);
  return { assetId, kpiName: "downtime", value, period: periodLabel, calculatedAt: new Date().toISOString() };
}

export async function calculateEfficiency(
  organizationId: string,
  assetId:        string,
  range:          PeriodRange,
  periodLabel:    string,
  maxExpected     = 100,
): Promise<KPIResult | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const db = prisma as unknown as Record<string, unknown>;

  const agg = await (db.telemetryRecord as unknown as AggModel).aggregate({
    where: {
      organizationId, assetId,
      numericValue: { not: null },
      receivedAt:   { gte: range.from, lte: range.to },
    },
    _avg: { numericValue: true },
  });
  const avg = (agg as { _avg: { numericValue: number | null } })._avg.numericValue;
  const value = avg != null ? Math.min(100, Math.round((avg / maxExpected) * 100 * 100) / 100) : 0;

  await persistKPI(db, organizationId, assetId, "efficiency", value, periodLabel);
  return { assetId, kpiName: "efficiency", value, period: periodLabel, calculatedAt: new Date().toISOString() };
}

// MTBF extension point — formula not yet implemented (Phase 39+)
// export async function calculateMTBF(...) { throw new Error("Not implemented in Phase 37") }

// MTTR extension point — formula not yet implemented (Phase 39+)
// export async function calculateMTTR(...) { throw new Error("Not implemented in Phase 37") }

async function persistKPI(
  db:    Record<string, unknown>,
  orgId: string, assetId: string, kpiName: string, value: number, period: string,
): Promise<void> {
  try {
    await (db.kPIRecord as unknown as KPIModel).create({
      data: { organizationId: orgId, assetId, kpiName, value, period },
    });
  } catch { /* fire-and-forget */ }
  // Audit summary only — no raw telemetry series
  recordAuditEvent({
    action:     ANALYTICS_AUDIT.KPI_CALCULATED,
    entityType: "IndustrialAsset",
    entityId:   assetId,
    metadata:   { organizationId: orgId, kpiName, period },
  }).catch(() => undefined);
}
