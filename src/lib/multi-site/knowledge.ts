/**
 * Site Knowledge Coverage — Phase 42.
 *
 * getSiteKnowledgeCoverage() reads AssetKnowledgeLink rows to compute, per site,
 * what fraction of assets have at least one knowledge link (article, failure mode,
 * procedure, or engineering case). Does NOT call Phase 40 CRUD services.
 *
 * coverageScore = (assetsWithLinks / assetCount) × 100, clamped 0–100.
 * A site with 0 assets gets coverageScore = 0, assetsWithLinks = 0.
 * Link counts are totals per type — one asset can contribute to multiple buckets.
 */

import { getPrisma } from "@/lib/db/prisma";
import type { SiteKnowledgeCoverageData } from "./types";

type LinkModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

export async function getSiteKnowledgeCoverage(
  orgId:        string,
  siteMap:      Map<string, string>,
  siteAssetMap: Map<string, string[]>,
): Promise<SiteKnowledgeCoverageData[]> {
  const prisma = await getPrisma();
  if (!prisma) return [];
  const db = prisma as unknown as Record<string, unknown>;

  const allAssetIds = [...siteAssetMap.values()].flat();
  if (allAssetIds.length === 0) {
    return [...siteMap.entries()].map(([siteId, siteName]) => ({
      siteId, siteName,
      assetCount: 0, assetsWithLinks: 0,
      totalArticleLinks: 0, totalFailureModeLinks: 0,
      totalProcedureLinks: 0, totalCaseLinks: 0,
      coverageScore: 0,
    }));
  }

  // Load all AssetKnowledgeLink rows for assets in this org
  const linkRows = await (db.assetKnowledgeLink as unknown as LinkModel).findMany({
    where:  { organizationId: orgId, assetId: { in: allAssetIds } },
    select: { assetId: true, articleId: true, failureModeId: true, procedureId: true, caseId: true },
  });

  // Per-asset link counts
  type LinkCounts = { article: number; failureMode: number; procedure: number; case: number };
  const assetLinkMap = new Map<string, LinkCounts>();
  for (const link of linkRows) {
    const aid = link.assetId as string;
    if (!assetLinkMap.has(aid)) {
      assetLinkMap.set(aid, { article: 0, failureMode: 0, procedure: 0, case: 0 });
    }
    const c = assetLinkMap.get(aid)!;
    if (link.articleId)     c.article++;
    if (link.failureModeId) c.failureMode++;
    if (link.procedureId)   c.procedure++;
    if (link.caseId)        c.case++;
  }

  const results: SiteKnowledgeCoverageData[] = [];

  for (const [siteId, siteName] of siteMap) {
    const assetIds   = siteAssetMap.get(siteId) ?? [];
    const assetCount = assetIds.length;

    let assetsWithLinks      = 0;
    let totalArticleLinks    = 0;
    let totalFailureModeLinks = 0;
    let totalProcedureLinks  = 0;
    let totalCaseLinks       = 0;

    for (const aid of assetIds) {
      const c = assetLinkMap.get(aid);
      if (!c) continue;
      const hasAny = c.article + c.failureMode + c.procedure + c.case > 0;
      if (hasAny) assetsWithLinks++;
      totalArticleLinks    += c.article;
      totalFailureModeLinks += c.failureMode;
      totalProcedureLinks  += c.procedure;
      totalCaseLinks       += c.case;
    }

    const coverageScore = assetCount > 0
      ? Math.round((assetsWithLinks / assetCount) * 100)
      : 0;

    results.push({
      siteId, siteName, assetCount, assetsWithLinks,
      totalArticleLinks, totalFailureModeLinks, totalProcedureLinks, totalCaseLinks,
      coverageScore,
    });
  }

  // Sort by coverageScore DESC
  results.sort((a, b) => b.coverageScore - a.coverageScore);
  return results;
}
