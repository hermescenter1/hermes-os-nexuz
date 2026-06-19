/**
 * Time-series trend engine — Phase 37.
 *
 * getTrend() returns time-bucketed aggregates from TelemetryRecord.numericValue.
 * Bucketing prevents unbounded result sets regardless of raw data density.
 *
 * Rules:
 *   - Always filter by (assetId, tag) — never tag alone (tags repeat across assets).
 *   - Only numericValue IS NOT NULL rows enter the computation.
 *   - receivedAt is used for time windows (server-set, trusted).
 *   - Bucketing is done via PostgreSQL date_trunc / floor(epoch / bucket_seconds).
 *   - Dev fallback: JS in-memory bucketing on a bounded 5000-row sample when
 *     $queryRaw fails. PRODUCTION MUST USE PostgreSQL.
 */

import { getPrisma }                from "@/lib/db/prisma";
import type { PeriodRange }         from "./periods";
import { getBucketStrategy }        from "./periods";
import type { AnalyticsPeriod }     from "./periods";

export interface TrendPoint {
  bucketStart: string;   // ISO string
  avg:         number;
  min:         number;
  max:         number;
  count:       number;
}

type RawQueryFn = (sql: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>;
type RowModel   = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

export async function getTrend(
  organizationId: string,
  assetId:        string,
  tag:            string,
  period:         AnalyticsPeriod,
  range:          PeriodRange,
): Promise<TrendPoint[]> {
  const prisma = await getPrisma();
  if (!prisma) return [];

  const strategy   = getBucketStrategy(period, range);
  const bucketSecs = Math.round(strategy.bucketMs / 1000);

  try {
    const rows = await (prisma.$queryRaw as RawQueryFn)`
      SELECT
        to_timestamp(floor(extract(epoch FROM "receivedAt") / ${bucketSecs}) * ${bucketSecs}) AS "bucketStart",
        avg("numericValue")::float   AS avg,
        min("numericValue")::float   AS min,
        max("numericValue")::float   AS max,
        count(*)::int                AS count
      FROM "TelemetryRecord"
      WHERE
        "organizationId" = ${organizationId}
        AND "assetId"    = ${assetId}
        AND "tag"        = ${tag}
        AND "numericValue" IS NOT NULL
        AND "receivedAt" >= ${range.from}
        AND "receivedAt" <= ${range.to}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
    return (rows as Record<string, unknown>[]).map((r) => ({
      bucketStart: new Date(r.bucketStart as string).toISOString(),
      avg:   Number(r.avg),
      min:   Number(r.min),
      max:   Number(r.max),
      count: Number(r.count),
    }));
  } catch {
    // Dev fallback — bounded sample, in-memory bucketing
    const sample = await (prisma.telemetryRecord as unknown as RowModel).findMany({
      where: {
        organizationId,
        assetId,
        tag,
        numericValue: { not: null },
        receivedAt:   { gte: range.from, lte: range.to },
      },
      select:  { receivedAt: true, numericValue: true },
      take:    5000,
      orderBy: { receivedAt: "asc" },
    });
    return bucketInMemory(sample, strategy.bucketMs);
  }
}

function bucketInMemory(
  rows:     Record<string, unknown>[],
  bucketMs: number,
): TrendPoint[] {
  const buckets = new Map<number, { sum: number; min: number; max: number; count: number }>();
  for (const r of rows) {
    const ts  = new Date(r.receivedAt as string).getTime();
    const key = Math.floor(ts / bucketMs) * bucketMs;
    const v   = r.numericValue as number;
    const b   = buckets.get(key);
    if (b) {
      b.sum   += v; b.count++; b.min = Math.min(b.min, v); b.max = Math.max(b.max, v);
    } else {
      buckets.set(key, { sum: v, min: v, max: v, count: 1 });
    }
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([key, b]) => ({
      bucketStart: new Date(key).toISOString(),
      avg:   b.sum / b.count,
      min:   b.min,
      max:   b.max,
      count: b.count,
    }));
}
