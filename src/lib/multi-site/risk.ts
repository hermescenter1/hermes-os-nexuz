/**
 * Multi-Site Risk Ranking — Phase 42.
 *
 * rankSitesByRisk() aggregates pre-computed AssetRiskScore rows per site.
 * Does NOT call calculateRiskScore() (Phase 39) — reads already-computed rows.
 *
 * NORMALIZATION:
 *   riskScore is 0–100 normalized per asset (Phase 39). Mean across assets is
 *   directly comparable across sites of different sizes.
 *   avgRiskScore = arithmetic mean of qualifying assets' latest riskScore.
 *   maxRiskScore = worst single asset (for operational awareness, not ranking).
 *
 * DATA-SUFFICIENCY:
 *   dataStatus="insufficientData" if 0 assets have risk scores within 48h.
 *   dataStatus="stale" if latest score is 48–96h old → confidence="LOW".
 *   dataStatus="ok" → at least 1 asset with score within 48h.
 *   insufficientData sites are included in results but EXCLUDED from ranking.
 *
 * CONFIDENCE:
 *   HIGH: assetsWithData / assetCount >= 0.75 AND not stale.
 *   MEDIUM: assetsWithData / assetCount >= 0.40 OR stale.
 *   LOW: assetsWithData / assetCount < 0.40 OR no data.
 */

import { getPrisma } from "@/lib/db/prisma";
import {
  MIN_ASSETS_WITH_DATA,
  RISK_DATA_MAX_STALE_HOURS,
  type SiteRiskData,
  type SiteDataStatus,
  type MultiSiteConfidence,
} from "./types";

type RawQuery = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

interface LatestRisk { score: number; at: Date; confidence: string }

/**
 * The authoritative risk record of each compared asset: its LATEST AssetRiskScore, chosen IN THE
 * DATABASE with `DISTINCT ON ("assetId")` — newest `createdAt` first, `id` ASC breaking a tie — so at
 * most ONE row per compared asset is read (served by the (organizationId, assetId, createdAt) index).
 *
 * Slice D2: this used to read the organisation's ENTIRE risk history, every asset and every age, and
 * discard all but the first row per asset in memory, with no tie-break. The selected row is the same
 * (the latest, whatever its age — staleness is judged per site afterwards); only rows of the
 * organisation's compared assets are read. Prisma's `distinct` is NOT used: without the nativeDistinct
 * preview feature it fetches every matching row and de-duplicates in memory.
 */
async function loadLatestRiskPerAsset(
  db:       Record<string, unknown>,
  orgId:    string,
  assetIds: readonly string[],
): Promise<Map<string, LatestRisk>> {
  const latest = new Map<string, LatestRisk>();
  const ids = [...new Set(assetIds)];
  if (ids.length === 0) return latest;
  const raw = (db as { $queryRaw?: RawQuery }).$queryRaw;
  if (typeof raw !== "function") throw new Error("RISK_QUERY_UNAVAILABLE");
  const rows = await (db as { $queryRaw: RawQuery }).$queryRaw`
    SELECT DISTINCT ON (r."assetId")
           r."assetId"          AS "assetId",
           r."riskScore"        AS "riskScore",
           r."confidence"::text AS "confidence",
           r."createdAt"        AS "createdAt"
    FROM "AssetRiskScore" r
    WHERE r."organizationId" = ${orgId}
      AND r."assetId" = ANY(${ids}::text[])
    ORDER BY r."assetId" ASC, r."createdAt" DESC, r."id" ASC
  `;
  for (const row of rows) {
    latest.set(String(row.assetId), {
      score:      Number(row.riskScore),
      at:         new Date(row.createdAt as string),
      confidence: String(row.confidence),
    });
  }
  return latest;
}

function deriveConfidence(
  assetsWithData: number,
  assetCount:     number,
  isStale:        boolean,
): MultiSiteConfidence {
  if (assetCount === 0 || assetsWithData === 0) return "LOW";
  const ratio = assetsWithData / assetCount;
  if (!isStale && ratio >= 0.75) return "HIGH";
  if (ratio >= 0.40) return "MEDIUM";
  return "LOW";
}

export async function rankSitesByRisk(
  orgId:        string,
  siteMap:      Map<string, string>,
  siteAssetMap: Map<string, string[]>,
): Promise<SiteRiskData[]> {
  const prisma = await getPrisma();
  if (!prisma) return [];
  const db = prisma as unknown as Record<string, unknown>;

  const cutoff48h = new Date(Date.now() - RISK_DATA_MAX_STALE_HOURS * 3_600_000);

  // The latest AssetRiskScore of each compared asset — one row per asset, selected in the database.
  const latestRisk = await loadLatestRiskPerAsset(db, orgId, [...siteAssetMap.values()].flat());

  const results: SiteRiskData[] = [];

  for (const [siteId, siteName] of siteMap) {
    const assetIds   = siteAssetMap.get(siteId) ?? [];
    const assetCount = assetIds.length;

    const scores:     number[] = [];
    let   lastTs: Date | null  = null;
    let   assetsWithData       = 0;
    const dist: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };

    for (const aid of assetIds) {
      const r = latestRisk.get(aid);
      if (!r) continue;
      // Only count as "with data" if within 48h
      if (r.at >= cutoff48h) {
        scores.push(r.score);
        assetsWithData++;
        const level = r.score >= 60 ? "HIGH" : r.score >= 30 ? "MEDIUM" : "LOW";
        dist[level] = (dist[level] ?? 0) + 1;
      }
      if (!lastTs || r.at > lastTs) lastTs = r.at;
    }

    const mean = (arr: number[]) => arr.length > 0
      ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10
      : null;

    const isStale   = lastTs ? lastTs < cutoff48h : true;
    const dataStatus: SiteDataStatus =
      assetsWithData < MIN_ASSETS_WITH_DATA
        ? "insufficientData"
        : isStale ? "stale" : "ok";

    const sortedScores = [...scores].sort((a, b) => a - b);

    results.push({
      siteId,
      siteName,
      assetCount,
      assetsWithData,
      avgRiskScore:      dataStatus === "insufficientData" ? null : mean(scores),
      maxRiskScore:      dataStatus === "insufficientData" ? null : (sortedScores[sortedScores.length - 1] ?? null),
      minRiskScore:      dataStatus === "insufficientData" ? null : (sortedScores[0] ?? null),
      riskDistribution:  dist,
      dataStatus,
      confidence:        deriveConfidence(assetsWithData, assetCount, isStale),
      lastDataTimestamp: lastTs?.toISOString() ?? null,
    });
  }

  // Sort: highest avgRiskScore first (most dangerous site first in ranking)
  // insufficientData sites go to the end
  results.sort((a, b) => {
    if (a.dataStatus === "insufficientData" && b.dataStatus !== "insufficientData") return 1;
    if (b.dataStatus === "insufficientData" && a.dataStatus !== "insufficientData") return -1;
    return (b.avgRiskScore ?? -1) - (a.avgRiskScore ?? -1);
  });

  return results;
}
