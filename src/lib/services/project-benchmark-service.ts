/**
 * Phase 20D — Project Benchmark Service.
 *
 * Loads all projects, all memories, and per-memory feedback then
 * delegates computation to the pure benchmark engine. Never throws —
 * storage failures degrade gracefully to empty data.
 */

import { listProjects } from "@/lib/memory/project-service";
import { listEngineeringMemories, getEngineeringMemory } from "@/lib/memory/memory-service";
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
  let projects: StoredProject[] = [];
  let memories: StoredMemory[]  = [];

  try { projects = await listProjects(); } catch { /* degrade */ }
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

  return computeProjectBenchmark(projects, memories, feedbackByMemoryId);
}
