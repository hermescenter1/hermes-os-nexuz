/**
 * Phase 23 — Dashboard Service.
 *
 * Loads all subsystem data (projects, memories, feedback, knowledge graph),
 * then delegates to the pure dashboard engine. Re-throws so the route can
 * return a fallback on failure.
 */

import { listProjects } from "@/lib/memory/project-service";
import { listEngineeringMemories, getEngineeringMemory } from "@/lib/memory/memory-service";
import { getKnowledgeGraph } from "./knowledge-graph-service";
import { computeDashboard } from "@/lib/analytics/dashboard";
import type { DashboardResult } from "@/lib/analytics/dashboard";
import type { StoredProject, StoredMemory, StoredMemoryFeedback } from "@/lib/storage/types";
import type { KnowledgeGraph } from "@/lib/analytics/knowledge-graph";

export type {
  DashboardResult,
  SystemSummary,
  MemoryHealthReport,
  ProjectHealthSummary,
  GraphSummarySnapshot,
  SystemHealthScore,
  DashboardInsight,
  DashboardInsightType,
  DashboardInsightSeverity,
  SystemRiskLevel,
} from "@/lib/analytics/dashboard";

const EMPTY_GRAPH: KnowledgeGraph = {
  nodes: [], edges: [],
  summary: {
    totalNodes: 0, totalEdges: 0,
    nodesByType:  { project: 0, memory: 0, domain: 0, case: 0, risk: 0, outcome: 0, solution: 0 },
    edgesByType:  { belongs_to_project: 0, related_to_domain: 0, has_outcome: 0, has_risk: 0, similar_to: 0, resolved_by: 0 },
    connectedComponents: 0, avgDegree: 0, isolatedNodes: 0,
  },
};

export async function getDashboard(): Promise<DashboardResult> {
  let projects: StoredProject[] = [];
  let memories: StoredMemory[]  = [];
  let graph:    KnowledgeGraph  = EMPTY_GRAPH;

  try { projects = await listProjects(); }             catch { /* degrade gracefully */ }
  try { memories = await listEngineeringMemories(0); } catch { /* degrade gracefully */ }
  try { graph    = await getKnowledgeGraph(); }        catch { /* use empty graph */ }

  const feedbackByMemoryId = new Map<string, StoredMemoryFeedback[]>();
  await Promise.allSettled(
    memories.map(async m => {
      try {
        const full = await getEngineeringMemory(m.id);
        if (full && full.feedback.length > 0) feedbackByMemoryId.set(m.id, full.feedback);
      } catch { /* skip this memory's feedback */ }
    })
  );

  return computeDashboard(projects, memories, feedbackByMemoryId, graph);
}
