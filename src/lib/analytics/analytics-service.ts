/**
 * Phase 20A — Project Analytics Service.
 *
 * Loads project and memory data, delegates all computation to the pure
 * analytics engine (computeProjectAnalytics). Never throws — any storage
 * failure degrades to an empty analytics result.
 */

import { listProjects } from "@/lib/memory/project-service";
import { listEngineeringMemories } from "@/lib/memory/memory-service";
import { resolveBrainOwner } from "@/lib/storage/brain-owner";
import { computeProjectAnalytics } from "./project-analytics";
import type { StoredProject, StoredMemory } from "@/lib/storage/types";

export type { AnalyticsResult } from "./project-analytics";

export async function getProjectAnalytics() {
  // PHASE 90B: resolve the tenant owner ONCE and thread it into both loads.
  const owner = await resolveBrainOwner();

  let projects: StoredProject[] = [];
  let memories: StoredMemory[] = [];

  try {
    projects = await listProjects(owner);
  } catch {
    /* degrade to empty project list */
  }

  try {
    memories = await listEngineeringMemories(0, owner); // 0 = no limit, return all
  } catch {
    /* degrade to empty memory list */
  }

  return computeProjectAnalytics(projects, memories);
}
