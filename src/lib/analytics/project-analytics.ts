import type { StoredProject, StoredMemory } from "@/lib/storage/types";

// ── Types ──────────────────────────────────────────────────────────────────

export interface RiskDistribution {
  low: number;
  medium: number;
  high: number;
  unknown: number;
}

export interface PortfolioSummary {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  archivedProjects: number;
  /** All memories in the store, including untagged ones. */
  totalMemories: number;
  /** Average project-tagged memories per project; 0 when no projects. */
  memoriesPerProject: number;
  successfulOutcomes: number;
  failedOutcomes: number;
  partialOutcomes: number;
  unknownOutcomes: number;
  projectRiskDistribution: RiskDistribution;
}

export interface ProjectAnalyticsStats {
  projectId: string;
  projectName: string;
  status: string;
  memoryCount: number;
  successCount: number;
  failedCount: number;
  partialCount: number;
  unknownCount: number;
  /** 0–100, rounded; 0 when no memories. */
  successRate: number;
  /** 0–100, rounded; 0 when no memories. */
  failureRate: number;
  /** Up to 3 most-used domains for this project's memories. */
  topDomains: string[];
  riskLevel: "low" | "medium" | "high" | "unknown";
  /** 0–100, rounded; 0 when no memories. */
  avgConfidence: number;
}

export type InsightType =
  | "highest_memory_activity"
  | "highest_success_rate"
  | "highest_failure_rate"
  | "most_engineering_incidents"
  | "recurring_pattern";

export interface Insight {
  type: InsightType;
  /** Absent for portfolio-level insights (e.g. recurring_pattern). */
  projectId?: string;
  projectName?: string;
  value: string | number;
  description: string;
}

export interface AnalyticsResult {
  summary: PortfolioSummary;
  /** One entry per project, ordered by creation (same as listProjects). */
  projectStats: ProjectAnalyticsStats[];
  insights: Insight[];
}

// ── Pure helpers ───────────────────────────────────────────────────────────

/** Integer percentage; 0 when total is 0. */
function pct(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

/** Returns the top-k items by frequency; ties broken alphabetically. */
function topK(items: string[], k = 3): string[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([aKey, aVal], [bKey, bVal]) => bVal - aVal || aKey.localeCompare(bKey))
    .slice(0, k)
    .map(([key]) => key);
}

function computeRiskLevel(
  memoryCount: number,
  failureRate: number,
  successRate: number
): "low" | "medium" | "high" | "unknown" {
  if (memoryCount === 0) return "unknown";
  if (failureRate > 50) return "high";
  if (failureRate > 20) return "medium";
  if (successRate >= 60) return "low";
  return "unknown";
}

/** Stable max: picks highest value; ties broken by projectId ascending. */
function stableMax<T extends { projectId: string }>(
  items: T[],
  key: (item: T) => number
): T {
  return items.reduce((a, b) => {
    const av = key(a), bv = key(b);
    return bv > av || (bv === av && b.projectId < a.projectId) ? b : a;
  });
}

// ── Core analytics engine ──────────────────────────────────────────────────

/**
 * Pure, deterministic analytics computation — no I/O, no side effects.
 * Call this with pre-loaded arrays; the service layer handles data loading.
 */
export function computeProjectAnalytics(
  projects: StoredProject[],
  memories: StoredMemory[]
): AnalyticsResult {
  // ── Per-project stats ──────────────────────────────────────────────────
  const projectStats: ProjectAnalyticsStats[] = projects.map((project) => {
    const pm = memories.filter((m) => m.projectId === project.id);
    const memoryCount  = pm.length;
    const successCount = pm.filter((m) => m.outcome === "success").length;
    const failedCount  = pm.filter((m) => m.outcome === "failed").length;
    const partialCount = pm.filter((m) => m.outcome === "partial").length;
    const unknownCount = pm.filter((m) => m.outcome === "unknown").length;
    const successRate  = pct(successCount, memoryCount);
    const failureRate  = pct(failedCount,  memoryCount);
    const avgConfidence =
      memoryCount > 0
        ? Math.round(pm.reduce((s, m) => s + m.confidence, 0) / memoryCount)
        : 0;

    return {
      projectId:   project.id,
      projectName: project.name,
      status:      project.status,
      memoryCount,
      successCount,
      failedCount,
      partialCount,
      unknownCount,
      successRate,
      failureRate,
      topDomains:  topK(pm.map((m) => m.domain)),
      riskLevel:   computeRiskLevel(memoryCount, failureRate, successRate),
      avgConfidence,
    };
  });

  // ── Portfolio summary ──────────────────────────────────────────────────
  const totalProjects        = projects.length;
  const totalProjectMemories = projectStats.reduce((s, p) => s + p.memoryCount, 0);

  const summary: PortfolioSummary = {
    totalProjects,
    activeProjects:    projects.filter((p) => p.status === "active").length,
    completedProjects: projects.filter((p) => p.status === "completed").length,
    archivedProjects:  projects.filter((p) => p.status === "archived").length,
    totalMemories:     memories.length,
    memoriesPerProject:
      totalProjects > 0
        ? Math.round((totalProjectMemories / totalProjects) * 10) / 10
        : 0,
    successfulOutcomes: memories.filter((m) => m.outcome === "success").length,
    failedOutcomes:     memories.filter((m) => m.outcome === "failed").length,
    partialOutcomes:    memories.filter((m) => m.outcome === "partial").length,
    unknownOutcomes:    memories.filter((m) => m.outcome === "unknown").length,
    projectRiskDistribution: {
      low:     projectStats.filter((p) => p.riskLevel === "low").length,
      medium:  projectStats.filter((p) => p.riskLevel === "medium").length,
      high:    projectStats.filter((p) => p.riskLevel === "high").length,
      unknown: projectStats.filter((p) => p.riskLevel === "unknown").length,
    },
  };

  // ── Insight generation ─────────────────────────────────────────────────
  const insights: Insight[] = [];
  const withMemories = projectStats.filter((p) => p.memoryCount > 0);
  const withFailures = withMemories.filter((p)  => p.failedCount > 0);

  if (withMemories.length > 0) {
    const top = stableMax(withMemories, (p) => p.memoryCount);
    insights.push({
      type:        "highest_memory_activity",
      projectId:   top.projectId,
      projectName: top.projectName,
      value:       top.memoryCount,
      description: `${top.projectName} has the highest memory activity with ${top.memoryCount} recorded ${top.memoryCount === 1 ? "analysis" : "analyses"}.`,
    });
  }

  if (withMemories.length > 0) {
    const top = stableMax(withMemories, (p) => p.successRate);
    insights.push({
      type:        "highest_success_rate",
      projectId:   top.projectId,
      projectName: top.projectName,
      value:       top.successRate,
      description: `${top.projectName} has the highest success rate at ${top.successRate}%.`,
    });
  }

  if (withFailures.length > 0) {
    const top = stableMax(withFailures, (p) => p.failureRate);
    insights.push({
      type:        "highest_failure_rate",
      projectId:   top.projectId,
      projectName: top.projectName,
      value:       top.failureRate,
      description: `${top.projectName} has the highest failure rate at ${top.failureRate}%.`,
    });
  }

  if (withFailures.length > 0) {
    const top = stableMax(withFailures, (p) => p.failedCount);
    insights.push({
      type:        "most_engineering_incidents",
      projectId:   top.projectId,
      projectName: top.projectName,
      value:       top.failedCount,
      description: `${top.projectName} has the most engineering incidents with ${top.failedCount} failed ${top.failedCount === 1 ? "outcome" : "outcomes"}.`,
    });
  }

  if (memories.length > 0) {
    const [topDomain] = topK(memories.map((m) => m.domain), 1);
    if (topDomain) {
      const count = memories.filter((m) => m.domain === topDomain).length;
      insights.push({
        type:        "recurring_pattern",
        value:       topDomain,
        description: `'${topDomain}' is the most recurring engineering domain across the portfolio with ${count} recorded ${count === 1 ? "analysis" : "analyses"}.`,
      });
    }
  }

  return { summary, projectStats, insights };
}
