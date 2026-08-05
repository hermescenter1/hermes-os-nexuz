/**
 * Phase 20D — Project Benchmark Service.
 *
 * Loads all projects, all memories, and per-memory feedback then
 * delegates computation to the pure benchmark engine. Never throws —
 * storage failures degrade gracefully to empty data.
 */

import { listProjects } from "@/lib/memory/project-service";
import { listEngineeringMemories, getEngineeringMemory } from "@/lib/memory/memory-service";
import { resolveBrainOwner } from "@/lib/storage/brain-owner";
import { computeProjectBenchmark } from "@/lib/analytics/project-benchmark";
import type { BenchmarkResult } from "@/lib/analytics/project-benchmark";
import type { StoredProject, StoredMemory, StoredMemoryFeedback } from "@/lib/storage/types";

export type {
  BenchmarkResult,
  BenchmarkInsight,
  BenchmarkInsightType,
  BenchmarkLeader,
  ProjectLeaders,
  RankingEntry,
  BenchmarkRankings,
  BenchmarkSummary,
} from "@/lib/analytics/project-benchmark";

export async function getBenchmark(): Promise<BenchmarkResult> {
  // PHASE 90B: resolve the tenant owner ONCE and thread it (no per-memory N+1).
  const owner = await resolveBrainOwner();

  let projects: StoredProject[] = [];
  let memories: StoredMemory[]  = [];

  try { projects = await listProjects(owner); } catch { /* degrade */ }
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

  return computeProjectBenchmark(projects, memories, feedbackByMemoryId);
}
