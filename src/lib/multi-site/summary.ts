/**
 * Enterprise Industrial Summary — Phase 42.
 *
 * getEnterpriseIndustrialSummary() reads from:
 *   - Latest SUCCESS MultiSiteBenchmark (Phase 42 snapshot)
 *   - Latest SUCCESS KnowledgeGraphSnapshot (Phase 41 staleness)
 *   - IndustrialSite count (Phase 35)
 *
 * Does NOT re-compute or trigger new benchmarks. Returns structured
 * top-level numbers for the enterprise summary dashboard card.
 */

import { getPrisma }                    from "@/lib/db/prisma";
import { getLatestSnapshot, isStaleSince } from "@/lib/knowledge-graph/builder";
import { getLatestBenchmark } from "./benchmarks";
import {
  type EnterpriseIndustrialSummary,
  type BenchmarkSummary,
} from "./types";

type SiteModel   = { count: (a: unknown) => Promise<number> };
type RiskModel   = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
type KPISnapModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

function mean(arr: number[]): number | null {
  return arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;
}

export async function getEnterpriseIndustrialSummary(
  orgId: string,
): Promise<EnterpriseIndustrialSummary> {
  const prisma = await getPrisma();

  // Site count — always live (cheap)
  let siteCount = 0;
  if (prisma) {
    const db = prisma as unknown as Record<string, unknown>;
    siteCount = await (db.industrialSite as unknown as SiteModel)
      .count({ where: { organizationId: orgId, status: "ACTIVE" } })
      .catch(() => 0);
  }

  // Latest benchmark snapshot + KG staleness in parallel
  const [bm, kgSnap] = await Promise.all([
    getLatestBenchmark(orgId),
    getLatestSnapshot(orgId),
  ]);

  // KG staleness (getLatestSnapshot returns { id, createdAt, summary })
  const kgStale   = isStaleSince(kgSnap?.createdAt ?? null);
  const kgBuiltAt = kgSnap?.createdAt.toISOString() ?? null;

  if (!bm) {
    return {
      organizationId:    orgId,
      siteCount,
      latestBenchmarkId: null,
      latestBenchmarkAt: null,
      benchmarkStale:    true,
      stalenessWarning:  "No benchmark computed yet. POST /api/multi-site/benchmarks to generate.",
      riskSummary: { sitesRanked: 0, highestRiskSiteId: null, avgOrgRiskScore: null },
      kpiSummary:  { sitesCompared: 0, avgOrgAvailability: null, avgOrgHealthScore: null },
      patternCount:          0,
      knowledgeGraphStale:   kgStale,
      knowledgeGraphBuiltAt: kgBuiltAt,
    };
  }

  const summary = bm.summary as BenchmarkSummary;

  // Compute org-level KPI/risk means from latest benchmark's child rows
  let avgOrgRiskScore:   number | null = null;
  let avgOrgAvailability: number | null = null;
  let avgOrgHealthScore: number | null = null;
  let sitesRanked = 0;
  let sitesCompared = 0;

  if (prisma) {
    const db = prisma as unknown as Record<string, unknown>;

    const [riskRows, kpiRows] = await Promise.all([
      (db.siteRiskSnapshot as unknown as RiskModel).findMany({
        where:  { benchmarkId: bm.id, dataStatus: { not: "insufficientData" } },
        select: { avgRiskScore: true },
      }),
      (db.siteKPIComparison as unknown as KPISnapModel).findMany({
        where:  { benchmarkId: bm.id, dataStatus: { not: "insufficientData" } },
        select: { avgAvailability: true, avgHealthScore: true },
      }),
    ]);

    const riskScores = riskRows
      .map(r => r.avgRiskScore as number | null)
      .filter((v): v is number => v !== null);
    sitesRanked       = riskRows.length;
    avgOrgRiskScore   = mean(riskScores);

    const avails = kpiRows
      .map(r => r.avgAvailability as number | null)
      .filter((v): v is number => v !== null);
    const healths = kpiRows
      .map(r => r.avgHealthScore as number | null)
      .filter((v): v is number => v !== null);
    sitesCompared       = kpiRows.length;
    avgOrgAvailability  = mean(avails);
    avgOrgHealthScore   = mean(healths);
  }

  return {
    organizationId:     orgId,
    siteCount,
    latestBenchmarkId:  bm.id,
    latestBenchmarkAt:  bm.computedAt,
    benchmarkStale:     bm.stale,
    stalenessWarning:   bm.stalenessWarning,
    riskSummary: {
      sitesRanked,
      highestRiskSiteId: summary.highestRiskSiteId,
      avgOrgRiskScore,
    },
    kpiSummary: {
      sitesCompared,
      avgOrgAvailability,
      avgOrgHealthScore,
    },
    patternCount:          summary.patternCount,
    knowledgeGraphStale:   kgStale,
    knowledgeGraphBuiltAt: kgBuiltAt,
  };
}
