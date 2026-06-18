import type {
  StoredProject,
  StoredMemory,
  StoredMemoryFeedback,
} from "@/lib/storage/types";
import { computeProjectRisk } from "./project-risk";
import type { RiskLevel } from "./project-risk";

// ── Public types ───────────────────────────────────────────────────────────

export type { RiskLevel } from "./project-risk";

export interface BenchmarkSummary {
  totalProjects:     number;
  activeProjects:    number;
  completedProjects: number;
  archivedProjects:  number;
}

export interface BenchmarkLeader {
  projectId:   string;
  projectName: string;
  value:       number;
  riskLevel:   RiskLevel;
}

export interface ProjectLeaders {
  highestSuccessRate: BenchmarkLeader | null;
  highestRisk:        BenchmarkLeader | null;
  mostActive:         BenchmarkLeader | null;
  mostMemories:       BenchmarkLeader | null;
  mostIncidents:      BenchmarkLeader | null;
  bestConfidence:     BenchmarkLeader | null;
}

export interface RankingEntry {
  rank:        number;
  projectId:   string;
  projectName: string;
  status:      string;
  value:       number;
  riskLevel:   RiskLevel;
}

export interface BenchmarkRankings {
  successRate: RankingEntry[];
  riskScore:   RankingEntry[];
  activity:    RankingEntry[];
  confidence:  RankingEntry[];
}

export type BenchmarkInsightType =
  | "top_performer"
  | "highest_risk"
  | "fastest_improving"
  | "most_incidents"
  | "most_active"
  | "portfolio_health";

export interface BenchmarkInsight {
  type:         BenchmarkInsightType;
  projectId?:   string;
  projectName?: string;
  value:        string | number;
  description:  string;
}

export interface BenchmarkResult {
  summary:  BenchmarkSummary;
  leaders:  ProjectLeaders;
  rankings: BenchmarkRankings;
  insights: BenchmarkInsight[];
}

// ── Internal per-project stats type ───────────────────────────────────────

interface ProjectStats {
  projectId:            string;
  projectName:          string;
  status:               string;
  memoryCount:          number;
  successCount:         number;
  failedCount:          number;
  partialCount:         number;
  unknownCount:         number;
  totalOutcomeFeedback: number;
  successRate:          number;   // integer 0–100
  failureRate:          number;   // integer 0–100
  resolutionRate:       number;   // integer 0–100
  avgConfidence:        number;   // integer 0–100 (0 when no memories)
  riskScore:            number;   // integer 0–100 from Phase 20C engine
  riskLevel:            RiskLevel;
  activityScore:        number;   // memoryCount + all feedback count
  incidentCount:        number;   // = failedCount
  improvement:          number;   // pastRiskScore – currentRiskScore over 30d (positive = improved)
  topDomains:           string[];
}

// ── Pure helpers ───────────────────────────────────────────────────────────

/** Max by value DESC, tie-broken alphabetically by projectId ASC. */
function stableMaxBy(
  items: ProjectStats[],
  getValue: (s: ProjectStats) => number
): ProjectStats {
  return items.reduce((best, curr) => {
    const bv = getValue(best);
    const cv = getValue(curr);
    if (cv > bv)                                      return curr;
    if (cv === bv && curr.projectId < best.projectId) return curr;
    return best;
  });
}

function toLeader(s: ProjectStats, value: number): BenchmarkLeader {
  return { projectId: s.projectId, projectName: s.projectName, value, riskLevel: s.riskLevel };
}

function topKDomains(memories: StoredMemory[], k = 3): string[] {
  const counts = new Map<string, number>();
  for (const m of memories) counts.set(m.domain, (counts.get(m.domain) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, k)
    .map(([d]) => d);
}

/** Build stats for one project using its memories + global feedback map. */
function buildProjectStats(
  project:           StoredProject,
  memories:          StoredMemory[],
  feedbackByMemId:   Map<string, StoredMemoryFeedback[]>,
  now:               Date
): ProjectStats {
  // Sub-map with only this project's memory entries
  const projectFbMap = new Map<string, StoredMemoryFeedback[]>();
  for (const m of memories) {
    const fbs = feedbackByMemId.get(m.id);
    if (fbs) projectFbMap.set(m.id, fbs);
  }

  const allFeedback = memories.flatMap(m => feedbackByMemId.get(m.id) ?? []);
  const outcomeFb   = allFeedback.filter(f => f.outcome !== "unknown");

  const successCount = outcomeFb.filter(f => f.outcome === "success").length;
  const failedCount  = outcomeFb.filter(f => f.outcome === "failed").length;
  const partialCount = outcomeFb.filter(f => f.outcome === "partial").length;
  const unknownCount = allFeedback.filter(f => f.outcome === "unknown").length;
  const totalOutcomeFeedback = outcomeFb.length;

  const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 100) : 0;

  const successRate    = pct(successCount, totalOutcomeFeedback);
  const failureRate    = pct(failedCount,  totalOutcomeFeedback);

  const resolvedCount  = memories.filter(
    m => (feedbackByMemId.get(m.id) ?? []).some(f => f.outcome !== "unknown")
  ).length;
  const resolutionRate = pct(resolvedCount, memories.length);

  const avgConfidence  = memories.length > 0
    ? Math.round(memories.reduce((s, m) => s + m.confidence, 0) / memories.length) : 0;

  const activityScore  = memories.length + allFeedback.length;

  // Risk evolution via Phase 20C engine — also gives us history for improvement
  const riskResult = computeProjectRisk(project, memories, projectFbMap, now);

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3_600_000);
  const pastEntries   = riskResult.history.filter(h => new Date(h.timestamp) < thirtyDaysAgo);
  const pastScore     = pastEntries.length > 0 ? pastEntries[pastEntries.length - 1].score : null;
  const improvement   = pastScore !== null ? pastScore - riskResult.currentRisk.score : 0;

  return {
    projectId:   project.id,
    projectName: project.name,
    status:      project.status,
    memoryCount: memories.length,
    successCount, failedCount, partialCount, unknownCount,
    totalOutcomeFeedback,
    successRate, failureRate, resolutionRate,
    avgConfidence,
    riskScore:   riskResult.currentRisk.score,
    riskLevel:   riskResult.currentRisk.riskLevel,
    activityScore,
    incidentCount: failedCount,
    improvement,
    topDomains:  topKDomains(memories),
  };
}

function buildLeaders(stats: ProjectStats[]): ProjectLeaders {
  if (stats.length === 0) {
    return {
      highestSuccessRate: null, highestRisk: null, mostActive: null,
      mostMemories: null, mostIncidents: null, bestConfidence: null,
    };
  }

  const topSuccessRate = stableMaxBy(stats, s => s.successRate);
  const topRisk        = stableMaxBy(stats, s => s.riskScore);
  const topActive      = stableMaxBy(stats, s => s.activityScore);
  const topMemories    = stableMaxBy(stats, s => s.memoryCount);
  const topIncidents   = stableMaxBy(stats, s => s.incidentCount);
  const confStats      = stats.filter(s => s.memoryCount > 0);
  const topConf        = confStats.length > 0 ? stableMaxBy(confStats, s => s.avgConfidence) : null;

  return {
    highestSuccessRate: toLeader(topSuccessRate, topSuccessRate.successRate),
    highestRisk:        toLeader(topRisk,        topRisk.riskScore),
    mostActive:         toLeader(topActive,       topActive.activityScore),
    mostMemories:       toLeader(topMemories,     topMemories.memoryCount),
    mostIncidents:      topIncidents.incidentCount > 0 ? toLeader(topIncidents, topIncidents.incidentCount) : null,
    bestConfidence:     topConf ? toLeader(topConf, topConf.avgConfidence) : null,
  };
}

function buildRankings(stats: ProjectStats[]): BenchmarkRankings {
  const rankBy = (getValue: (s: ProjectStats) => number): RankingEntry[] =>
    [...stats]
      .sort((a, b) => {
        const diff = getValue(b) - getValue(a);
        return diff !== 0 ? diff : a.projectId.localeCompare(b.projectId);
      })
      .map((s, i) => ({
        rank:        i + 1,
        projectId:   s.projectId,
        projectName: s.projectName,
        status:      s.status,
        value:       getValue(s),
        riskLevel:   s.riskLevel,
      }));

  return {
    successRate: rankBy(s => s.successRate),
    riskScore:   rankBy(s => s.riskScore),
    activity:    rankBy(s => s.activityScore),
    confidence:  rankBy(s => s.avgConfidence),
  };
}

function buildInsights(stats: ProjectStats[]): BenchmarkInsight[] {
  if (stats.length === 0) return [];

  const insights: BenchmarkInsight[] = [];

  // Top performer — only projects with at least one outcome
  const withOutcomes = stats.filter(s => s.totalOutcomeFeedback > 0);
  if (withOutcomes.length > 0) {
    const top = stableMaxBy(withOutcomes, s => s.successRate);
    insights.push({
      type: "top_performer",
      projectId: top.projectId, projectName: top.projectName,
      value: top.successRate,
      description: `${top.projectName} leads the portfolio with a ${top.successRate}% success rate across ${top.totalOutcomeFeedback} outcome(s).`,
    });
  }

  // Highest risk
  const topRisk = stableMaxBy(stats, s => s.riskScore);
  if (topRisk.riskScore > 0) {
    insights.push({
      type: "highest_risk",
      projectId: topRisk.projectId, projectName: topRisk.projectName,
      value: topRisk.riskScore,
      description: `${topRisk.projectName} carries the highest portfolio risk (score ${topRisk.riskScore}, level: ${topRisk.riskLevel}).`,
    });
  }

  // Fastest improving — must have improved > 5 points in last 30 days
  const improving = stats.filter(s => s.improvement > 5);
  if (improving.length > 0) {
    const best = stableMaxBy(improving, s => s.improvement);
    insights.push({
      type: "fastest_improving",
      projectId: best.projectId, projectName: best.projectName,
      value: best.improvement,
      description: `${best.projectName} improved the most, with risk score dropping ${best.improvement} points in the past 30 days.`,
    });
  }

  // Most incident-prone
  const withIncidents = stats.filter(s => s.incidentCount > 0);
  if (withIncidents.length > 0) {
    const most = stableMaxBy(withIncidents, s => s.incidentCount);
    insights.push({
      type: "most_incidents",
      projectId: most.projectId, projectName: most.projectName,
      value: most.incidentCount,
      description: `${most.projectName} has the most engineering incidents (${most.incidentCount} failure(s)).`,
    });
  }

  // Most active
  const withActivity = stats.filter(s => s.activityScore > 0);
  if (withActivity.length > 0) {
    const active = stableMaxBy(withActivity, s => s.activityScore);
    insights.push({
      type: "most_active",
      projectId: active.projectId, projectName: active.projectName,
      value: active.activityScore,
      description: `${active.projectName} is the most active project with ${active.activityScore} total engineering event(s).`,
    });
  }

  // Portfolio health (always present when there are projects)
  const n           = stats.length;
  const avgRisk     = Math.round(stats.reduce((s, p) => s + p.riskScore, 0) / n);
  const withOutcome = stats.filter(s => s.totalOutcomeFeedback > 0);
  const avgSuccess  = withOutcome.length > 0
    ? Math.round(withOutcome.reduce((s, p) => s + p.successRate, 0) / withOutcome.length) : 0;
  const health      = avgRisk < 20 && avgSuccess > 60 ? "healthy" :
                      avgRisk < 40                    ? "moderate" : "at_risk";
  insights.push({
    type: "portfolio_health",
    value: health,
    description: `Portfolio health: ${health}. Average risk score ${avgRisk}, average success rate ${avgSuccess}%.`,
  });

  return insights;
}

// ── Core benchmark engine ──────────────────────────────────────────────────

/**
 * Pure, deterministic benchmarking engine — no I/O, no side effects.
 *
 * Computes per-project metrics by delegating risk evolution to the Phase 20C
 * engine (one call per project), then aggregates into leaders, ranked lists,
 * and portfolio insights.
 */
export function computeProjectBenchmark(
  projects:          StoredProject[],
  memories:          StoredMemory[],
  feedbackByMemoryId: Map<string, StoredMemoryFeedback[]>,
  now = new Date()
): BenchmarkResult {
  const summary: BenchmarkSummary = {
    totalProjects:     projects.length,
    activeProjects:    projects.filter(p => p.status === "active").length,
    completedProjects: projects.filter(p => p.status === "completed").length,
    archivedProjects:  projects.filter(p => p.status === "archived").length,
  };

  if (projects.length === 0) {
    return {
      summary,
      leaders: {
        highestSuccessRate: null, highestRisk: null, mostActive: null,
        mostMemories: null, mostIncidents: null, bestConfidence: null,
      },
      rankings: { successRate: [], riskScore: [], activity: [], confidence: [] },
      insights: [],
    };
  }

  const allStats = projects.map(project =>
    buildProjectStats(
      project,
      memories.filter(m => m.projectId === project.id),
      feedbackByMemoryId,
      now
    )
  );

  return {
    summary,
    leaders:  buildLeaders(allStats),
    rankings: buildRankings(allStats),
    insights: buildInsights(allStats),
  };
}
