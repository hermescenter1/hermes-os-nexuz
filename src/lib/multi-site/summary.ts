/**
 * Enterprise Industrial Summary — Phase 42, site-scoped per Phase 43.
 *
 * getEnterpriseIndustrialSummary() reads from:
 *   - Latest SUCCESS MultiSiteBenchmark (Phase 42 snapshot)
 *   - Latest SUCCESS KnowledgeGraphSnapshot (Phase 41 staleness)
 *   - IndustrialSite count (Phase 35)
 *
 * Does NOT re-compute or trigger new benchmarks. Returns structured
 * top-level numbers for the enterprise summary dashboard card.
 *
 * SITE SCOPING (Phase 43 contract)
 * --------------------------------
 * The benchmark and its child rows are ORGANIZATION-wide artifacts. Every other
 * Phase 43 read surface (`/risk`, `/kpis`, `/failure-patterns`,
 * `/knowledge-coverage`, `/benchmarks`) narrows them to the caller's accessible
 * sites with `siteId: { in: allowedSiteIds }`; this module did not, so a member
 * whose `UserSite` grants one site still received org-wide means, an org-wide
 * site count, an org-wide pattern count, and — worst — `highestRiskSiteId`,
 * which NAMES a site that may be outside their scope.
 *
 * Scoping here is real recomputation from the caller's own rows, not a relabel:
 * the aggregates are recomputed from the filtered row set, and the two fields
 * that were read straight off the stored org-wide benchmark summary
 * (`highestRiskSiteId`, `patternCount`) are recomputed within scope using the
 * SAME semantics the benchmark itself used, so the summary agrees with the
 * detail pages a scoped caller can actually open.
 *
 * `allowedSiteIds === undefined` means "no site scope applies" — the caller has
 * no user context (API-key auth). That path is byte-for-byte unchanged: no
 * filter is added and the stored benchmark summary fields are used as before.
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
type PatternModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

function mean(arr: number[]): number | null {
  return arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;
}

/**
 * The site predicate shared by every scoped query — identical in shape to the
 * one the sibling Phase 43 routes build, so the summary and the detail views
 * can never disagree about what "in scope" means.
 */
function siteFilter(allowedSiteIds: string[] | undefined): Record<string, unknown> {
  return allowedSiteIds ? { siteId: { in: allowedSiteIds } } : {};
}

/**
 * Highest-risk site WITHIN the caller's scope.
 *
 * Mirrors `buildSummary` in comparison.ts: the highest `avgRiskScore` among
 * rows that are not `insufficientData`. Recomputed rather than read from the
 * stored benchmark summary because that value is org-wide and would otherwise
 * disclose the identity of a site the caller cannot access.
 */
function highestRiskSiteIdFrom(rows: Record<string, unknown>[]): string | null {
  let bestId: string | null = null;
  let bestScore = -Infinity;
  for (const r of rows) {
    const score = r.avgRiskScore as number | null;
    if (score === null || score === undefined) continue;
    if (score > bestScore) { bestScore = score; bestId = String(r.siteId); }
  }
  return bestId;
}

/**
 * Cross-site patterns visible to the caller.
 *
 * `CrossSiteFailurePattern.siteIds` is a JSON array, so this cannot be filtered
 * at the database layer — the same reason `/api/multi-site/failure-patterns`
 * filters in memory. The predicate is deliberately IDENTICAL to that route's
 * (a pattern counts when it involves at least one accessible site), so the
 * number on the summary card equals the number of rows the caller sees when
 * they open the failure-patterns page.
 */
async function scopedPatternCount(
  db: Record<string, unknown>,
  benchmarkId: string,
  allowedSiteIds: string[],
): Promise<number> {
  const rows = await (db.crossSiteFailurePattern as unknown as PatternModel)
    .findMany({ where: { benchmarkId }, select: { siteIds: true } })
    .catch(() => [] as Record<string, unknown>[]);
  const allowed = new Set(allowedSiteIds);
  return rows.filter((r) => {
    const ids = Array.isArray(r.siteIds) ? (r.siteIds as string[]) : [];
    return ids.some((sid) => allowed.has(sid));
  }).length;
}

/**
 * @param allowedSiteIds Sites the caller may see. `undefined` = no user context
 *                       (API-key auth), which applies no site filter. An EMPTY
 *                       array is a caller with no accessible sites; the route
 *                       answers that case before calling this function.
 */
export async function getEnterpriseIndustrialSummary(
  orgId: string,
  allowedSiteIds?: string[],
): Promise<EnterpriseIndustrialSummary> {
  const prisma = await getPrisma();

  // Site count — always live (cheap). Scoped: the caller's ACCESSIBLE active
  // sites, not every active site in the organization. Filtering on BOTH the
  // allow-list and ACTIVE status also drops a stale UserSite grant pointing at
  // a site that has since been deactivated.
  let siteCount = 0;
  if (prisma) {
    const db = prisma as unknown as Record<string, unknown>;
    siteCount = await (db.industrialSite as unknown as SiteModel)
      .count({
        where: {
          organizationId: orgId,
          status: "ACTIVE",
          ...(allowedSiteIds ? { id: { in: allowedSiteIds } } : {}),
        },
      })
      .catch(() => 0);
  }

  // Latest benchmark snapshot + KG staleness in parallel.
  // Both are ORG-level artifacts: an opaque benchmark id, its timestamp, and the
  // knowledge-graph build time. None of them identifies a site, so they are not
  // narrowed by scope.
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

  // Compute KPI/risk means from the latest benchmark's child rows, narrowed to
  // the caller's accessible sites.
  let avgOrgRiskScore:   number | null = null;
  let avgOrgAvailability: number | null = null;
  let avgOrgHealthScore: number | null = null;
  let sitesRanked = 0;
  let sitesCompared = 0;
  // Default to the stored ORG-WIDE values; both are replaced below whenever a
  // site scope applies.
  let highestRiskSiteId: string | null = summary.highestRiskSiteId;
  let patternCount = summary.patternCount;

  if (prisma) {
    const db = prisma as unknown as Record<string, unknown>;
    const scoped = siteFilter(allowedSiteIds);

    const [riskRows, kpiRows] = await Promise.all([
      (db.siteRiskSnapshot as unknown as RiskModel).findMany({
        where:  { benchmarkId: bm.id, dataStatus: { not: "insufficientData" }, ...scoped },
        // siteId is selected so the highest-risk site can be recomputed in scope.
        select: { siteId: true, avgRiskScore: true },
      }),
      (db.siteKPIComparison as unknown as KPISnapModel).findMany({
        where:  { benchmarkId: bm.id, dataStatus: { not: "insufficientData" }, ...scoped },
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

    if (allowedSiteIds) {
      // Both of these come from the org-wide stored summary and must not be
      // reported to a scoped caller: one NAMES a possibly-inaccessible site, the
      // other counts patterns the caller cannot open.
      highestRiskSiteId = highestRiskSiteIdFrom(riskRows);
      patternCount      = await scopedPatternCount(db, bm.id, allowedSiteIds);
    }
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
      highestRiskSiteId,
      avgOrgRiskScore,
    },
    kpiSummary: {
      sitesCompared,
      avgOrgAvailability,
      avgOrgHealthScore,
    },
    patternCount,
    knowledgeGraphStale:   kgStale,
    knowledgeGraphBuiltAt: kgBuiltAt,
  };
}
