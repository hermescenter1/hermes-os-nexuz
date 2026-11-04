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
 *
 * SCOPE (slice D1, MS-04). Coverage is computed for a server-built viewer scope only: sites outside
 * `scope.allowedSiteIds` (the viewer's readable ACTIVE sites) and their assets contribute nothing, and a
 * CASE link counts only if the case itself is visible to the viewer under the canonical engineering-case
 * policy (knowledge/case-visibility.ts) — a hidden, foreign-asset, site/asset-inconsistent or (for a
 * site-limited viewer) organisation-level case adds nothing to any count, ratio or score. Catalogue links
 * (article, failure mode, procedure) are organisation-level knowledge attached to a visible asset.
 */

import { getPrisma } from "@/lib/db/prisma";
import { listVisibleCaseIds, MAX_VISIBLE_CASE_IDS } from "@/lib/knowledge/case-visibility";
import type { GraphViewerScope } from "@/lib/knowledge-graph/visibility";
import type { SiteKnowledgeCoverageData } from "./types";

type LinkModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

export async function getSiteKnowledgeCoverage(
  scope:        GraphViewerScope,
  siteMap:      Map<string, string>,
  siteAssetMap: Map<string, string[]>,
): Promise<SiteKnowledgeCoverageData[]> {
  const orgId = scope.organizationId;
  // Defence in depth: whatever the caller built, only the scope's sites are reported.
  const allowed = new Set(scope.allowedSiteIds);
  siteMap = new Map([...siteMap].filter(([siteId]) => allowed.has(siteId)));
  siteAssetMap = new Map([...siteAssetMap].filter(([siteId]) => allowed.has(siteId)));
  if (siteMap.size === 0) return [];

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

  // Load the AssetKnowledgeLink rows of the scope's assets, and the cases the viewer may read.
  const [linkRows, visibleCaseIds] = await Promise.all([
    (db.assetKnowledgeLink as unknown as LinkModel).findMany({
      where:  { organizationId: orgId, assetId: { in: allAssetIds } },
      select: { assetId: true, articleId: true, failureModeId: true, procedureId: true, caseId: true },
    }),
    listVisibleCaseIds(db, scope, { limit: MAX_VISIBLE_CASE_IDS }).then((ids) => new Set(ids)),
  ]);
  const scopedAssets = new Set(allAssetIds);

  // Per-asset link counts
  type LinkCounts = { article: number; failureMode: number; procedure: number; case: number };
  const assetLinkMap = new Map<string, LinkCounts>();
  for (const link of linkRows) {
    const aid = link.assetId as string;
    if (!scopedAssets.has(aid)) continue;
    // A case link counts only when the case is visible to this viewer; otherwise the link is dropped
    // entirely (it must not make the asset look "covered").
    const caseId = typeof link.caseId === "string" && link.caseId.length > 0 ? link.caseId : null;
    const caseVisible = caseId !== null && visibleCaseIds.has(caseId);
    if (!link.articleId && !link.failureModeId && !link.procedureId && !caseVisible) continue;
    if (!assetLinkMap.has(aid)) {
      assetLinkMap.set(aid, { article: 0, failureMode: 0, procedure: 0, case: 0 });
    }
    const c = assetLinkMap.get(aid)!;
    if (link.articleId)     c.article++;
    if (link.failureModeId) c.failureMode++;
    if (link.procedureId)   c.procedure++;
    if (caseVisible)        c.case++;
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

  // Sort by coverageScore DESC, then name and id (deterministic)
  results.sort((a, b) => b.coverageScore - a.coverageScore || a.siteName.localeCompare(b.siteName) || a.siteId.localeCompare(b.siteId));
  return results;
}
