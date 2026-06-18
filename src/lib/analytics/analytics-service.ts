/**
 * Phase 20A — Project Analytics Service.
 *
 * Loads project and memory data, delegates all computation to the pure
 * analytics engine (computeProjectAnalytics). Never throws — any storage
 * failure degrades to an empty analytics result.
 */

import { listProjects } from "@/lib/memory/project-service";
import { listEngineeringMemories } from "@/lib/memory/memory-service";
import { computeProjectAnalytics } from "./project-analytics";
import type { StoredProject, StoredMemory } from "@/lib/storage/types";

export type { AnalyticsResult } from "./project-analytics";

export async function getProjectAnalytics() {
  let projects: StoredProject[] = [];
  let memories: StoredMemory[] = [];

  try {
    projects = await listProjects();
  } catch {
    /* degrade to empty project list */
  }

  try {
    memories = await listEngineeringMemories(0); // 0 = no limit, return all
  } catch {
    /* degrade to empty memory list */
  }

  return computeProjectAnalytics(projects, memories);
}
