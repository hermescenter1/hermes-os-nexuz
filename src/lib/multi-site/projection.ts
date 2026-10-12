/**
 * Viewer-safe projection of the Multi-site analytics — corrective slice B (IR-02).
 *
 * WHAT WAS WRONG. The benchmark, its cross-site failure patterns and the summary persisted on it are
 * ORGANISATION-wide. Two readers returned them as stored: `/benchmarks` served every pattern and the
 * stored summary (`highestRiskSiteId`, …); `/failure-patterns` served a whole pattern as soon as ONE of its
 * sites was readable, with the other sites' ids, case ids, asset ids and per-site counts inside. The
 * aggregation itself trusted `case.siteId` alone, so a case whose asset lives elsewhere (or in another
 * organisation) still counted.
 *
 * THE RULE. Nothing a restricted viewer receives is copied from a stored aggregate. It is rebuilt from
 * AUTHORITATIVE live records that pass the one engineering-case policy (`knowledge/case-visibility.ts`,
 * the same one RV-01 uses) evaluated for the viewer's sites:
 *
 *   a case contributes only if it is the organisation's, carries a SITE, that site is one of the viewer's
 *   active sites and, when the case claims an asset, that asset exists in the same organisation on the
 *   SAME site. An asset-only case or a case with neither site nor asset (organisation-level) contributes
 *   nothing to a site analysis. A case with a missing, foreign or disagreeing asset contributes nothing.
 *
 * A pattern is visible only if at least {@link MIN_SITES_FOR_PATTERN} distinct viewer sites each contribute
 * valid evidence. A pattern that is left with one viewer site is OMITTED, not redacted, so the response
 * never hints that another site took part. A benchmark needs {@link MIN_SITES_FOR_COMPARISON} visible sites
 * for the same reason. Counts, rankings and the summary are computed after that filtering.
 *
 * The persisted rows are only used as LOOKUP KEYS (which cases the snapshot cited); every identifier,
 * count and type in the output comes from the live records. Unknown stored fields are never forwarded.
 */

import { logInfraFailure } from "@/lib/logger/security-events";
import { listVisibleCaseIds, MAX_VISIBLE_CASE_IDS } from "@/lib/knowledge/case-visibility";
import { createGraphViewerScope } from "@/lib/knowledge-graph/visibility";
import {
  MIN_SITES_FOR_COMPARISON,
  MIN_SITES_FOR_PATTERN,
  type BenchmarkRecord,
  type BenchmarkSummary,
} from "./types";

type Row = Record<string, unknown>;
type Db = Record<string, unknown>;
interface FindManyModel { findMany: (a: unknown) => Promise<Row[]> }

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const CHUNK = 5000;
function chunks<T>(a: readonly T[], n = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

// ── Authoritative case eligibility ───────────────────────────────────────────

export interface EligibleCase {
  id:            string;
  siteId:        string;
  assetId:       string | null;
  failureModeId: string;
  assetType:     string | null;
}

/**
 * The cases that may contribute to a Multi-site analysis for `siteIds` (the viewer's ACTIVE sites).
 *
 * Step 1 asks the CANONICAL case policy which cases those sites may read (organisation, site in the
 * list, asset exists in the organisation and stands on the case's site). Step 2 keeps only cases with a
 * site and a failure mode, and re-reads the asset to prove again that it is the organisation's and on the
 * case's site — a case that claims an asset which cannot be proven is dropped, never counted.
 */
export async function loadEligibleCases(
  db: Db,
  organizationId: string,
  siteIds: readonly string[],
  opts: { failureModeIds?: readonly string[]; caseIds?: ReadonlySet<string> } = {},
): Promise<EligibleCase[]> {
  const sites = Array.from(new Set(siteIds.filter(isId)));
  if (!isId(organizationId) || sites.length === 0) return [];
  if (opts.failureModeIds !== undefined && opts.failureModeIds.length === 0) return [];
  if (opts.caseIds !== undefined && opts.caseIds.size === 0) return [];

  // organizationLevelAccess is ALWAYS false here: a case with neither site nor asset is never site evidence.
  const scope = createGraphViewerScope(organizationId, sites, false);
  const visible = await listVisibleCaseIds(db, scope, { failureModeIds: opts.failureModeIds, limit: MAX_VISIBLE_CASE_IDS });
  const wanted = opts.caseIds ? visible.filter((id) => opts.caseIds!.has(id)) : visible;
  if (wanted.length === 0) return [];

  const caseModel = db.industrialEngineeringCase as FindManyModel | undefined;
  const assetModel = db.industrialAsset as FindManyModel | undefined;
  if (!caseModel || !assetModel) throw new Error("MULTI_SITE_MODEL_UNAVAILABLE");

  const rows: Row[] = [];
  for (const ids of chunks(wanted)) {
    rows.push(...await caseModel.findMany({
      where:  { organizationId, id: { in: ids }, siteId: { in: sites }, failureModeId: { not: null } },
      select: { id: true, siteId: true, assetId: true, failureModeId: true },
    }));
  }

  const assetIds = Array.from(new Set(rows.map((r) => r.assetId).filter(isId)));
  const assets = new Map<string, { siteId: string | null; assetType: string | null }>();
  for (const ids of chunks(assetIds)) {
    for (const a of await assetModel.findMany({
      where:  { organizationId, id: { in: ids } },
      select: { id: true, siteId: true, assetType: true },
    })) {
      assets.set(String(a.id), { siteId: isId(a.siteId) ? a.siteId : null, assetType: isId(a.assetType) ? a.assetType : null });
    }
  }

  const out: EligibleCase[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const { id, siteId, failureModeId } = r;
    if (!isId(id) || !isId(siteId) || !isId(failureModeId) || seen.has(id)) continue;
    let assetId: string | null = null;
    let assetType: string | null = null;
    if (r.assetId !== null && r.assetId !== undefined) {
      if (!isId(r.assetId)) continue;                          // malformed claim
      const asset = assets.get(r.assetId);
      if (!asset || asset.siteId !== siteId) continue;         // missing, foreign (not in this org) or on another site
      assetId = r.assetId;
      assetType = asset.assetType;
    }
    seen.add(id);
    out.push({ id, siteId, assetId, failureModeId, assetType });
  }
  return out;
}

// ── Pattern assembly (pure) ──────────────────────────────────────────────────

export interface PatternBody {
  siteIds:            string[];
  siteCount:          number;
  caseCount:          number;
  affectedAssetTypes: string[];
  evidence:           { caseIds: string[]; bySite: Record<string, { caseIds: string[]; assetIds: string[] }> };
}

/** One failure mode's pattern from ITS eligible cases, or null when fewer than two sites contribute. */
export function assemblePattern(cases: readonly EligibleCase[]): PatternBody | null {
  const bySite = new Map<string, { caseIds: Set<string>; assetIds: Set<string> }>();
  const types = new Set<string>();
  const all = new Set<string>();
  for (const c of cases) {
    const site = bySite.get(c.siteId) ?? { caseIds: new Set<string>(), assetIds: new Set<string>() };
    site.caseIds.add(c.id);
    if (c.assetId) site.assetIds.add(c.assetId);
    bySite.set(c.siteId, site);
    all.add(c.id);
    if (c.assetType) types.add(c.assetType);
  }
  if (bySite.size < MIN_SITES_FOR_PATTERN) return null;
  const siteIds = [...bySite.keys()].sort();
  const bySiteObj: Record<string, { caseIds: string[]; assetIds: string[] }> = {};
  for (const sid of siteIds) {
    const s = bySite.get(sid)!;
    bySiteObj[sid] = { caseIds: [...s.caseIds].sort(), assetIds: [...s.assetIds].sort() };
  }
  return {
    siteIds,
    siteCount: siteIds.length,
    caseCount: all.size,
    affectedAssetTypes: [...types].sort(),
    evidence: { caseIds: [...all].sort(), bySite: bySiteObj },
  };
}

export function groupByFailureMode(cases: readonly EligibleCase[]): Map<string, EligibleCase[]> {
  const m = new Map<string, EligibleCase[]>();
  for (const c of cases) (m.get(c.failureModeId) ?? m.set(c.failureModeId, []).get(c.failureModeId)!).push(c);
  return m;
}

const byPatternOrder = (a: { siteCount: number; caseCount: number; failureModeName: string }, b: typeof a) =>
  b.siteCount - a.siteCount || b.caseCount - a.caseCount || a.failureModeName.localeCompare(b.failureModeName);

// ── Viewer-safe pattern projection ───────────────────────────────────────────

/** What a restricted or unrestricted viewer receives for one pattern. Every field is rebuilt from live records. */
export interface ViewerPattern extends PatternBody {
  id:              string;
  benchmarkId:     string;
  failureModeId:   string;
  failureModeName: string;
  severity:        string;
  computedAt:      string;
}

interface ParsedPattern {
  id: string; benchmarkId: string; failureModeId: string; failureModeName: string; severity: string; computedAt: string;
  candidates: Set<string>;
}

function parsePattern(r: Row): ParsedPattern | null {
  const evidence = r.evidence;
  const cited = evidence && typeof evidence === "object" ? (evidence as Row).caseIds : undefined;
  if (!isId(r.id) || !isId(r.benchmarkId) || !isId(r.failureModeId) || !Array.isArray(cited)) return null;
  const when = new Date(r.computedAt as string | number | Date);
  return {
    id: r.id, benchmarkId: r.benchmarkId, failureModeId: r.failureModeId,
    failureModeName: typeof r.failureModeName === "string" ? r.failureModeName : "",
    severity: typeof r.severity === "string" ? r.severity : "",
    computedAt: Number.isNaN(when.getTime()) ? "" : when.toISOString(),
    candidates: new Set(cited.filter(isId)),
  };
}

/**
 * The persisted pattern rows of a benchmark, projected for a viewer whose ACTIVE sites are `siteIds`.
 * A row contributes only the cases it cited that are STILL eligible for this viewer; a row that keeps fewer
 * than two viewer sites is dropped. Fails closed: a lookup error yields no patterns.
 */
export async function projectPersistedPatterns(
  db: Db,
  organizationId: string,
  siteIds: readonly string[],
  rows: readonly Row[],
): Promise<ViewerPattern[]> {
  const sites = Array.from(new Set(siteIds.filter(isId)));
  if (sites.length < MIN_SITES_FOR_PATTERN) return [];
  const parsed = rows.map(parsePattern).filter((p): p is ParsedPattern => p !== null);
  if (parsed.length === 0) return [];

  let eligible: EligibleCase[];
  try {
    const union = new Set<string>();
    for (const p of parsed) for (const id of p.candidates) union.add(id);
    eligible = await loadEligibleCases(db, organizationId, sites, {
      failureModeIds: Array.from(new Set(parsed.map((p) => p.failureModeId))),
      caseIds: union,
    });
  } catch (err) {
    logInfraFailure("database", "multi_site.project_patterns", err);
    return [];
  }
  const byMode = groupByFailureMode(eligible);

  const out: ViewerPattern[] = [];
  for (const p of parsed) {
    const own = (byMode.get(p.failureModeId) ?? []).filter((c) => p.candidates.has(c.id));
    const body = assemblePattern(own);
    if (!body) continue;
    out.push({
      id: p.id, benchmarkId: p.benchmarkId, failureModeId: p.failureModeId, failureModeName: p.failureModeName,
      severity: p.severity, computedAt: p.computedAt, ...body,
    });
  }
  return out.sort(byPatternOrder);
}

// ── Viewer-safe benchmark projection (pure) ──────────────────────────────────

export interface ViewerBenchmark {
  benchmark: {
    id: string; status: BenchmarkRecord["status"]; periodLabel: string; siteCount: number;
    summary: BenchmarkSummary; computedAt: string; stale: boolean; stalenessWarning: string | null;
  };
  riskRanking:     Row[];
  kpiComparison:   Row[];
  failurePatterns: ViewerPattern[];
}

const nullsLast = (a: number | null, b: number | null): number =>
  a === null && b === null ? 0 : a === null ? 1 : b === null ? -1 : b - a;

/**
 * The benchmark as the viewer may see it, or `null` when fewer than {@link MIN_SITES_FOR_COMPARISON} of the
 * viewer's sites have rows (not a meaningful cross-site comparison; and not distinguishable from "no data").
 *
 * Rows of every other site are dropped; rankings and the summary are recomputed from what is left with the
 * same semantics `comparison.ts` used. Nothing from the stored organisation-wide summary survives, and the
 * internal-generation fields (`errorMessage`, `startedAt`, `completedAt`) are not part of the response.
 */
export function projectBenchmark(
  bm: BenchmarkRecord,
  riskRows: readonly Row[],
  kpiRows: readonly Row[],
  patterns: readonly ViewerPattern[],
  siteIds: readonly string[],
): ViewerBenchmark | null {
  const allowed = new Set(siteIds.filter(isId));
  const risk = riskRows.filter((r) => allowed.has(String(r.siteId)));
  const kpi = kpiRows.filter((r) => allowed.has(String(r.siteId)));
  const visibleSites = new Set([...risk, ...kpi].map((r) => String(r.siteId)));
  if (visibleSites.size < MIN_SITES_FOR_COMPARISON) return null;

  const riskRanking = [...risk].sort((a, b) =>
    nullsLast(num(a.avgRiskScore), num(b.avgRiskScore)) || String(a.siteName).localeCompare(String(b.siteName)) || String(a.siteId).localeCompare(String(b.siteId)));
  const kpiComparison = [...kpi].sort((a, b) =>
    nullsLast(num(a.avgAvailability), num(b.avgAvailability)) || String(a.siteName).localeCompare(String(b.siteName)) || String(a.siteId).localeCompare(String(b.siteId)));

  const qualifiedRisk = riskRanking.filter((r) => r.dataStatus !== "insufficientData" && num(r.avgRiskScore) !== null);
  const qualifiedKpi = kpiComparison.filter((r) => r.dataStatus !== "insufficientData");
  const byAvail = qualifiedKpi.filter((r) => num(r.avgAvailability) !== null);
  const byHealth = [...qualifiedKpi].filter((r) => num(r.avgHealthScore) !== null)
    .sort((a, b) => nullsLast(num(a.avgHealthScore), num(b.avgHealthScore)));
  const idOf = (r: Row | undefined): string | null => (r ? String(r.siteId) : null);

  const summary: BenchmarkSummary = {
    topSiteByAvailability:     idOf(byAvail[0]),
    bottomSiteByAvailability:  idOf(byAvail[byAvail.length - 1]),
    topSiteByHealth:           idOf(byHealth[0]),
    bottomSiteByRisk:          idOf(qualifiedRisk[qualifiedRisk.length - 1]),
    highestRiskSiteId:         idOf(qualifiedRisk[0]),
    patternCount:              patterns.length,
    sitesWithInsufficientData: risk.filter((r) => r.dataStatus === "insufficientData").length,
    sitesWithStaleData:        risk.filter((r) => r.dataStatus === "stale").length,
  };

  return {
    benchmark: {
      id: bm.id, status: bm.status, periodLabel: bm.periodLabel, siteCount: visibleSites.size,
      summary, computedAt: bm.computedAt, stale: bm.stale, stalenessWarning: bm.stalenessWarning,
    },
    riskRanking,
    kpiComparison,
    failurePatterns: [...patterns],
  };
}
