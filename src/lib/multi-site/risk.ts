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

type RiskModel  = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

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

  // Load latest AssetRiskScore per org (all assets, all ages — we filter per asset)
  const riskRows = await (db.assetRiskScore as unknown as RiskModel).findMany({
    where:   { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    select:  { assetId: true, riskScore: true, confidence: true, createdAt: true },
  });

  // Latest per assetId
  const latestRisk = new Map<string, { score: number; at: Date; confidence: string }>();
  for (const row of riskRows) {
    const aid = row.assetId as string;
    if (!latestRisk.has(aid)) {
      latestRisk.set(aid, {
        score:      row.riskScore  as number,
        at:         new Date(row.createdAt as string),
        confidence: row.confidence as string,
      });
    }
  }

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
