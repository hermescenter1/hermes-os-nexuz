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
 * SCOPE IS MANDATORY (slice D1, MS-03). There is no unscoped path any more: the
 * caller passes the viewer's readable ACTIVE sites (OWNER/ADMIN: every active
 * site; others: their granted active sites). Omitting it is a compile error and
 * a runtime refusal; an EMPTY scope yields the empty summary and reads nothing.
 * Nothing from the stored organisation-wide benchmark summary is reported.
 */

import { getPrisma }                    from "@/lib/db/prisma";
import { getLatestSnapshot, isStaleSince } from "@/lib/knowledge-graph/builder";
import { getLatestBenchmark } from "./benchmarks";
import { projectPersistedPatterns } from "./projection";
import {
  type EnterpriseIndustrialSummary,
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
function siteFilter(allowedSiteIds: readonly string[]): Record<string, unknown> {
  return { siteId: { in: [...allowedSiteIds] } };
}

/** The answer for a viewer with no readable site: nothing about the organisation, no benchmark claimed. */
function emptySummary(orgId: string): EnterpriseIndustrialSummary {
  return {
    organizationId:    orgId,
    siteCount:         0,
    latestBenchmarkId: null,
    latestBenchmarkAt: null,
    benchmarkStale:    false,
    stalenessWarning:  null,
    riskSummary: { sitesRanked: 0, highestRiskSiteId: null, avgOrgRiskScore: null },
    kpiSummary:  { sitesCompared: 0, avgOrgAvailability: null, avgOrgHealthScore: null },
    patternCount:          0,
    knowledgeGraphStale:   false,
    knowledgeGraphBuiltAt: null,
  };
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
 * The number on the summary card is the number of patterns the caller can actually open: it is the length
 * of the SAME viewer-safe projection `/api/multi-site/failure-patterns` returns (a pattern counts only
 * when at least two of the caller's sites each contribute valid, policy-eligible evidence). Counting
 * stored rows that merely touch one accessible site would disclose that patterns involving hidden sites
 * exist. A lookup error counts as zero (fail closed).
 */
async function scopedPatternCount(
  db: Record<string, unknown>,
  orgId: string,
  benchmarkId: string,
  allowedSiteIds: readonly string[],
): Promise<number> {
  const rows = await (db.crossSiteFailurePattern as unknown as PatternModel)
    .findMany({ where: { benchmarkId, organizationId: orgId } })
    .catch(() => [] as Record<string, unknown>[]);
  return (await projectPersistedPatterns(db, orgId, allowedSiteIds, rows)).length;
}

/**
 * @param allowedSiteIds REQUIRED — the viewer's readable ACTIVE sites, server derived. An empty list yields
 *                       the empty summary. Anything that is not an array is refused at runtime too.
 */
export async function getEnterpriseIndustrialSummary(
  orgId: string,
  allowedSiteIds: readonly string[],
): Promise<EnterpriseIndustrialSummary> {
  if (!Array.isArray(allowedSiteIds)) throw new TypeError("SUMMARY_SCOPE_REQUIRED");
  if (allowedSiteIds.length === 0) return emptySummary(orgId);
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
          id: { in: [...allowedSiteIds] },
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

  // Compute KPI/risk means from the latest benchmark's child rows, narrowed to
  // the caller's accessible sites.
  let avgOrgRiskScore:   number | null = null;
  let avgOrgAvailability: number | null = null;
  let avgOrgHealthScore: number | null = null;
  let sitesRanked = 0;
  let sitesCompared = 0;
  // Never the stored ORG-WIDE values: both are recomputed within the scope below.
  let highestRiskSiteId: string | null = null;
  let patternCount = 0;

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

    // The stored org-wide summary would NAME a possibly-inaccessible site and count patterns the caller
    // cannot open; both are recomputed from the caller's own rows.
    highestRiskSiteId = highestRiskSiteIdFrom(riskRows);
    patternCount      = await scopedPatternCount(db, orgId, bm.id, allowedSiteIds);
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
