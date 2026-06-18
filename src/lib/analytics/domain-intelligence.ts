/**
 * Phase 24 — Pure Domain Intelligence Engine.
 *
 * Computes per-domain analytics (confidence trends, outcome distribution,
 * top cases, top projects, cross-domain relationships) from pre-loaded
 * storage data. No I/O, no side effects, fully deterministic.
 */

import type {
  StoredProject,
  StoredMemory,
  StoredMemoryFeedback,
} from "@/lib/storage/types";

// ── Public types ───────────────────────────────────────────────────────────

export type DomainTrendDirection = "improving" | "stable" | "declining";

export interface DomainTrend {
  direction:       DomainTrendDirection;
  recentAvgConf:   number;
  baselineAvgConf: number;
}

export interface TopCase {
  caseId:      string;
  memoryCount: number;
}

export interface TopProject {
  projectId:   string;
  projectName: string;
  memoryCount: number;
}

export interface DomainSummary {
  name:          string;
  memoryCount:   number;
  avgConfidence: number;
  successRate:   number;
  failureRate:   number;
  feedbackRate:  number;
  healthScore:   number;
}

export interface DomainDetail extends DomainSummary {
  partialRate:    number;
  trend:          DomainTrend;
  topCases:       TopCase[];
  topProjects:    TopProject[];
  relatedDomains: string[];
}

export interface DomainListResult {
  totalDomains: number;
  domains:      DomainSummary[];
}

// ── Constants ──────────────────────────────────────────────────────────────

const TREND_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const TREND_THRESHOLD = 5;
const TOP_CASE_LIMIT  = 5;
const TOP_PROJ_LIMIT  = 5;

// ── Internal helpers ───────────────────────────────────────────────────────

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function healthScore(avgConf: number, successRate: number): number {
  return Math.round((avgConf + successRate) / 2);
}

function computeTrend(domainMems: StoredMemory[], now: Date): DomainTrend {
  const cutoff      = new Date(now.getTime() - TREND_WINDOW_MS);
  const recent      = domainMems.filter(m => new Date(m.createdAt) >= cutoff);
  const older       = domainMems.filter(m => new Date(m.createdAt) < cutoff);
  const recentAvgConf   = avg(recent.map(m => m.confidence));
  const baselineAvgConf = avg(older.map(m => m.confidence));

  let direction: DomainTrendDirection = "stable";
  if (recent.length > 0 && older.length > 0) {
    const delta = recentAvgConf - baselineAvgConf;
    if (delta >= TREND_THRESHOLD)       direction = "improving";
    else if (delta <= -TREND_THRESHOLD) direction = "declining";
  }
  return { direction, recentAvgConf, baselineAvgConf };
}

function computeTopCases(domainMems: StoredMemory[]): TopCase[] {
  const freq = new Map<string, number>();
  for (const m of domainMems) {
    for (const c of m.relatedCaseIds ?? []) {
      freq.set(c, (freq.get(c) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .map(([caseId, memoryCount]) => ({ caseId, memoryCount }))
    .sort((a, b) => {
      const dc = b.memoryCount - a.memoryCount;
      return dc !== 0 ? dc : a.caseId.localeCompare(b.caseId);
    })
    .slice(0, TOP_CASE_LIMIT);
}

function computeTopProjects(
  domainMems: StoredMemory[],
  projects:   StoredProject[]
): TopProject[] {
  const freq = new Map<string, number>();
  for (const m of domainMems) {
    if (m.projectId) freq.set(m.projectId, (freq.get(m.projectId) ?? 0) + 1);
  }
  const projMap = new Map(projects.map(p => [p.id, p.name]));
  return [...freq.entries()]
    .map(([projectId, memoryCount]) => ({
      projectId,
      projectName: projMap.get(projectId) ?? projectId,
      memoryCount,
    }))
    .sort((a, b) => {
      const dc = b.memoryCount - a.memoryCount;
      return dc !== 0 ? dc : a.projectId.localeCompare(b.projectId);
    })
    .slice(0, TOP_PROJ_LIMIT);
}

function computeRelatedDomains(
  targetDomain: string,
  allMemories:  StoredMemory[]
): string[] {
  const targetCases = new Set(
    allMemories
      .filter(m => m.domain === targetDomain)
      .flatMap(m => m.relatedCaseIds ?? [])
  );
  if (targetCases.size === 0) return [];

  const related = new Set<string>();
  for (const m of allMemories) {
    if (m.domain === targetDomain) continue;
    for (const c of m.relatedCaseIds ?? []) {
      if (targetCases.has(c)) {
        related.add(m.domain);
        break;
      }
    }
  }
  return [...related].sort();
}

function buildDomainDetail(
  name:               string,
  domainMems:         StoredMemory[],
  feedbackByMemoryId: Map<string, StoredMemoryFeedback[]>,
  projects:           StoredProject[],
  allMemories:        StoredMemory[],
  now:                Date
): DomainDetail {
  const count       = domainMems.length;
  const avgConf     = avg(domainMems.map(m => m.confidence));
  const successCnt  = domainMems.filter(m => m.outcome === "success").length;
  const failedCnt   = domainMems.filter(m => m.outcome === "failed").length;
  const partialCnt  = domainMems.filter(m => m.outcome === "partial").length;
  const withFb      = domainMems.filter(m => (feedbackByMemoryId.get(m.id) ?? []).length > 0).length;

  return {
    name,
    memoryCount:    count,
    avgConfidence:  avgConf,
    successRate:    pct(successCnt, count),
    failureRate:    pct(failedCnt,  count),
    partialRate:    pct(partialCnt, count),
    feedbackRate:   pct(withFb,     count),
    healthScore:    healthScore(avgConf, pct(successCnt, count)),
    trend:          computeTrend(domainMems, now),
    topCases:       computeTopCases(domainMems),
    topProjects:    computeTopProjects(domainMems, projects),
    relatedDomains: computeRelatedDomains(name, allMemories),
  };
}

// ── Main exports ───────────────────────────────────────────────────────────

export function computeDomainList(
  _projects:          StoredProject[],
  memories:           StoredMemory[],
  feedbackByMemoryId: Map<string, StoredMemoryFeedback[]>
): DomainListResult {
  const domainNames = [...new Set(memories.map(m => m.domain).filter(Boolean))];

  const domains: DomainSummary[] = domainNames
    .map(name => {
      const mems       = memories.filter(m => m.domain === name);
      const count      = mems.length;
      const avgConf    = avg(mems.map(m => m.confidence));
      const successCnt = mems.filter(m => m.outcome === "success").length;
      const failedCnt  = mems.filter(m => m.outcome === "failed").length;
      const withFb     = mems.filter(m => (feedbackByMemoryId.get(m.id) ?? []).length > 0).length;
      const succRate   = pct(successCnt, count);
      return {
        name,
        memoryCount:   count,
        avgConfidence: avgConf,
        successRate:   succRate,
        failureRate:   pct(failedCnt, count),
        feedbackRate:  pct(withFb,    count),
        healthScore:   healthScore(avgConf, succRate),
      };
    })
    .sort((a, b) => {
      const hc = b.healthScore - a.healthScore;
      return hc !== 0 ? hc : a.name.localeCompare(b.name);
    });

  return { totalDomains: domains.length, domains };
}

export function computeDomainDetail(
  domainName:         string,
  projects:           StoredProject[],
  memories:           StoredMemory[],
  feedbackByMemoryId: Map<string, StoredMemoryFeedback[]>,
  now                 = new Date()
): DomainDetail | null {
  const domainMems = memories.filter(m => m.domain === domainName);
  if (domainMems.length === 0) return null;
  return buildDomainDetail(domainName, domainMems, feedbackByMemoryId, projects, memories, now);
}
