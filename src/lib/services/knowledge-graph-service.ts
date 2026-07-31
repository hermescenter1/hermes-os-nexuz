/**
 * Phase 21A — Knowledge Graph Service.
 *
 * Loads projects, memories, and per-memory feedback then delegates to the pure
 * graph engine. Never throws — storage failures degrade to an empty graph.
 *
 * PHASE 90B: the graph is built ONLY from the caller's own tenant projects and
 * memories, so every node, edge, neighbor, path and analytic derived from it is
 * tenant-isolated — a foreign node id is simply absent from the caller's graph.
 * The owner is resolved once and threaded into every load (projects, memories,
 * and each memory's feedback) so there is no per-memory re-resolution.
 */

import { listProjects } from "@/lib/memory/project-service";
import { listEngineeringMemories, getEngineeringMemory } from "@/lib/memory/memory-service";
import { resolveBrainOwner } from "@/lib/storage/brain-owner";
import { computeKnowledgeGraph } from "@/lib/analytics/knowledge-graph";
import type { KnowledgeGraph } from "@/lib/analytics/knowledge-graph";
import type { StoredProject, StoredMemory, StoredMemoryFeedback, BrainOwner } from "@/lib/storage/types";

export type {
  KnowledgeGraph,
  GraphNode,
  GraphEdge,
  GraphSummary,
  NodeType,
  EdgeType,
} from "@/lib/analytics/knowledge-graph";

export async function getKnowledgeGraph(owner?: BrainOwner | null): Promise<KnowledgeGraph> {
  const scope = owner === undefined ? await resolveBrainOwner() : owner;

  let projects: StoredProject[] = [];
  let memories: StoredMemory[]  = [];

  try { projects = await listProjects(scope); }            catch { /* degrade */ }
  try { memories = await listEngineeringMemories(0, scope); } catch { /* degrade */ }

  const feedbackByMemoryId = new Map<string, StoredMemoryFeedback[]>();
  await Promise.allSettled(
    memories.map(async m => {
      try {
        const full = await getEngineeringMemory(m.id, scope);
        if (full && full.feedback.length > 0) feedbackByMemoryId.set(m.id, full.feedback);
      } catch { /* skip this memory's feedback */ }
    })
  );

  return computeKnowledgeGraph(projects, memories, feedbackByMemoryId);
}
