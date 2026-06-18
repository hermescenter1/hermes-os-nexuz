/**
 * Phase 21A — Knowledge Graph Service.
 *
 * Loads all projects, memories, and per-memory feedback then delegates to the
 * pure graph engine. Never throws — storage failures degrade to an empty graph.
 */

import { listProjects } from "@/lib/memory/project-service";
import { listEngineeringMemories, getEngineeringMemory } from "@/lib/memory/memory-service";
import { computeKnowledgeGraph } from "@/lib/analytics/knowledge-graph";
import type { KnowledgeGraph } from "@/lib/analytics/knowledge-graph";
import type { StoredProject, StoredMemory, StoredMemoryFeedback } from "@/lib/storage/types";

export type {
  KnowledgeGraph,
  GraphNode,
  GraphEdge,
  GraphSummary,
  NodeType,
  EdgeType,
} from "@/lib/analytics/knowledge-graph";

export async function getKnowledgeGraph(): Promise<KnowledgeGraph> {
  let projects: StoredProject[] = [];
  let memories: StoredMemory[]  = [];

  try { projects = await listProjects(); }           catch { /* degrade */ }
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

  return computeKnowledgeGraph(projects, memories, feedbackByMemoryId);
}
