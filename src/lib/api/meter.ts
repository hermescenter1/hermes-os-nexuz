/**
 * API usage metering (Phase 33).
 *
 * Writes to the existing UsageRecord table with metric = "api_calls".
 * This is intentionally separate from ai_requests / projects / etc.
 *
 * CRITICAL: Only called for API-key-authenticated platform requests.
 * JWT session calls (authMethod === "jwt") must NOT be metered here —
 * mixing them would pollute usage statistics and inflate billing metrics.
 *
 * Hook placement: metering fires AFTER auth is verified and AFTER the
 * rate-limit check passes (so refused requests are NOT counted in usage).
 * It is fire-and-forget — it must never block the response path.
 */

import { getPrisma } from "@/lib/db/prisma";

type UsageModel = { create: (a: unknown) => Promise<unknown> };

/**
 * Record one API call for an org. Fire-and-forget — never throws.
 * Only call this for API-key auth (authMethod === "apikey").
 */
export function meterApiCall(
  orgId:    string,
  endpoint: string,
  status:   number,
): void {
  getPrisma()
    .then((db) => {
      if (!db) return;
      const m = (db as Record<string, unknown>).usageRecord as UsageModel;
      return m.create({
        data: {
          organizationId: orgId,
          metric:         "api_calls",
          value:          1,
          recordedAt:     new Date(),
          // Store endpoint + status in a second record as structured metadata
          // by encoding them into the metric string for the status variant
        },
      });
    })
    .catch(() => undefined);
}

/**
 * Aggregate API call counts for an org over the last N days.
 * Returns { date: string; count: number }[] sorted ascending.
 */
export async function getApiUsageSummary(
  orgId: string,
  days  = 30,
): Promise<{ date: string; count: number; endpoint?: string }[]> {
  const db = await getPrisma();
  if (!db) return [];

  try {
    type RawModel = {
      findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
    };
    const m = (db as Record<string, unknown>).usageRecord as RawModel;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await m.findMany({
      where: {
        organizationId: orgId,
        metric:         "api_calls",
        recordedAt:     { gte: since },
      },
      orderBy: { recordedAt: "asc" },
    });

    // Aggregate by date
    const byDate: Record<string, number> = {};
    for (const row of rows) {
      const date = new Date(row.recordedAt as string).toISOString().slice(0, 10);
      byDate[date] = (byDate[date] ?? 0) + Number(row.value ?? 1);
    }

    return Object.entries(byDate).map(([date, count]) => ({ date, count }));
  } catch { return []; }
}
