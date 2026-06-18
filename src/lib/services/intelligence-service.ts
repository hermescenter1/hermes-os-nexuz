/**
 * Phase 26 — Intelligence Service Layer.
 *
 * Loads all required data once, then delegates to the three pure engines:
 * failure-prediction, recommendations, and playbook. Uses independent
 * try/catch blocks per data source; never throws to the route.
 */

import { listProjects } from "@/lib/memory/project-service";
import { listEngineeringMemories, getEngineeringMemory } from "@/lib/memory/memory-service";
import { computeFailurePredictions } from "@/lib/analytics/failure-prediction";
import { computeRecommendations } from "@/lib/analytics/recommendations";
import { computePlaybooks } from "@/lib/analytics/playbook";
import type { FailurePredictionResult } from "@/lib/analytics/failure-prediction";
import type { RecommendationResult } from "@/lib/analytics/recommendations";
import type { PlaybookResult } from "@/lib/analytics/playbook";
import type { StoredProject, StoredMemory, StoredMemoryFeedback } from "@/lib/storage/types";

export type { FailurePredictionResult, ProjectPrediction, PredictionSummary, FailureRiskLevel, FailureFactor, FailureFactorType } from "@/lib/analytics/failure-prediction";
export type { RecommendationResult, Recommendation, RecommendationType, RecommendationPriority } from "@/lib/analytics/recommendations";
export type { PlaybookResult, PlaybookEntry, PlaybookStep } from "@/lib/analytics/playbook";

export interface IntelligenceResult {
  generatedAt:     string;
  predictions:     FailurePredictionResult;
  recommendations: RecommendationResult;
  playbooks:       PlaybookResult;
}

export async function getIntelligence(): Promise<IntelligenceResult> {
  let projects: StoredProject[] = [];
  let memories: StoredMemory[]  = [];

  try { projects = await listProjects(); }             catch { /* degrade */ }
  try { memories = await listEngineeringMemories(0); } catch { /* degrade */ }

  const feedbackByMemoryId = new Map<string, StoredMemoryFeedback[]>();
  await Promise.allSettled(
    memories.map(async m => {
      try {
        const full = await getEngineeringMemory(m.id);
        if (full && full.feedback.length > 0) feedbackByMemoryId.set(m.id, full.feedback);
      } catch { /* skip this memory's feedback */ }
    })
  );

  const now = new Date();
  return {
    generatedAt:     now.toISOString(),
    predictions:     computeFailurePredictions(projects, memories, feedbackByMemoryId, now),
    recommendations: computeRecommendations(memories, feedbackByMemoryId, now),
    playbooks:       computePlaybooks(memories),
  };
}
