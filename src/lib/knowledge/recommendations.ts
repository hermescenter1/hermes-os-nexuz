/**
 * Knowledge-based maintenance recommendations — Phase 40.
 *
 * Orchestrates failure knowledge, root cause candidates, and procedure
 * recommendations into a single structured output.
 *
 * READ-ONLY: reads Phase 35–39 records; no writes except to knowledge tables.
 */

import { getFailureKnowledge }      from "./failures";
import { getRootCauseCandidates }   from "./rootcauses";
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
  assetType?:     string,
  symptoms?:      string[],
): Promise<KnowledgeRecommendationBundle> {
  const [failureKnowledge, rootCauseCandidates, procedureRecommendations, assembledEvidence] =
    await Promise.all([
      getFailureKnowledge(organizationId, assetId, assetType, symptoms),
      getRootCauseCandidates(organizationId, assetId, assetType),
      getRecommendedProcedures(organizationId, assetId, assetType),
      assembleKnowledgeEvidence(organizationId, assetId),
    ]);

  return {
    assetId,
    failureKnowledge,
    rootCauseCandidates,
    procedureRecommendations,
    assembledEvidence,
  };
}
