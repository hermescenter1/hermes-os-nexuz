/**
 * Cross-Site Failure Pattern Detection — Phase 42.
 *
 * MATCHING CRITERION (deterministic, documented):
 *   A CrossSiteFailurePattern is identified when the same IndustrialFailureMode
 *   (matched by exact failureModeId) appears in IndustrialEngineeringCase rows
 *   that have 2+ DISTINCT non-null siteId values within the organization.
 *
 *   No fuzzy matching. No ML. No NLP. Two cases match only if they share the
 *   exact same failureModeId. Given the same DB state, results are always identical.
 *
 * ASSET-TYPE ENRICHMENT:
 *   For each matching case, the IndustrialAsset.assetType is fetched (when
 *   case.assetId is non-null) to populate affectedAssetTypes.
 *
 * RESULT ORDERING: by siteCount DESC, then caseCount DESC, then failureModeName ASC.
 */

import { getPrisma } from "@/lib/db/prisma";
import { MIN_SITES_FOR_PATTERN, type CrossSitePatternData } from "./types";

type CaseModel   = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
type FMModel     = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
type AssetModel  = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

export async function findCrossSiteFailurePatterns(
  orgId:   string,
  siteIds: string[],
): Promise<CrossSitePatternData[]> {
  const prisma = await getPrisma();
  if (!prisma) return [];
  const db = prisma as unknown as Record<string, unknown>;

  // Step 1: Load all engineering cases with non-null siteId AND failureModeId
  const caseRows = await (db.industrialEngineeringCase as unknown as CaseModel).findMany({
    where: {
      organizationId: orgId,
      siteId:         { not: null, in: siteIds },
      failureModeId:  { not: null },
    },
    select: {
      id:           true,
      siteId:       true,
      assetId:      true,
      failureModeId: true,
      severity:     true,
    },
  });

  if (caseRows.length === 0) return [];

  // Step 2: Group by failureModeId → collect distinct siteIds
  const byMode = new Map<string, {
    siteIds:  Set<string>;
    caseIds:  string[];
    assetIds: Set<string>;
    bySite:   Map<string, { caseIds: string[]; assetIds: string[] }>;
    severity: string;
  }>();

  for (const row of caseRows) {
    const fmId   = row.failureModeId as string;
    const siteId = row.siteId        as string;
    const caseId = row.id            as string;
    const assetId = (row.assetId     as string | null) ?? null;
    const sev    = (row.severity     as string) ?? "MEDIUM";

    if (!byMode.has(fmId)) {
      byMode.set(fmId, {
        siteIds:  new Set(),
        caseIds:  [],
        assetIds: new Set(),
        bySite:   new Map(),
        severity: sev,
      });
    }
    const entry = byMode.get(fmId)!;
    entry.siteIds.add(siteId);
    entry.caseIds.push(caseId);
    if (assetId) entry.assetIds.add(assetId);

    if (!entry.bySite.has(siteId)) entry.bySite.set(siteId, { caseIds: [], assetIds: [] });
    entry.bySite.get(siteId)!.caseIds.push(caseId);
    if (assetId) entry.bySite.get(siteId)!.assetIds.push(assetId);
  }

  // Step 3: Keep only patterns spanning MIN_SITES_FOR_PATTERN+ sites
  const qualifyingModeIds = [...byMode.entries()]
    .filter(([, v]) => v.siteIds.size >= MIN_SITES_FOR_PATTERN)
    .map(([id]) => id);

  if (qualifyingModeIds.length === 0) return [];

  // Step 4: Load failure mode names
  const fmRows = await (db.industrialFailureMode as unknown as FMModel).findMany({
    where:  { id: { in: qualifyingModeIds }, organizationId: orgId },
    select: { id: true, name: true, severity: true },
  });
  const fmNameMap = new Map<string, { name: string; severity: string }>();
  for (const fm of fmRows) {
    fmNameMap.set(fm.id as string, { name: fm.name as string, severity: fm.severity as string });
  }

  // Step 5: Load asset types for affected asset IDs
  const allAssetIds = [...new Set([...byMode.values()].flatMap(v => [...v.assetIds]))];
  const assetTypeMap = new Map<string, string>();
  if (allAssetIds.length > 0) {
    const assetRows = await (db.industrialAsset as unknown as AssetModel).findMany({
      where:  { id: { in: allAssetIds }, organizationId: orgId },
      select: { id: true, assetType: true },
    });
    for (const a of assetRows) {
      assetTypeMap.set(a.id as string, a.assetType as string);
    }
  }

  // Step 6: Assemble results
  const results: CrossSitePatternData[] = [];

  for (const fmId of qualifyingModeIds) {
    const entry  = byMode.get(fmId)!;
    const fmMeta = fmNameMap.get(fmId);
    if (!fmMeta) continue;

    const assetTypes = [...new Set([...entry.assetIds]
      .map(aid => assetTypeMap.get(aid))
      .filter(Boolean))] as string[];

    const bySiteObj: Record<string, { caseIds: string[]; assetIds: string[] }> = {};
    for (const [sid, siteData] of entry.bySite) {
      bySiteObj[sid] = siteData;
    }

    results.push({
      failureModeId:      fmId,
      failureModeName:    fmMeta.name,
      severity:           fmMeta.severity,
      siteIds:            [...entry.siteIds],
      siteCount:          entry.siteIds.size,
      caseCount:          entry.caseIds.length,
      affectedAssetTypes: assetTypes,
      evidence: {
        caseIds: entry.caseIds,
        bySite:  bySiteObj,
      },
    });
  }

  // Sort: siteCount DESC, caseCount DESC, name ASC
  results.sort((a, b) =>
    b.siteCount - a.siteCount ||
    b.caseCount - a.caseCount ||
    a.failureModeName.localeCompare(b.failureModeName),
  );

  return results;
}
