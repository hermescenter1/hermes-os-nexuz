/**
 * Phase 24 — Domain Intelligence Service.
 *
 * Loads projects, memories, and per-memory feedback, then delegates to the
 * pure domain intelligence engine. Uses independent try/catch blocks per
 * data source to degrade gracefully on partial failures.
 */

import { listProjects } from "@/lib/memory/project-service";
import { listEngineeringMemories, getEngineeringMemory } from "@/lib/memory/memory-service";
import { resolveBrainOwner } from "@/lib/storage/brain-owner";
import {
  computeDomainList,
  computeDomainDetail,
} from "@/lib/analytics/domain-intelligence";
import type {
  DomainListResult,
  DomainDetail,
} from "@/lib/analytics/domain-intelligence";
import type { StoredProject, StoredMemory, StoredMemoryFeedback } from "@/lib/storage/types";

export type {
  DomainListResult,
  DomainDetail,
  DomainSummary,
  DomainTrend,
  DomainTrendDirection,
  TopCase,
  TopProject,
} from "@/lib/analytics/domain-intelligence";

async function loadData(): Promise<{
  projects:           StoredProject[];
  memories:           StoredMemory[];
  feedbackByMemoryId: Map<string, StoredMemoryFeedback[]>;
}> {
  // PHASE 90B: resolve the tenant owner ONCE and thread it (no per-memory N+1).
  const owner = await resolveBrainOwner();

  let projects: StoredProject[] = [];
  let memories: StoredMemory[]  = [];

  try { projects = await listProjects(owner); }             catch { /* degrade */ }
  try { memories = await listEngineeringMemories(0, owner); } catch { /* degrade */ }

  const feedbackByMemoryId = new Map<string, StoredMemoryFeedback[]>();
  await Promise.allSettled(
    memories.map(async m => {
      try {
        const full = await getEngineeringMemory(m.id, owner);
        if (full && full.feedback.length > 0) feedbackByMemoryId.set(m.id, full.feedback);
      } catch { /* skip this memory's feedback */ }
    })
  );

  return { projects, memories, feedbackByMemoryId };
}

export async function getDomainList(): Promise<DomainListResult> {
  const { projects, memories, feedbackByMemoryId } = await loadData();
  return computeDomainList(projects, memories, feedbackByMemoryId);
}

export async function getDomainByName(name: string): Promise<DomainDetail | null> {
  const { projects, memories, feedbackByMemoryId } = await loadData();
  return computeDomainDetail(name, projects, memories, feedbackByMemoryId);
}
