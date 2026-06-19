/**
 * Time-series statistics engine — Phase 37.
 *
 * Performance rules:
 *   - min/max/avg/count: Prisma .aggregate() — computed in DB, not Node.
 *   - median/p95/p99: percentile_cont via $queryRaw (PostgreSQL only).
 *   - Dev fallback: if percentile_cont fails (non-Postgres), sort a bounded
 *     1000-row sample. Fallback is clearly logged. PRODUCTION MUST USE PostgreSQL.
 *   - Only rows where numericValue IS NOT NULL enter any computation.
 *   - Always filter by (assetId, tag) — never tag alone.
 */

import { getPrisma } from "@/lib/db/prisma";
import type { PeriodRange } from "./periods";

export interface TelemetryStatistics {
  assetId:  string;
  tag:      string;
  min:      number | null;
  max:      number | null;
  average:  number | null;
  median:   number | null;
  p95:      number | null;
  p99:      number | null;
  count:    number;
  isFallback: boolean;  // true = dev fallback (non-Postgres percentile)
}

type TelemetryAggModel = {
  aggregate: (a: unknown) => Promise<Record<string, unknown>>;
};

type RawQueryFn = (sql: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>;

export async function getStatistics(
  organizationId: string,
  assetId:        string,
  tag:            string,
  range:          PeriodRange,
): Promise<TelemetryStatistics> {
  const prisma = await getPrisma();

  const empty: TelemetryStatistics = {
    assetId, tag, min: null, max: null, average: null,
    median: null, p95: null, p99: null, count: 0, isFallback: false,
  };
  if (!prisma) return empty;

  const where = {
    organizationId,
    assetId,
    tag,
    numericValue: { not: null },
    receivedAt:   { gte: range.from, lte: range.to },
  };

  // min / max / avg / count — all in DB via aggregate
  const agg = await (prisma.telemetryRecord as unknown as TelemetryAggModel).aggregate({
    where,
    _min:   { numericValue: true },
    _max:   { numericValue: true },
    _avg:   { numericValue: true },
    _count: { numericValue: true },
  });

  const aggResult = agg as {
    _min:   { numericValue: number | null };
    _max:   { numericValue: number | null };
    _avg:   { numericValue: number | null };
    _count: { numericValue: number };
  };

  const count = aggResult._count.numericValue ?? 0;
  if (count === 0) return { ...empty, count: 0 };

  // median / p95 / p99 — percentile_cont via raw SQL
  let median: number | null = null;
  let p95:    number | null = null;
  let p99:    number | null = null;
  let isFallback = false;

  try {
    const rows = await (prisma.$queryRaw as RawQueryFn)`
      SELECT
        percentile_cont(0.50) WITHIN GROUP (ORDER BY "numericValue") AS median,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY "numericValue") AS p95,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY "numericValue") AS p99
      FROM "TelemetryRecord"
      WHERE
        "organizationId" = ${organizationId}
        AND "assetId"    = ${assetId}
        AND "tag"        = ${tag}
        AND "numericValue" IS NOT NULL
        AND "receivedAt" >= ${range.from}
        AND "receivedAt" <= ${range.to}
    `;
    const row = (rows as Record<string, unknown>[])[0];
    if (row) {
      median = row.median != null ? Number(row.median) : null;
      p95    = row.p95    != null ? Number(row.p95)    : null;
      p99    = row.p99    != null ? Number(row.p99)    : null;
    }
  } catch {
    // Development fallback: sort a bounded sample (max 1000 rows).
    // WARNING: This path must never run in production (requires PostgreSQL).
    isFallback = true;
    type RowModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
    const sample = await (prisma.telemetryRecord as unknown as RowModel).findMany({
      where,
      select:  { numericValue: true },
      take:    1000,
      orderBy: { receivedAt: "desc" },
    });
    const nums = sample
      .map((r) => r.numericValue as number)
      .filter((n) => n != null)
      .sort((a, b) => a - b);
    if (nums.length > 0) {
      median = percentileFromSorted(nums, 0.50);
      p95    = percentileFromSorted(nums, 0.95);
      p99    = percentileFromSorted(nums, 0.99);
    }
  }

  return {
    assetId,
    tag,
    min:      aggResult._min.numericValue,
    max:      aggResult._max.numericValue,
    average:  aggResult._avg.numericValue,
    median,
    p95,
    p99,
    count,
    isFallback,
  };
}

function percentileFromSorted(sorted: number[], p: number): number {
  const idx = p * (sorted.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
