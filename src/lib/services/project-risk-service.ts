/**
 * Phase 20C — Project Risk Service.
 *
 * Loads project, memories, and per-memory feedback then delegates all
 * risk computation to the pure engine. Returns null when the project
 * doesn't exist. Storage failures degrade gracefully — missing memories
 * or feedback produce a conservative risk picture, never a crash.
 */

import { getProject } from "@/lib/memory/project-service";
import { listEngineeringMemories, getEngineeringMemory } from "@/lib/memory/memory-service";
import { computeProjectRisk } from "@/lib/analytics/project-risk";
import type { RiskEvolutionResult } from "@/lib/analytics/project-risk";
import type { StoredMemory, StoredMemoryFeedback } from "@/lib/storage/types";

export type { RiskEvolutionResult, RiskHistoryEntry, RiskLevel, RiskTrend } from "@/lib/analytics/project-risk";

export async function getProjectRisk(
  projectId: string
): Promise<RiskEvolutionResult | null> {
  const project = await getProject(projectId); // never throws; null = not found
  if (!project) return null;

  let memories: StoredMemory[] = [];
  try {
    const all = await listEngineeringMemories(0);
    memories = all.filter(m => m.projectId === projectId);
  } catch {
    /* degrade to empty memory list */
  }

  const feedbackByMemoryId = new Map<string, StoredMemoryFeedback[]>();
  await Promise.allSettled(
    memories.map(async m => {
      try {
        const full = await getEngineeringMemory(m.id);
        if (full && full.feedback.length > 0) {
          feedbackByMemoryId.set(m.id, full.feedback);
        }
      } catch {
        /* skip feedback for this memory */
      }
    })
  );

  return computeProjectRisk(project, memories, feedbackByMemoryId);
}
