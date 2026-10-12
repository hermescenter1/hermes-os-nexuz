/**
 * Cross-Site Failure Pattern Detection — Phase 42, authoritative eligibility per slice B (IR-02).
 *
 * MATCHING CRITERION (deterministic, documented):
 *   A CrossSiteFailurePattern is identified when the same IndustrialFailureMode
 *   (matched by exact failureModeId) appears in ELIGIBLE IndustrialEngineeringCase rows
 *   that sit on 2+ DISTINCT sites of the analysed set.
 *
 *   No fuzzy matching. No ML. No NLP. Two cases match only if they share the
 *   exact same failureModeId. Given the same DB state, results are always identical.
 *
 * ELIGIBLE CASE (see ./projection.ts):
 *   the case carries a site of the analysed set and, when it claims an asset, that asset exists in the
 *   SAME organisation on the SAME site. A case whose site and asset disagree, whose asset is foreign or
 *   missing, that has only an asset, or that has neither site nor asset contributes nothing. The rule is
 *   the engineering-case policy of `knowledge/case-visibility.ts`, not a second copy of it.
 *
 * ASSET-TYPE ENRICHMENT:
 *   The IndustrialAsset.assetType of each eligible case's validated asset populates affectedAssetTypes.
 *
 * RESULT ORDERING: by siteCount DESC, then caseCount DESC, then failureModeName ASC.
 *
 * The rows written from this result are an ORGANISATION-level snapshot; readers never return them as stored
 * (see ./projection.ts `projectPersistedPatterns`).
 */

import { getPrisma } from "@/lib/db/prisma";
import type { CrossSitePatternData } from "./types";
import { assemblePattern, groupByFailureMode, loadEligibleCases } from "./projection";

type FMModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

export async function findCrossSiteFailurePatterns(
  orgId:   string,
  siteIds: string[],
): Promise<CrossSitePatternData[]> {
  const prisma = await getPrisma();
  if (!prisma) return [];
  const db = prisma as unknown as Record<string, unknown>;

  // Steps 1-2: the eligible cases of the analysed sites, grouped by failure mode.
  const eligible = await loadEligibleCases(db, orgId, siteIds);
  if (eligible.length === 0) return [];
  const byMode = groupByFailureMode(eligible);

  const bodies = new Map<string, NonNullable<ReturnType<typeof assemblePattern>>>();
  for (const [fmId, cases] of byMode) {
    const body = assemblePattern(cases);            // null unless 2+ distinct sites contribute
    if (body) bodies.set(fmId, body);
  }
  if (bodies.size === 0) return [];

  // Step 3: failure-mode names and catalogue severity
  const fmRows = await (db.industrialFailureMode as unknown as FMModel).findMany({
    where:  { id: { in: [...bodies.keys()] }, organizationId: orgId },
    select: { id: true, name: true, severity: true },
  });
  const fmMeta = new Map<string, { name: string; severity: string }>();
  for (const fm of fmRows) fmMeta.set(String(fm.id), { name: String(fm.name), severity: String(fm.severity) });

  // Step 4: assemble
  const results: CrossSitePatternData[] = [];
  for (const [fmId, body] of bodies) {
    const meta = fmMeta.get(fmId);
    if (!meta) continue;
    results.push({
      failureModeId:      fmId,
      failureModeName:    meta.name,
      severity:           meta.severity,
      siteIds:            body.siteIds,
      siteCount:          body.siteCount,
      caseCount:          body.caseCount,
      affectedAssetTypes: body.affectedAssetTypes,
      evidence:           body.evidence,
    });
  }

  results.sort((a, b) =>
    b.siteCount - a.siteCount ||
    b.caseCount - a.caseCount ||
    a.failureModeName.localeCompare(b.failureModeName),
  );

  return results;
}
