/**
 * Multi-Site Industrial Intelligence types — Phase 42.
 *
 * SAFETY INVARIANT: Read / observe / analyze only.
 * No control commands, no PLC writes, no autonomous actions.
 *
 * ACCESS MODEL: Organization-level only. All ACTIVE sites in the org are included.
 * Audit (2026-06-20): No site-scoped permission model (UserSite, SiteMembership,
 * SiteRole, or equivalent) exists anywhere in Phases 1–41.5. The only RBAC model
 * is OrganizationMember with OrgRole — no siteId column on any ACL table.
 *
 * Phase 43/44 PREREQUISITE: Add a site-level membership model (e.g. UserSite with
 * siteId + userId + role) and update compareSites() to accept allowedSiteIds from
 * the caller. Until then, org-level access is the correct and complete access model.
 *
 * DATA-SUFFICIENCY GATE:
 *   dataStatus="insufficientData" → 0 qualifying assets → excluded from ranking.
 *   dataStatus="stale" → lastDataTimestamp > RISK_DATA_MAX_STALE_HOURS → included,
 *     confidence="LOW", result labeled.
 *   dataStatus="ok" → at least MIN_ASSETS_WITH_DATA assets with fresh data.
 *
 * KPI NORMALIZATION:
 *   availability, efficiency, healthScore: 0–100 rate means — directly comparable.
 *   runtime/downtime counts: NOT included in cross-site ranking (not rate-normalized).
 *   Site value = arithmetic mean across qualifying assets within the period.
 *   Excluded assets (no data in period) are counted in assetsWithoutData, NOT zeroed.
 */

// ── Data-Sufficiency Gate Constants ──────────────────────────────────────────

/** Minimum sites required to produce a meaningful cross-site comparison. */
export const MIN_SITES_FOR_COMPARISON = 2;

/** Minimum assets with data per site to include the site in KPI / risk means. */
export const MIN_ASSETS_WITH_DATA = 1;

/** Max age of AssetRiskScore before a site is marked "stale" (hours). */
export const RISK_DATA_MAX_STALE_HOURS = 48;

/** Max age of AssetHealthHistory before health data is considered stale (hours). */
export const HEALTH_DATA_MAX_STALE_HOURS = 24;

/** KPI comparison period used for all benchmark runs. */
export const KPI_PERIOD = "last30Days" as const;

/** Benchmark snapshots older than this are flagged stale: true (hours). */
export const SNAPSHOT_STALE_HOURS = 4;

/** Cross-site failure pattern: minimum distinct sites to qualify. */
export const MIN_SITES_FOR_PATTERN = 2;

// ── Data-Status Types ─────────────────────────────────────────────────────────

export type SiteDataStatus = "ok" | "insufficientData" | "stale";
export type MultiSiteConfidence = "LOW" | "MEDIUM" | "HIGH";
export type MultiSiteSnapshotStatus = "RUNNING" | "SUCCESS" | "FAILED";

// ── Site KPI Comparison ───────────────────────────────────────────────────────

export interface SiteKPIData {
  siteId:            string;
  siteName:          string;
  periodLabel:       string;
  avgAvailability:   number | null;
  avgEfficiency:     number | null;
  avgHealthScore:    number | null;
  assetCount:        number;
  assetsWithKpiData: number;
  dataStatus:        SiteDataStatus;
  lastDataTimestamp: string | null;
}

// ── Site Risk Ranking ─────────────────────────────────────────────────────────

export interface SiteRiskData {
  siteId:           string;
  siteName:         string;
  assetCount:       number;
  assetsWithData:   number;
  avgRiskScore:     number | null;
  maxRiskScore:     number | null;
  minRiskScore:     number | null;
  riskDistribution: Record<string, number>;
  dataStatus:       SiteDataStatus;
  confidence:       MultiSiteConfidence;
  lastDataTimestamp: string | null;
}

// ── Knowledge Coverage ────────────────────────────────────────────────────────

export interface SiteKnowledgeCoverageData {
  siteId:           string;
  siteName:         string;
  assetCount:       number;
  assetsWithLinks:  number;
  totalArticleLinks: number;
  totalFailureModeLinks: number;
  totalProcedureLinks: number;
  totalCaseLinks:   number;
  coverageScore:    number;  // 0–100: % of assets with at least one knowledge link
}

// ── Cross-Site Failure Pattern ────────────────────────────────────────────────

export interface CrossSitePatternData {
  failureModeId:      string;
  failureModeName:    string;
  severity:           string;
  siteIds:            string[];
  siteCount:          number;
  caseCount:          number;
  affectedAssetTypes: string[];
  evidence:           {
    caseIds:   string[];
    bySite:    Record<string, { caseIds: string[]; assetIds: string[] }>;
  };
}

// ── Benchmark Summary ─────────────────────────────────────────────────────────

export interface BenchmarkSummary {
  topSiteByAvailability:   string | null;  // siteId
  bottomSiteByAvailability: string | null;
  topSiteByHealth:         string | null;
  bottomSiteByRisk:        string | null;  // lowest risk = safest
  highestRiskSiteId:       string | null;
  patternCount:            number;
  sitesWithInsufficientData: number;
  sitesWithStaleData:      number;
}

// ── Enterprise Industrial Summary ─────────────────────────────────────────────

export interface EnterpriseIndustrialSummary {
  organizationId:     string;
  siteCount:          number;
  latestBenchmarkId:  string | null;
  latestBenchmarkAt:  string | null;
  benchmarkStale:     boolean;
  stalenessWarning:   string | null;
  riskSummary: {
    sitesRanked:       number;
    highestRiskSiteId: string | null;
    avgOrgRiskScore:   number | null;
  };
  kpiSummary: {
    sitesCompared:      number;
    avgOrgAvailability: number | null;
    avgOrgHealthScore:  number | null;
  };
  patternCount:           number;
  knowledgeGraphStale:    boolean;
  knowledgeGraphBuiltAt:  string | null;
}

// ── Benchmark Record (read from DB) ──────────────────────────────────────────

export interface BenchmarkRecord {
  id:            string;
  organizationId: string;
  status:        MultiSiteSnapshotStatus;
  periodLabel:   string;
  siteCount:     number;
  summary:       BenchmarkSummary;
  errorMessage:  string | null;
  startedAt:     string | null;
  completedAt:   string | null;
  computedAt:    string;
  stale:         boolean;
  stalenessWarning: string | null;
}
