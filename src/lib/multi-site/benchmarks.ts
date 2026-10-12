/**
 * Multi-Site Benchmark Lifecycle — Phase 42.
 *
 * runBenchmark()       — computes and persists a new MultiSiteBenchmark.
 * getLatestBenchmark() — returns the latest SUCCESS snapshot with staleness.
 * isBenchmarkInFlight() — per-org advisory lock (mirrors Phase 41 graph rebuild).
 *
 * LIFECYCLE:
 *   1. Mark RUNNING (pre-transaction).
 *   2. compareSites() fans out to kpis/risk/patterns/knowledge services.
 *   3. Write all child rows + mark SUCCESS inside one transaction.
 *   4. On error: mark FAILED with errorMessage outside the transaction.
 *
 * STALENESS:
 *   getLatestBenchmark() returns stale:true if computedAt > SNAPSHOT_STALE_HOURS old.
 *
 * SHARED SNAPSHOT (slice D1, MS-02). The benchmark is ONE organisation-wide snapshot that every reader
 * projects through its own scope (./projection.ts). It is therefore always computed over EVERY active site
 * of the organisation, derived here, server side — never over a caller's site list — and only a caller that
 * may read every active site (OWNER/ADMIN, enforced by the route) may run it. A RUNNING or FAILED run is
 * never "the latest"; the SUCCESS status and every child row are written in one transaction.
 */

import { getPrisma }    from "@/lib/db/prisma";
import { compareSites }  from "./comparison";
import {
  KPI_PERIOD,
  SNAPSHOT_STALE_HOURS,
  type BenchmarkRecord,
  type BenchmarkSummary,
} from "./types";

type BMModel  = {
  create:    (a: unknown) => Promise<Record<string, unknown>>;
  update:    (a: unknown) => Promise<Record<string, unknown>>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
};
type RiskSnap = { create: (a: unknown) => Promise<unknown> };
type KPISnap  = { create: (a: unknown) => Promise<unknown> };
type PatSnap  = { create: (a: unknown) => Promise<unknown> };

// Per-org in-process flag (mirrors KG rebuild pattern)
const inFlight = new Set<string>();

export function isBenchmarkInFlight(orgId: string): boolean {
  return inFlight.has(orgId);
}

function makeStaleness(computedAt: Date): { stale: boolean; stalenessWarning: string | null } {
  const hoursOld = (Date.now() - computedAt.getTime()) / 3_600_000;
  const stale    = hoursOld > SNAPSHOT_STALE_HOURS;
  return {
    stale,
    stalenessWarning: stale
      ? `Benchmark data is ${Math.floor(hoursOld)}h old. Trigger a new benchmark via POST /api/multi-site/benchmarks.`
      : null,
  };
}

function bmRow(r: Record<string, unknown>): BenchmarkRecord {
  const computedAt = new Date(r.computedAt as string);
  const { stale, stalenessWarning } = makeStaleness(computedAt);
  return {
    id:             r.id             as string,
    organizationId: r.organizationId as string,
    status:         r.status         as "RUNNING" | "SUCCESS" | "FAILED",
    periodLabel:    r.periodLabel    as string,
    siteCount:      r.siteCount      as number,
    summary:        (r.summary       ?? {}) as BenchmarkSummary,
    errorMessage:   (r.errorMessage  ?? null) as string | null,
    startedAt:      r.startedAt ? new Date(r.startedAt as string).toISOString() : null,
    completedAt:    r.completedAt ? new Date(r.completedAt as string).toISOString() : null,
    computedAt:     computedAt.toISOString(),
    stale,
    stalenessWarning,
  };
}

export async function getLatestBenchmark(orgId: string): Promise<BenchmarkRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const db = prisma as unknown as Record<string, unknown>;
  const r = await (db.multiSiteBenchmark as unknown as BMModel).findFirst({
    where:   { organizationId: orgId, status: "SUCCESS" },
    orderBy: [{ computedAt: "desc" }, { id: "desc" }],
  });
  return r ? bmRow(r) : null;
}

/**
 * Computes and persists the organisation's shared benchmark over EVERY active site of the organisation.
 * There is deliberately no site parameter: a partial run must never become the snapshot every reader sees.
 * The caller must already have verified that the actor may read every active site (OWNER/ADMIN).
 */
export async function runBenchmark(orgId: string): Promise<BenchmarkRecord> {
  if (inFlight.has(orgId)) {
    throw Object.assign(new Error("Benchmark already in progress"), { code: "BENCHMARK_IN_FLIGHT" });
  }
  inFlight.add(orgId);

  const prisma = await getPrisma();
  if (!prisma) {
    inFlight.delete(orgId);
    throw new Error("Database unavailable");
  }
  const db = prisma as unknown as Record<string, unknown>;
  const bmModel = db.multiSiteBenchmark as unknown as BMModel;

  const startedAt = new Date();

  // Create RUNNING record. A failure here must release the per-org flag, or every later run is refused.
  let bmCreated: Record<string, unknown>;
  try {
    bmCreated = await bmModel.create({
      data: {
        organizationId: orgId,
        status:         "RUNNING",
        periodLabel:    KPI_PERIOD,
        siteCount:      0,
        summary:        {},
        startedAt,
      },
    });
  } catch (err) {
    inFlight.delete(orgId);
    throw err;
  }
  const bmId = bmCreated.id as string;

  try {
    const result = await compareSites(orgId);
    if (!result) {
      await bmModel.update({
        where: { id: bmId },
        data:  { status: "FAILED", errorMessage: "No active sites found", completedAt: new Date() },
      });
      inFlight.delete(orgId);
      const r = await bmModel.findFirst({ where: { id: bmId } });
      return bmRow(r!);
    }

    const completedAt = new Date();

    // Write all child rows + SUCCESS atomically
    await (prisma as unknown as { $transaction: (fn: (tx: unknown) => Promise<void>) => Promise<void> })
      .$transaction(async (tx: unknown) => {
        const txDb = tx as Record<string, unknown>;

        // Update benchmark to SUCCESS
        await (txDb.multiSiteBenchmark as unknown as BMModel).update({
          where: { id: bmId },
          data:  {
            status:      "SUCCESS",
            siteCount:   result.siteIds.length,
            summary:     result.summary,
            completedAt,
            computedAt:  completedAt,
          },
        });

        // SiteRiskSnapshot rows
        for (const s of result.risk) {
          await (txDb.siteRiskSnapshot as unknown as RiskSnap).create({
            data: {
              organizationId:   orgId,
              benchmarkId:      bmId,
              siteId:           s.siteId,
              siteName:         s.siteName,
              assetCount:       s.assetCount,
              assetsWithData:   s.assetsWithData,
              avgRiskScore:     s.avgRiskScore,
              maxRiskScore:     s.maxRiskScore,
              minRiskScore:     s.minRiskScore,
              riskDistribution: s.riskDistribution,
              dataStatus:       s.dataStatus,
              confidence:       s.confidence,
              lastDataTimestamp: s.lastDataTimestamp ? new Date(s.lastDataTimestamp) : null,
              computedAt:       completedAt,
            },
          });
        }

        // SiteKPIComparison rows
        for (const k of result.kpis) {
          await (txDb.siteKPIComparison as unknown as KPISnap).create({
            data: {
              organizationId:    orgId,
              benchmarkId:       bmId,
              siteId:            k.siteId,
              siteName:          k.siteName,
              periodLabel:       k.periodLabel,
              avgAvailability:   k.avgAvailability,
              avgEfficiency:     k.avgEfficiency,
              avgHealthScore:    k.avgHealthScore,
              assetCount:        k.assetCount,
              assetsWithKpiData: k.assetsWithKpiData,
              dataStatus:        k.dataStatus,
              lastDataTimestamp: k.lastDataTimestamp ? new Date(k.lastDataTimestamp) : null,
              computedAt:        completedAt,
            },
          });
        }

        // CrossSiteFailurePattern rows
        for (const p of result.patterns) {
          await (txDb.crossSiteFailurePattern as unknown as PatSnap).create({
            data: {
              organizationId:     orgId,
              benchmarkId:        bmId,
              failureModeId:      p.failureModeId,
              failureModeName:    p.failureModeName,
              severity:           p.severity,
              siteIds:            p.siteIds,
              siteCount:          p.siteCount,
              caseCount:          p.caseCount,
              affectedAssetTypes: p.affectedAssetTypes,
              evidence:           p.evidence,
              computedAt:         completedAt,
            },
          });
        }
      });

    inFlight.delete(orgId);
    const r = await bmModel.findFirst({ where: { id: bmId } });
    return bmRow(r!);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await bmModel.update({
      where: { id: bmId },
      data:  { status: "FAILED", errorMessage: msg, completedAt: new Date() },
    }).catch(() => undefined);
    inFlight.delete(orgId);
    throw err;
  }
}
