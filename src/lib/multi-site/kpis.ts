/**
 * Multi-Site KPI Comparison — Phase 42.
 *
 * compareSiteKPIs() aggregates pre-computed KPIRecord + AssetHealthHistory
 * rows per site. Does NOT call the KPI calculation engine (Phase 37) — reads
 * only already-computed rows. Produces mean rates across qualifying assets.
 *
 * NORMALIZATION:
 *   availability + efficiency: already 0–100 percent rates → mean is comparable.
 *   healthScore: 0–100 from AssetHealthHistory → mean is comparable.
 *   runtime/downtime: raw counts → NOT included here (not rate-normalized).
 *
 * DATA-SUFFICIENCY:
 *   A site with 0 qualifying assets → dataStatus="insufficientData", nulls.
 *   Qualifying asset: has at least one KPIRecord in the period.
 *   Assets without data are counted but NOT zeroed into the mean.
 */

import { getPrisma }  from "@/lib/db/prisma";
import { getPeriodRange } from "@/lib/time-series/periods";
import {
  MIN_ASSETS_WITH_DATA,
  KPI_PERIOD,
  HEALTH_DATA_MAX_STALE_HOURS,
  type SiteKPIData,
  type SiteDataStatus,
} from "./types";

type KPIModel  = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
type HHModel   = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
type AssetModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

function staleStatus(lastTs: Date | null): SiteDataStatus {
  if (!lastTs) return "insufficientData";
  const hoursOld = (Date.now() - lastTs.getTime()) / 3_600_000;
  return hoursOld > HEALTH_DATA_MAX_STALE_HOURS ? "stale" : "ok";
}

/**
 * Compute site-level KPI means across qualifying assets.
 * siteMap: { siteId → siteName }, siteAssetMap: { siteId → assetId[] }
 */
export async function compareSiteKPIs(
  orgId:        string,
  siteMap:      Map<string, string>,
  siteAssetMap: Map<string, string[]>,
): Promise<SiteKPIData[]> {
  const prisma = await getPrisma();
  if (!prisma) return [];
  const db = prisma as unknown as Record<string, unknown>;

  const period = KPI_PERIOD;
  const range  = getPeriodRange(period);
  const allAssetIds = [...siteAssetMap.values()].flat();

  if (allAssetIds.length === 0) return [];

  // Load all KPIRecord rows for the org in the period (availability + efficiency)
  const kpiRows = await (db.kpiRecord as unknown as KPIModel).findMany({
    where: {
      organizationId: orgId,
      kpiName:        { in: ["availability", "efficiency"] },
      calculatedAt:   { gte: range.from, lte: range.to },
    },
    orderBy: { calculatedAt: "desc" },
    select: { assetId: true, kpiName: true, value: true, calculatedAt: true },
  });

  // Load latest AssetHealthHistory per asset (no period filter — just latest)
  const healthRows = await (db.assetHealthHistory as unknown as HHModel).findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    select: { assetId: true, healthScore: true, createdAt: true },
  });

  // Build in-memory maps: assetId → latest value per kpiName
  const kpiLatest = new Map<string, Map<string, number>>();    // assetId → kpiName → value
  for (const row of kpiRows) {
    const aid = row.assetId as string;
    const kn  = row.kpiName  as string;
    if (!kpiLatest.has(aid)) kpiLatest.set(aid, new Map());
    if (!kpiLatest.get(aid)!.has(kn)) kpiLatest.get(aid)!.set(kn, row.value as number);
  }

  // Health: latest per asset
  const healthLatest = new Map<string, { score: number; at: Date }>();
  for (const row of healthRows) {
    const aid = row.assetId as string;
    if (!healthLatest.has(aid)) {
      healthLatest.set(aid, { score: row.healthScore as number, at: new Date(row.createdAt as string) });
    }
  }

  const results: SiteKPIData[] = [];

  for (const [siteId, siteName] of siteMap) {
    const assetIds = siteAssetMap.get(siteId) ?? [];
    const assetCount = assetIds.length;

    // Collect per-asset values
    const avails:  number[] = [];
    const effs:    number[] = [];
    const healths: number[] = [];
    let lastTs: Date | null = null;
    let assetsWithKpiData = 0;

    for (const aid of assetIds) {
      const kpis   = kpiLatest.get(aid);
      const health = healthLatest.get(aid);
      let hasData  = false;

      if (kpis?.has("availability")) { avails.push(kpis.get("availability")!); hasData = true; }
      if (kpis?.has("efficiency"))   { effs.push(kpis.get("efficiency")!);   hasData = true; }
      if (health) {
        healths.push(health.score);
        if (!lastTs || health.at > lastTs) lastTs = health.at;
        hasData = true;
      }
      if (hasData) assetsWithKpiData++;
    }

    const mean = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    const dataStatus: SiteDataStatus = assetsWithKpiData < MIN_ASSETS_WITH_DATA
      ? "insufficientData"
      : staleStatus(lastTs);

    results.push({
      siteId,
      siteName,
      periodLabel:       period,
      avgAvailability:   dataStatus === "insufficientData" ? null : mean(avails),
      avgEfficiency:     dataStatus === "insufficientData" ? null : mean(effs),
      avgHealthScore:    dataStatus === "insufficientData" ? null : mean(healths),
      assetCount,
      assetsWithKpiData,
      dataStatus,
      lastDataTimestamp: lastTs?.toISOString() ?? null,
    });
  }

  return results;
}
