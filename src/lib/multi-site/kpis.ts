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

import type { PrismaClient } from "@prisma/client";
import { getPrisma }  from "@/lib/db/prisma";
import { getPeriodRange } from "@/lib/time-series/periods";
import {
  MIN_ASSETS_WITH_DATA,
  KPI_PERIOD,
  HEALTH_DATA_MAX_STALE_HOURS,
  type SiteKPIData,
  type SiteDataStatus,
} from "./types";

/**
 * The client surface this module reads. Both reads are parameterised `$queryRaw` statements that select
 * the LATEST row per key with `DISTINCT ON` (slice D2 for health, independent review S2-02 for KPIs):
 * Prisma's own `distinct` de-duplicates in application memory unless the nativeDistinct preview feature
 * is enabled, so it cannot bound the read. The delegate name `kPIRecord` that slice D1 pinned (MS-01) is
 * no longer used here; the raw statements name the TABLE. `getPrisma()` is untyped repository-wide, so
 * this narrowing keeps `$queryRaw`'s argument and row shapes checked at compile time.
 */
type KpiClient = Pick<PrismaClient, "$queryRaw">;

interface LatestHealthRow { assetId: string; healthScore: number; createdAt: Date }
interface LatestKpiRow { assetId: string; kpiName: string; value: number; calculatedAt: Date }

/** The KPI names the comparison uses. Fixed server side; never taken from a request. */
const COMPARED_KPI_NAMES = ["availability", "efficiency"] as const;

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
  const client = prisma as unknown as KpiClient;

  const period = KPI_PERIOD;
  const range  = getPeriodRange(period);
  const allAssetIds = [...siteAssetMap.values()].flat();

  if (allAssetIds.length === 0) return [];

  // The LATEST KPIRecord per (compared asset, KPI name) inside the period, chosen IN THE DATABASE with
  // DISTINCT ON — newest calculatedAt first, id ASC on a tie. Independent review S2-02: this used to read
  // every KPI row of the period and keep the first per key in memory, so a long history materialised in
  // full. At most |compared assets| × |COMPARED_KPI_NAMES| rows are returned, however deep the history.
  const kpiRows = await client.$queryRaw<LatestKpiRow[]>`
    SELECT DISTINCT ON (k."assetId", k."kpiName")
           k."assetId"      AS "assetId",
           k."kpiName"      AS "kpiName",
           k."value"        AS "value",
           k."calculatedAt" AS "calculatedAt"
    FROM "KPIRecord" k
    WHERE k."organizationId" = ${orgId}
      AND k."assetId" = ANY(${allAssetIds}::text[])
      AND k."kpiName" = ANY(${[...COMPARED_KPI_NAMES]}::text[])
      AND k."calculatedAt" >= ${range.from}
      AND k."calculatedAt" <= ${range.to}
    ORDER BY k."assetId" ASC, k."kpiName" ASC, k."calculatedAt" DESC, k."id" ASC
  `;

  // The latest AssetHealthHistory row per compared asset (no period filter — just latest), chosen IN THE
  // DATABASE with DISTINCT ON (newest createdAt, id ASC on a tie): at most one row per compared asset.
  // Slice D2: D1 used Prisma's `distinct`, which — without the nativeDistinct preview feature — reads
  // every matching history row and de-duplicates in memory, so the history was still fully materialised.
  const healthRows = await client.$queryRaw<LatestHealthRow[]>`
    SELECT DISTINCT ON (h."assetId")
           h."assetId"     AS "assetId",
           h."healthScore" AS "healthScore",
           h."createdAt"   AS "createdAt"
    FROM "AssetHealthHistory" h
    WHERE h."organizationId" = ${orgId}
      AND h."assetId" = ANY(${allAssetIds}::text[])
    ORDER BY h."assetId" ASC, h."createdAt" DESC, h."id" ASC
  `;

  // assetId → kpiName → value. The query already returns exactly one row per (asset, KPI name), so this
  // is a regrouping, not a de-duplication; the first-wins guard is kept as a harmless invariant check.
  const kpiLatest = new Map<string, Map<string, number>>();
  for (const row of kpiRows) {
    const aid = row.assetId;
    if (!aid) continue;
    const kn  = row.kpiName;
    if (!kpiLatest.has(aid)) kpiLatest.set(aid, new Map());
    if (!kpiLatest.get(aid)!.has(kn)) kpiLatest.get(aid)!.set(kn, Number(row.value));
  }

  // Health: latest per asset
  const healthLatest = new Map<string, { score: number; at: Date }>();
  for (const row of healthRows) {
    const aid = row.assetId;
    if (!healthLatest.has(aid)) {
      healthLatest.set(aid, { score: row.healthScore, at: new Date(row.createdAt) });
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
