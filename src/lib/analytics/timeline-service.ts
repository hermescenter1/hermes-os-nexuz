/**
 * Phase 20B — Project Timeline Service.
 *
 * Loads project, memory, and feedback data then delegates all timeline
 * computation to the pure engine. Returns null when the project doesn't
 * exist. Never throws — partial storage failures degrade gracefully
 * (empty memories / empty feedback) without failing the entire response.
 */

import { getProject } from "@/lib/memory/project-service";
import { listEngineeringMemories, getEngineeringMemory } from "@/lib/memory/memory-service";
import { resolveBrainOwner } from "@/lib/storage/brain-owner";
import { computeProjectTimeline } from "./project-timeline";
import type { ProjectTimelineData } from "./project-timeline";
import type { StoredProject, StoredMemory, StoredMemoryFeedback } from "@/lib/storage/types";

export type { ProjectTimelineData, TimelineEvent, TimelineStats, TimelineEventType } from "./project-timeline";

export interface ProjectTimelineResult extends ProjectTimelineData {
  project: StoredProject;
}

export async function getProjectTimeline(
  projectId: string
): Promise<ProjectTimelineResult | null> {
  // PHASE 90B: resolve the tenant owner ONCE and thread it (no per-memory N+1).
  const owner = await resolveBrainOwner();
  const project = await getProject(projectId, owner); // never throws; null = not found
  if (!project) return null;

  // Load memories tagged with this project
  let memories: StoredMemory[] = [];
  try {
    const all = await listEngineeringMemories(0, owner);
    memories = all.filter((m) => m.projectId === projectId);
  } catch {
    /* silently degrade to empty memories */
  }

  // Load feedback for each memory; failures on individual memories are skipped
  const feedbackByMemoryId = new Map<string, StoredMemoryFeedback[]>();
  await Promise.allSettled(
    memories.map(async (m) => {
      try {
        const full = await getEngineeringMemory(m.id, owner);
        if (full && full.feedback.length > 0) {
          feedbackByMemoryId.set(m.id, full.feedback);
        }
      } catch {
        /* silently skip this memory's feedback */
      }
    })
  );

  const data = computeProjectTimeline(project, memories, feedbackByMemoryId);

  return { project, ...data };
}
