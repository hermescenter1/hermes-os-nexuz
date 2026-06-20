/**
 * Multi-Site Comparison Orchestrator — Phase 42.
 *
 * compareSites() loads the site+asset maps and fans out to the three
 * domain-specific comparison services (kpis, risk, knowledge) plus
 * failure-patterns. Returns the combined raw data for use by benchmarks.ts
 * which writes the snapshot rows.
 *
 * Does NOT call Phase 37/39/40 computation engines — reads only their
 * pre-computed output tables (KPIRecord, AssetRiskScore, AssetHealthHistory,
 * AssetKnowledgeLink, IndustrialEngineeringCase).
 *
 * ACCESS MODEL: orgId always from authenticated context. Phase 43: compareSites()
 * accepts allowedSiteIds (from getAllowedSiteIds()) to scope to the user's sites.
 * OWNER/ADMIN pass undefined → full org access. Others pass their explicit site list.
 */

import { getPrisma }             from "@/lib/db/prisma";
import { compareSiteKPIs }       from "./kpis";
import { rankSitesByRisk }       from "./risk";
import { findCrossSiteFailurePatterns } from "./failure-patterns";
import { getSiteKnowledgeCoverage }    from "./knowledge";
import type {
  SiteKPIData,
  SiteRiskData,
  CrossSitePatternData,
  SiteKnowledgeCoverageData,
  BenchmarkSummary,
} from "./types";

type SiteModel  = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
type AssetModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

export interface ComparisonResult {
  siteMap:      Map<string, string>;     // siteId → siteName
  siteAssetMap: Map<string, string[]>;   // siteId → assetId[]
  siteIds:      string[];
  kpis:         SiteKPIData[];
  risk:         SiteRiskData[];
  patterns:     CrossSitePatternData[];
  coverage:     SiteKnowledgeCoverageData[];
  summary:      BenchmarkSummary;
}

function buildSummary(
  risk:     SiteRiskData[],
  kpis:     SiteKPIData[],
  patterns: CrossSitePatternData[],
): BenchmarkSummary {
  const qualifiedRisk = risk.filter(s => s.dataStatus !== "insufficientData");
  const qualifiedKpis = kpis.filter(s => s.dataStatus !== "insufficientData");

  const highestRisk  = qualifiedRisk[0] ?? null;
  const lowestRisk   = qualifiedRisk[qualifiedRisk.length - 1] ?? null;

  const byAvail = [...qualifiedKpis]
    .filter(s => s.avgAvailability !== null)
    .sort((a, b) => (b.avgAvailability ?? 0) - (a.avgAvailability ?? 0));

  const byHealth = [...qualifiedKpis]
    .filter(s => s.avgHealthScore !== null)
    .sort((a, b) => (b.avgHealthScore ?? 0) - (a.avgHealthScore ?? 0));

  return {
    topSiteByAvailability:    byAvail[0]?.siteId ?? null,
    bottomSiteByAvailability: byAvail[byAvail.length - 1]?.siteId ?? null,
    topSiteByHealth:          byHealth[0]?.siteId ?? null,
    bottomSiteByRisk:         lowestRisk?.siteId ?? null,
    highestRiskSiteId:        highestRisk?.siteId ?? null,
    patternCount:             patterns.length,
    sitesWithInsufficientData: risk.filter(s => s.dataStatus === "insufficientData").length,
    sitesWithStaleData:        risk.filter(s => s.dataStatus === "stale").length,
  };
}

/**
 * Phase 43: allowedSiteIds scopes comparison to the caller's accessible sites.
 *   - undefined  → OWNER/ADMIN full access: all ACTIVE sites in org
 *   - string[]   → explicit allowed set (may be empty → returns null immediately)
 */
export async function compareSites(
  orgId:          string,
  allowedSiteIds?: string[],
): Promise<ComparisonResult | null> {
  // Zero-sites case: user has no accessible sites — return null, never 500
  if (allowedSiteIds !== undefined && allowedSiteIds.length === 0) return null;

  const prisma = await getPrisma();
  if (!prisma) return null;
  const db = prisma as unknown as Record<string, unknown>;

  const siteWhere: Record<string, unknown> = { organizationId: orgId, status: "ACTIVE" };
  if (allowedSiteIds !== undefined) siteWhere.id = { in: allowedSiteIds };

  const siteRows = await (db.industrialSite as unknown as SiteModel).findMany({
    where:   siteWhere,
    orderBy: { name: "asc" },
    select:  { id: true, name: true },
  });

  if (siteRows.length === 0) return null;

  const siteIds    = siteRows.map(r => r.id as string);
  const siteMap    = new Map(siteRows.map(r => [r.id as string, r.name as string]));

  // Load all assets per site
  const assetRows = await (db.industrialAsset as unknown as AssetModel).findMany({
    where:  { organizationId: orgId, siteId: { in: siteIds } },
    select: { id: true, siteId: true },
  });

  const siteAssetMap = new Map<string, string[]>();
  for (const siteId of siteIds) siteAssetMap.set(siteId, []);
  for (const a of assetRows) {
    const sid = a.siteId as string;
    siteAssetMap.get(sid)?.push(a.id as string);
  }

  // Fan out to domain services (all read pre-computed data)
  const [kpis, risk, patterns, coverage] = await Promise.all([
    compareSiteKPIs(orgId, siteMap, siteAssetMap),
    rankSitesByRisk(orgId, siteMap, siteAssetMap),
    findCrossSiteFailurePatterns(orgId, siteIds),
    getSiteKnowledgeCoverage(orgId, siteMap, siteAssetMap),
  ]);

  const summary = buildSummary(risk, kpis, patterns);

  return { siteMap, siteAssetMap, siteIds, kpis, risk, patterns, coverage, summary };
}
