/**
 * Usage tracking service (Phase 31).
 * Records metered usage against an organization.
 */

import { getPrisma } from "@/lib/db/prisma";

type UsageModel = {
  create:   (a: unknown) => Promise<Record<string, unknown>>;
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
  groupBy:  (a: unknown) => Promise<Record<string, unknown>[]>;
};

async function model(): Promise<UsageModel | null> {
  const db = await getPrisma();
  return db ? ((db as Record<string, unknown>).usageRecord as UsageModel) : null;
}

export interface UsageMetric {
  metric:     string;
  total:      number;
  recordedAt: string;
}

/** Record a usage event for an organization. */
export async function recordUsage(
  organizationId: string,
  metric:         string,
  value:          number,
): Promise<boolean> {
  const m = await model();
  if (!m) return false;
  try {
    await m.create({
      data: {
        organizationId,
        metric,
        value:      value.toFixed(4),
        recordedAt: new Date(),
      },
    });
    return true;
  } catch {
    return false;
  }
}

/** Get recent usage records for an organization. */
export async function listUsage(
  organizationId: string,
  limit = 50,
): Promise<UsageMetric[]> {
  const m = await model();
  if (!m) return [];
  try {
    const rows = await m.findMany({
      where:   { organizationId },
      orderBy: { recordedAt: "desc" },
      take:    limit,
    });
    return rows.map((r) => ({
      metric:     String(r.metric),
      total:      parseFloat(String(r.value)),
      recordedAt: new Date(r.recordedAt as string).toISOString(),
    }));
  } catch {
    return [];
  }
}

/** Aggregate usage per metric for the current billing period (last 30 days). */
export async function getUsageSummary(
  organizationId: string,
): Promise<Record<string, number>> {
  const m = await model();
  if (!m) return {};
  const since = new Date();
  since.setDate(since.getDate() - 30);
  try {
    const rows = await m.findMany({
      where:   { organizationId, recordedAt: { gte: since } },
      orderBy: { recordedAt: "asc" },
    });
    const totals: Record<string, number> = {};
    for (const row of rows) {
      const k = String(row.metric);
      totals[k] = (totals[k] ?? 0) + parseFloat(String(row.value));
    }
    return totals;
  } catch {
    return {};
  }
}
