/**
 * Phase 23 — Pure System Intelligence Dashboard Engine.
 *
 * Accepts pre-loaded data from all Hermes OS subsystems and produces a
 * single deterministic health report. No I/O, no side effects.
 */

import type {
  StoredProject,
  StoredMemory,
  StoredMemoryFeedback,
  ProjectStatus,
} from "@/lib/storage/types";
import type { KnowledgeGraph } from "./knowledge-graph";
import { computeGraphAnalytics } from "./graph-analytics";

// ── Public types ───────────────────────────────────────────────────────────

export interface SystemSummary {
  totalProjects:  number;
  activeProjects: number;
  totalMemories:  number;
  linkedMemories: number;
  totalDomains:   number;
  totalCases:     number;
}

export interface MemoryHealthReport {
  avgConfidence:       number;
  highConfidenceCount: number;
  lowConfidenceCount:  number;
  outcomeDistribution: {
    success: number;
    partial: number;
    failed:  number;
    unknown: number;
  };
  feedbackRate: number;
  successRate:  number;
}

export type SystemRiskLevel = "low" | "moderate" | "elevated" | "critical";

export interface ProjectHealthSummary {
  byStatus:         Record<ProjectStatus, number>;
  avgFailureRate:   number;
  highRiskProjects: number;
  systemRiskLevel:  SystemRiskLevel;
}

export interface GraphSummarySnapshot {
  totalNodes:          number;
  totalEdges:          number;
  connectedComponents: number;
  avgDegree:           number;
  healthScore:         number;
  isolatedNodes:       number;
}

export type DashboardInsightSeverity = "info" | "warning" | "critical";
export type DashboardInsightType =
  | "empty_system"
  | "high_risk_projects"
  | "low_confidence"
  | "low_feedback_rate"
  | "coverage_gap"
  | "fragmented_graph"
  | "knowledge_ready";

export interface DashboardInsight {
  type:     DashboardInsightType;
  source:   "memory" | "project" | "graph" | "system";
  severity: DashboardInsightSeverity;
  message:  string;
}

export interface SystemHealthScore {
  overall:  number;
  memory:   number;
  projects: number;
  graph:    number;
}

export interface DashboardResult {
  generatedAt:   string;
  systemSummary: SystemSummary;
  memoryHealth:  MemoryHealthReport;
  projectHealth: ProjectHealthSummary;
  graphSnapshot: GraphSummarySnapshot;
  systemHealth:  SystemHealthScore;
  insights:      DashboardInsight[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<DashboardInsightSeverity, number> = {
  critical: 0,
  warning:  1,
  info:     2,
};

function riskLevel(avgFailureRate: number): SystemRiskLevel {
  if (avgFailureRate >= 65) return "critical";
  if (avgFailureRate >= 40) return "elevated";
  if (avgFailureRate >= 20) return "moderate";
  return "low";
}

// ── System summary ─────────────────────────────────────────────────────────

function buildSystemSummary(
  projects: StoredProject[],
  memories: StoredMemory[]
): SystemSummary {
  const caseIds = new Set(memories.flatMap(m => m.relatedCaseIds ?? []));
  const domains = new Set(memories.map(m => m.domain).filter(Boolean));
  return {
    totalProjects:  projects.length,
    activeProjects: projects.filter(p => p.status === "active").length,
    totalMemories:  memories.length,
    linkedMemories: memories.filter(m => m.projectId != null && m.projectId !== "").length,
    totalDomains:   domains.size,
    totalCases:     caseIds.size,
  };
}

// ── Memory health ──────────────────────────────────────────────────────────

function buildMemoryHealth(
  memories:           StoredMemory[],
  feedbackByMemoryId: Map<string, StoredMemoryFeedback[]>
): MemoryHealthReport {
  if (memories.length === 0) {
    return {
      avgConfidence: 0, highConfidenceCount: 0, lowConfidenceCount: 0,
      outcomeDistribution: { success: 0, partial: 0, failed: 0, unknown: 0 },
      feedbackRate: 0, successRate: 0,
    };
  }
  const avgConfidence       = Math.round(memories.reduce((s, m) => s + m.confidence, 0) / memories.length);
  const highConfidenceCount = memories.filter(m => m.confidence >= 70).length;
  const lowConfidenceCount  = memories.filter(m => m.confidence < 40).length;
  const outcomeDistribution = {
    success: memories.filter(m => m.outcome === "success").length,
    partial: memories.filter(m => m.outcome === "partial").length,
    failed:  memories.filter(m => m.outcome === "failed").length,
    unknown: memories.filter(m => m.outcome === "unknown").length,
  };
  const withFeedback = memories.filter(m => (feedbackByMemoryId.get(m.id) ?? []).length > 0).length;
  const feedbackRate = Math.round((withFeedback / memories.length) * 100);
  const successRate  = Math.round((outcomeDistribution.success / memories.length) * 100);
  return { avgConfidence, highConfidenceCount, lowConfidenceCount, outcomeDistribution, feedbackRate, successRate };
}

// ── Project health ─────────────────────────────────────────────────────────

function buildProjectHealth(
  projects: StoredProject[],
  memories: StoredMemory[]
): ProjectHealthSummary {
  const byStatus: Record<ProjectStatus, number> = { active: 0, archived: 0, completed: 0 };
  for (const p of projects) byStatus[p.status]++;

  const projectsWithMems = projects.filter(p =>
    memories.some(m => m.projectId === p.id)
  );

  let avgFailureRate = 0;
  let highRiskProjects = 0;

  if (projectsWithMems.length > 0) {
    const rates = projectsWithMems.map(p => {
      const pMems       = memories.filter(m => m.projectId === p.id);
      const failedCount = pMems.filter(m => m.outcome === "failed").length;
      return Math.round((failedCount / pMems.length) * 100);
    });
    avgFailureRate   = Math.round(rates.reduce((s, r) => s + r, 0) / rates.length);
    highRiskProjects = rates.filter(r => r > 50).length;
  }

  return { byStatus, avgFailureRate, highRiskProjects, systemRiskLevel: riskLevel(avgFailureRate) };
}

// ── Graph snapshot ─────────────────────────────────────────────────────────

function buildGraphSnapshot(graph: KnowledgeGraph, graphHealthScore: number): GraphSummarySnapshot {
  return {
    totalNodes:          graph.summary.totalNodes,
    totalEdges:          graph.summary.totalEdges,
    connectedComponents: graph.summary.connectedComponents,
    avgDegree:           graph.summary.avgDegree,
    healthScore:         graphHealthScore,
    isolatedNodes:       graph.summary.isolatedNodes,
  };
}

// ── System health score ────────────────────────────────────────────────────

function buildSystemHealth(
  memHealth:  MemoryHealthReport,
  projHealth: ProjectHealthSummary,
  graphScore: number
): SystemHealthScore {
  const memory   = Math.round((memHealth.avgConfidence + memHealth.successRate) / 2);
  const projects = Math.max(0, 100 - projHealth.avgFailureRate);
  const graph    = graphScore;
  const overall  = Math.round(memory * 0.35 + projects * 0.35 + graph * 0.30);
  return { overall, memory, projects, graph };
}

// ── Insights ───────────────────────────────────────────────────────────────

function buildInsights(
  summary:    SystemSummary,
  memHealth:  MemoryHealthReport,
  projHealth: ProjectHealthSummary,
  graph:      KnowledgeGraph
): DashboardInsight[] {
  const raw: DashboardInsight[] = [];

  // 1. empty_system
  if (summary.totalMemories === 0) {
    raw.push({
      type: "empty_system", source: "system", severity: "info",
      message: "No engineering memories found — add memories to enable intelligence features",
    });
  }

  // 2. high_risk_projects
  if (projHealth.highRiskProjects > 0) {
    const s = projHealth.highRiskProjects === 1;
    raw.push({
      type: "high_risk_projects", source: "project",
      severity: projHealth.systemRiskLevel === "critical" ? "critical" : "warning",
      message: `${projHealth.highRiskProjects} project${s ? "" : "s"} ${s ? "has" : "have"} high failure rate (>50%)`,
    });
  }

  // 3. low_confidence
  if (summary.totalMemories > 0 && memHealth.avgConfidence < 50) {
    raw.push({
      type: "low_confidence", source: "memory", severity: "warning",
      message: `Average memory confidence is ${memHealth.avgConfidence} — review low-quality analyses`,
    });
  }

  // 4. low_feedback_rate
  if (summary.totalMemories >= 3 && memHealth.feedbackRate < 50) {
    raw.push({
      type: "low_feedback_rate", source: "memory", severity: "info",
      message: `Feedback rate is ${memHealth.feedbackRate}% — provide outcomes to improve memory learning`,
    });
  }

  // 5. coverage_gap
  if (summary.totalMemories > 0 && summary.linkedMemories < summary.totalMemories) {
    const gap = summary.totalMemories - summary.linkedMemories;
    raw.push({
      type: "coverage_gap", source: "system", severity: "info",
      message: `${gap} ${gap === 1 ? "memory is" : "memories are"} not linked to any project`,
    });
  }

  // 6. fragmented_graph
  if (graph.nodes.length > 0 && graph.summary.connectedComponents > 1) {
    raw.push({
      type: "fragmented_graph", source: "graph", severity: "warning",
      message: `Knowledge graph has ${graph.summary.connectedComponents} disconnected components`,
    });
  }

  // 7. knowledge_ready (positive)
  if (
    summary.totalMemories >= 5 &&
    memHealth.avgConfidence >= 70 &&
    memHealth.successRate >= 50
  ) {
    raw.push({
      type: "knowledge_ready", source: "system", severity: "info",
      message: `Knowledge base is healthy: ${summary.totalMemories} memories at ${memHealth.avgConfidence}% average confidence`,
    });
  }

  // Sort: critical first, then warning, then info (stable within tier)
  return raw.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

// ── Main export ────────────────────────────────────────────────────────────

export function computeDashboard(
  projects:           StoredProject[],
  memories:           StoredMemory[],
  feedbackByMemoryId: Map<string, StoredMemoryFeedback[]>,
  graph:              KnowledgeGraph,
  now                 = new Date()
): DashboardResult {
  const graphAnalytics = computeGraphAnalytics(graph);
  const graphScore     = graphAnalytics.health.overallScore;

  const systemSummary = buildSystemSummary(projects, memories);
  const memoryHealth  = buildMemoryHealth(memories, feedbackByMemoryId);
  const projectHealth = buildProjectHealth(projects, memories);
  const graphSnapshot = buildGraphSnapshot(graph, graphScore);
  const systemHealth  = buildSystemHealth(memoryHealth, projectHealth, graphScore);
  const insights      = buildInsights(systemSummary, memoryHealth, projectHealth, graph);

  return {
    generatedAt: now.toISOString(),
    systemSummary,
    memoryHealth,
    projectHealth,
    graphSnapshot,
    systemHealth,
    insights,
  };
}
