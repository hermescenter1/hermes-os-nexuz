/**
 * Phase 27 — Project Health Agent (pure engine).
 *
 * Analyzes overall health of the project portfolio using failure scores,
 * memory coverage, and risk concentration. No I/O, no side effects.
 */

import type { StoredProject, StoredMemory, StoredMemoryFeedback } from "@/lib/storage/types";

// ── Public types ───────────────────────────────────────────────────────────

export interface ProjectAgentData {
  totalProjects:     number;
  portfolioScore:    number;   // 100 - avgFailureScore
  atRiskCount:       number;   // projects with failureScore >= AT_RISK_THRESHOLD
  memoryCoverage:    number;   // % projects with ≥1 memory
  riskConcentration: number;   // 0-100: ratio of at-risk projects × their avg severity
}

export interface ProjectAgentResult {
  agentId:  "project";
  score:    number;
  findings: string[];
  data:     ProjectAgentData;
}

// ── Constants ──────────────────────────────────────────────────────────────

const AT_RISK_THRESHOLD = 50;

// ── Helpers ────────────────────────────────────────────────────────────────

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 100);
}

function projectFailureScore(
  mems:               StoredMemory[],
  feedbackByMemoryId: Map<string, StoredMemoryFeedback[]>
): number {
  const memCount = mems.length;
  if (memCount === 0) return 0;

  const failedCnt    = mems.filter(m => m.outcome === "failed").length;
  const withFb       = mems.filter(m => (feedbackByMemoryId.get(m.id) ?? []).length > 0).length;
  const failureRate  = pct(failedCnt, memCount);
  const feedbackRate = pct(withFb, memCount);
  const avgConf      = Math.round(mems.reduce((s, m) => s + m.confidence, 0) / memCount);

  const A = failureRate * 0.5;
  const B = Math.max(0, 50 - avgConf) * 0.4;
  const C = (1 - feedbackRate / 100) * 20;

  return Math.min(100, Math.round(A + B + C));
}

// ── Main export ────────────────────────────────────────────────────────────

export function computeProjectAgent(
  projects:           StoredProject[],
  memories:           StoredMemory[],
  feedbackByMemoryId: Map<string, StoredMemoryFeedback[]>
): ProjectAgentResult {
  const totalProjects = projects.length;

  if (totalProjects === 0) {
    return {
      agentId:  "project",
      score:    0,
      findings: ["No projects found"],
      data: { totalProjects: 0, portfolioScore: 0, atRiskCount: 0, memoryCoverage: 0, riskConcentration: 0 },
    };
  }

  const scores = projects.map(p =>
    projectFailureScore(memories.filter(m => m.projectId === p.id), feedbackByMemoryId)
  );

  const avgFailureScore = Math.round(scores.reduce((s, v) => s + v, 0) / totalProjects);
  const portfolioScore  = Math.max(0, 100 - avgFailureScore);
  const atRiskCount     = scores.filter(s => s >= AT_RISK_THRESHOLD).length;
  const withMemory      = projects.filter(p => memories.some(m => m.projectId === p.id)).length;
  const memoryCoverage  = pct(withMemory, totalProjects);

  // Risk concentration: (at-risk ratio) × (avg at-risk severity)
  let riskConcentration = 0;
  if (atRiskCount > 0) {
    const atRiskScores = scores.filter(s => s >= AT_RISK_THRESHOLD);
    const avgAtRisk    = Math.round(atRiskScores.reduce((s, v) => s + v, 0) / atRiskScores.length);
    riskConcentration  = Math.round((atRiskCount / totalProjects) * (avgAtRisk / 100) * 100);
  }

  const findings: string[] = [];
  if (atRiskCount === 0)           findings.push("No projects at elevated risk");
  else                              findings.push(`${atRiskCount} project(s) at elevated risk`);
  if (memoryCoverage < 50)         findings.push("Many projects lack engineering memories");
  if (portfolioScore >= 75)        findings.push("Portfolio health is strong");
  else if (portfolioScore < 40)    findings.push("Portfolio health is critical");
  if (findings.length < 2 && portfolioScore >= 40 && portfolioScore < 75)
    findings.push("Portfolio health is moderate");

  return {
    agentId: "project",
    score:   portfolioScore,
    findings,
    data: { totalProjects, portfolioScore, atRiskCount, memoryCoverage, riskConcentration },
  };
}
