/**
 * Phase 22 — Graph Analytics Service.
 *
 * Loads the knowledge graph via the existing service, then delegates to the
 * pure analytics engine. Re-throws on failure so callers can return an error.
 */

import { getKnowledgeGraph } from "./knowledge-graph-service";
import { computeGraphAnalytics } from "@/lib/analytics/graph-analytics";
import type { GraphAnalyticsResult } from "@/lib/analytics/graph-analytics";

export type {
  GraphAnalyticsResult,
  NodeCentrality,
  DomainHealth,
  ProjectConnectivity,
  GraphHealth,
  GraphInsight,
  GraphInsightType,
} from "@/lib/analytics/graph-analytics";

export async function getGraphAnalytics(): Promise<GraphAnalyticsResult> {
  const graph = await getKnowledgeGraph();
  return computeGraphAnalytics(graph);
}
