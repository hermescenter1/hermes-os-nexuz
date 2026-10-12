/**
 * Knowledge-based maintenance recommendations — Phase 40.
 *
 * Orchestrates failure knowledge, root cause candidates, and procedure
 * recommendations into a single structured output.
 *
 * READ-ONLY: reads Phase 35–39 records; no writes except to knowledge tables.
 */

import { getFailureKnowledge }      from "./failures";
import type { GraphViewerScope }    from "@/lib/knowledge-graph/visibility";
import { getRootCauseCandidates, resolveAuthorizedAsset } from "./rootcauses";
import { getRecommendedProcedures } from "./procedures";
import { assembleKnowledgeEvidence } from "./evidence";
import type {
  FailureKnowledgeResult,
  RootCauseCandidate,
  ProcedureRecommendation,
  KnowledgeEvidence,
} from "./types";

export interface KnowledgeRecommendationBundle {
  assetId:               string;
  failureKnowledge:      FailureKnowledgeResult;
  rootCauseCandidates:   RootCauseCandidate[];
  procedureRecommendations: ProcedureRecommendation[];
  assembledEvidence:     KnowledgeEvidence[];
}

export async function buildKnowledgeRecommendations(
  organizationId: string,
  assetId:        string,
  assetType:      string | undefined,
  symptoms:       string[] | undefined,
  scope:          GraphViewerScope | null,
): Promise<KnowledgeRecommendationBundle> {
  // Slice C (IR-04): root-cause candidates read the asset's indicators, so they need an asset proven
  // readable through the caller's scope; no scope (or another organisation's) means none.
  const authorizedAsset = scope !== null && scope.organizationId === organizationId
    ? await resolveAuthorizedAsset(organizationId, assetId, scope.allowedSiteIds)
    : null;
  const [failureKnowledge, rootCauseCandidates, procedureRecommendations, assembledEvidence] =
    await Promise.all([
      getFailureKnowledge(organizationId, assetId, assetType, symptoms, scope),
      authorizedAsset ? getRootCauseCandidates(organizationId, authorizedAsset) : Promise.resolve([]),
      getRecommendedProcedures(organizationId, assetId, assetType),
      authorizedAsset && scope ? assembleKnowledgeEvidence(organizationId, authorizedAsset, scope.allowedSiteIds) : Promise.resolve([]),
    ]);

  return {
    assetId,
    failureKnowledge,
    rootCauseCandidates,
    procedureRecommendations,
    assembledEvidence,
  };
}
