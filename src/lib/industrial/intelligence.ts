/**
 * Phase 48 — Asset Intelligence aggregation layer.
 *
 * Queries AssetRiskScore, AssetHealthHistory, AssetKnowledgeLink, AssetTag,
 * and DigitalTwinNode to produce a unified intelligence summary per asset.
 *
 * All paths are read-only. No write-backs, no commands, no autonomous actions.
 * Returns null / empty collections when the database is unavailable or when
 * there is insufficient recorded history — never fabricates data.
 */

import { getPrisma } from "@/lib/db/prisma";

// ── Types ──────────────────────────────────────────────────────────────────────

export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type HealthTrend = "improving" | "degrading" | "stable" | "unknown";

export interface HealthPoint {
  date:   string;
  score:  number;
  status: string;
}

export interface KnowledgeCoverage {
  articles:    number;
  failureModes: number;
  procedures:  number;
  cases:       number;
  total:       number;
}

export interface RiskBreakdown {
  healthTrendScore:    number;
  alarmTrendScore:     number;
  kpiDegradationScore: number;
  telQualityScore:     number;
  telFreshnessScore:   number;
  criticalityFactor:   number;
}

export interface AssetIntelligence {
  assetId:          string;
  riskScore:        number | null;
  riskLevel:        RiskLevel;
  riskConfidence:   string | null;
  riskBreakdown:    RiskBreakdown | null;
  healthScore:      number | null;
  healthStatus:     string;
  healthTrend:      HealthTrend;
  recentHealth:     HealthPoint[];
  knowledgeCoverage: KnowledgeCoverage;
  tagCount:         number;
  twinNodeId:       string | null;
  computedAt:       string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function scoreToLevel(score: number): RiskLevel {
  if (score >= 76) return "CRITICAL";
  if (score >= 51) return "HIGH";
  if (score >= 26) return "MEDIUM";
  return "LOW";
}

function deriveHealthTrend(history: HealthPoint[]): HealthTrend {
  if (history.length < 2) return "unknown";
  const recent = history.slice(0, 3).map((h) => h.score);
  const older  = history.slice(-3).map((h) => h.score);
  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
  const avgOlder  = older.reduce((a, b)  => a + b, 0) / older.length;
  const delta = avgRecent - avgOlder;
  if (delta > 3)  return "improving";
  if (delta < -3) return "degrading";
  return "stable";
}

// ── Prisma model accessors (dynamic cast, same pattern as assets.ts) ──────────

type RiskScoreRow = {
  id:                  string;
  riskScore:           number;
  confidence:          string;
  healthTrendScore:    number;
  alarmTrendScore:     number;
  kpiDegradationScore: number;
  telQualityScore:     number;
  telFreshnessScore:   number;
  criticalityFactor:   number;
  createdAt:           Date | string;
};

type HealthHistoryRow = {
  healthScore:  number;
  healthStatus: string;
  createdAt:    Date | string;
};

type KnowledgeLinkRow = {
  articleId:    string | null;
  failureModeId: string | null;
  procedureId:  string | null;
  caseId:       string | null;
};

type AssetTagRow = { id: string };

type TwinNodeRow = { id: string };

type FindManyModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
type FindFirstModel = { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };

// ── Public API ─────────────────────────────────────────────────────────────────

export async function getAssetIntelligence(
  assetId:        string,
  organizationId: string
): Promise<AssetIntelligence | null> {
  const db = await getPrisma();
  if (!db) return null;

  const r = db as Record<string, unknown>;

  // Latest risk score
  const riskRow = (await (r.assetRiskScore as FindManyModel).findMany({
    where:   { assetId, organizationId },
    orderBy: { createdAt: "desc" },
    take:    1,
  }))[0] as RiskScoreRow | undefined;

  // Health history (last 14 entries, newest first)
  const healthRows = (await (r.assetHealthHistory as FindManyModel).findMany({
    where:   { assetId, organizationId },
    orderBy: { createdAt: "desc" },
    take:    14,
  })) as HealthHistoryRow[];

  // Knowledge links
  const linkRows = (await (r.assetKnowledgeLink as FindManyModel).findMany({
    where:  { assetId, organizationId },
    select: { articleId: true, failureModeId: true, procedureId: true, caseId: true },
  })) as KnowledgeLinkRow[];

  // Asset tags (count only)
  const tagRows = (await (r.assetTag as FindManyModel).findMany({
    where:  { assetId, organizationId },
    select: { id: true },
  })) as AssetTagRow[];

  // Digital twin node
  const twinNode = (await (r.digitalTwinNode as FindFirstModel).findFirst({
    where:  { assetId, organizationId },
    select: { id: true },
  })) as TwinNodeRow | null;

  // Derive values
  const recentHealth: HealthPoint[] = healthRows.map((h) => ({
    date:   new Date(h.createdAt as string).toISOString(),
    score:  h.healthScore,
    status: h.healthStatus,
  }));

  const latest = recentHealth[0];
  const healthTrend = deriveHealthTrend(recentHealth);

  const coverage: KnowledgeCoverage = {
    articles:    linkRows.filter((l) => l.articleId     !== null).length,
    failureModes: linkRows.filter((l) => l.failureModeId !== null).length,
    procedures:  linkRows.filter((l) => l.procedureId   !== null).length,
    cases:       linkRows.filter((l) => l.caseId        !== null).length,
    total:       linkRows.length,
  };

  return {
    assetId,
    riskScore:        riskRow?.riskScore ?? null,
    riskLevel:        riskRow ? scoreToLevel(riskRow.riskScore) : "UNKNOWN",
    riskConfidence:   riskRow?.confidence ?? null,
    riskBreakdown:    riskRow ? {
      healthTrendScore:    riskRow.healthTrendScore,
      alarmTrendScore:     riskRow.alarmTrendScore,
      kpiDegradationScore: riskRow.kpiDegradationScore,
      telQualityScore:     riskRow.telQualityScore,
      telFreshnessScore:   riskRow.telFreshnessScore,
      criticalityFactor:   riskRow.criticalityFactor,
    } : null,
    healthScore:   latest?.score  ?? null,
    healthStatus:  latest?.status ?? "unknown",
    healthTrend,
    recentHealth,
    knowledgeCoverage: coverage,
    tagCount:      tagRows.length,
    twinNodeId:    twinNode?.id ?? null,
    computedAt:    new Date().toISOString(),
  };
}

// ── Org-level asset analytics ─────────────────────────────────────────────────

export interface AssetTypeCount    { type: string; count: number }
export interface AssetStatusCount  { status: string; count: number }

export interface AssetAnalytics {
  totalAssets:    number;
  byType:         AssetTypeCount[];
  byStatus:       AssetStatusCount[];
  withRiskScore:  number;
  withHealthData: number;
  avgRiskScore:   number | null;
}

export async function getAssetAnalytics(
  organizationId: string,
  siteId?: string
): Promise<AssetAnalytics> {
  const db = await getPrisma();
  if (!db) {
    return { totalAssets: 0, byType: [], byStatus: [], withRiskScore: 0, withHealthData: 0, avgRiskScore: null };
  }

  const r = db as Record<string, unknown>;

  const where: Record<string, unknown> = { organizationId };
  if (siteId) where.siteId = siteId;

  const [assets, riskScores, healthEntries] = await Promise.all([
    (r.industrialAsset as FindManyModel).findMany({
      where,
      select: { id: true, assetType: true, status: true },
    }) as Promise<Record<string, unknown>[]>,

    (r.assetRiskScore as FindManyModel).findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: { assetId: true, riskScore: true },
    }) as Promise<Record<string, unknown>[]>,

    (r.assetHealthHistory as FindManyModel).findMany({
      where,
      select: { assetId: true },
      orderBy: { createdAt: "desc" },
    }) as Promise<Record<string, unknown>[]>,
  ]);

  // Type distribution
  const typeCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  for (const a of assets) {
    const t = (a.assetType as string) ?? "OTHER";
    const s = (a.status    as string) ?? "UNKNOWN";
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    statusCounts.set(s, (statusCounts.get(s) ?? 0) + 1);
  }

  // Latest risk score per asset (de-dup by assetId)
  const seenAssets = new Set<string>();
  let riskSum = 0;
  let riskCount = 0;
  for (const rs of riskScores) {
    const aid = rs.assetId as string;
    if (!seenAssets.has(aid)) {
      seenAssets.add(aid);
      riskSum   += (rs.riskScore as number) ?? 0;
      riskCount += 1;
    }
  }

  const assetsWithHealth = new Set((healthEntries).map((h) => h.assetId as string));

  return {
    totalAssets:    assets.length,
    byType:         [...typeCounts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    byStatus:       [...statusCounts.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
    withRiskScore:  riskCount,
    withHealthData: assetsWithHealth.size,
    avgRiskScore:   riskCount > 0 ? Math.round(riskSum / riskCount) : null,
  };
}
