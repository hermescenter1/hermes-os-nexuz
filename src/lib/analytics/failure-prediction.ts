/**
 * Phase 26 — Pure Predictive Failure Engine.
 *
 * Computes a deterministic failure-likelihood score for each project using
 * four components: historical failure rate, average confidence, feedback
 * coverage, and knowledge staleness. No I/O, no side effects.
 */

import type { StoredProject, StoredMemory, StoredMemoryFeedback } from "@/lib/storage/types";

// ── Public types ───────────────────────────────────────────────────────────

export type FailureRiskLevel = "low" | "moderate" | "high" | "critical";

export type FailureFactorType =
  | "high_failure_rate"
  | "low_confidence"
  | "low_feedback"
  | "stale_knowledge";

export interface FailureFactor {
  type:         FailureFactorType;
  contribution: number;
}

export interface ProjectPrediction {
  projectId:            string;
  projectName:          string;
  failureScore:         number;
  riskLevel:            FailureRiskLevel;
  factors:              FailureFactor[];
  memoryCount:          number;
  predictionConfidence: number;
}

export interface PredictionSummary {
  totalProjects:   number;
  criticalCount:   number;
  highCount:       number;
  avgFailureScore: number;
  topRiskProject:  string | null;
}

export interface FailurePredictionResult {
  predictions: ProjectPrediction[];
  summary:     PredictionSummary;
}

// ── Constants ──────────────────────────────────────────────────────────────

const STALE_MS           = 90 * 24 * 60 * 60 * 1000;
const CRITICAL_THRESHOLD = 70;
const HIGH_THRESHOLD     = 50;
const MODERATE_THRESHOLD = 25;

// ── Internal helpers ───────────────────────────────────────────────────────

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 100);
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

function scoreToRisk(score: number): FailureRiskLevel {
  if (score >= CRITICAL_THRESHOLD) return "critical";
  if (score >= HIGH_THRESHOLD)     return "high";
  if (score >= MODERATE_THRESHOLD) return "moderate";
  return "low";
}

function predConfidence(memCount: number): number {
  if (memCount === 0) return 0;
  if (memCount <= 2)  return 30;
  if (memCount <= 5)  return 60;
  return 90;
}

function predictProject(
  project:            StoredProject,
  mems:               StoredMemory[],
  feedbackByMemoryId: Map<string, StoredMemoryFeedback[]>,
  now:                Date
): ProjectPrediction {
  const memCount = mems.length;

  if (memCount === 0) {
    return {
      projectId:            project.id,
      projectName:          project.name,
      failureScore:         0,
      riskLevel:            "low",
      factors:              [],
      memoryCount:          0,
      predictionConfidence: 0,
    };
  }

  const failedCnt    = mems.filter(m => m.outcome === "failed").length;
  const withFb       = mems.filter(m => (feedbackByMemoryId.get(m.id) ?? []).length > 0).length;
  const staleCnt     = mems.filter(
    m => m.outcome === "unknown" && (now.getTime() - new Date(m.createdAt).getTime()) > STALE_MS
  ).length;

  const failureRate  = pct(failedCnt, memCount);
  const avgConf      = avg(mems.map(m => m.confidence));
  const feedbackRate = pct(withFb, memCount);
  const staleRatio   = staleCnt / memCount;

  // Score components (weights sum to 100)
  const A = failureRate * 0.5;                        // 0–50 pts
  const B = Math.max(0, 50 - avgConf) * 0.4;         // 0–20 pts (fires below 50% confidence)
  const C = (1 - feedbackRate / 100) * 20;            // 0–20 pts (no feedback = higher risk)
  const D = staleRatio * 10;                           // 0–10 pts

  const failureScore = Math.min(100, Math.round(A + B + C + D));

  const factors: FailureFactor[] = [];
  if (A > 0) factors.push({ type: "high_failure_rate", contribution: Math.round(A) });
  if (B > 0) factors.push({ type: "low_confidence",   contribution: Math.round(B) });
  if (C > 0) factors.push({ type: "low_feedback",     contribution: Math.round(C) });
  if (D > 0) factors.push({ type: "stale_knowledge",  contribution: Math.round(D) });
  factors.sort((a, b) => b.contribution - a.contribution || a.type.localeCompare(b.type));

  return {
    projectId:            project.id,
    projectName:          project.name,
    failureScore,
    riskLevel:            scoreToRisk(failureScore),
    factors,
    memoryCount:          memCount,
    predictionConfidence: predConfidence(memCount),
  };
}

// ── Main export ────────────────────────────────────────────────────────────

export function computeFailurePredictions(
  projects:           StoredProject[],
  memories:           StoredMemory[],
  feedbackByMemoryId: Map<string, StoredMemoryFeedback[]>,
  now                 = new Date()
): FailurePredictionResult {
  if (projects.length === 0) {
    return {
      predictions: [],
      summary:     { totalProjects: 0, criticalCount: 0, highCount: 0, avgFailureScore: 0, topRiskProject: null },
    };
  }

  const predictions = projects
    .map(p => predictProject(p, memories.filter(m => m.projectId === p.id), feedbackByMemoryId, now))
    .sort((a, b) => {
      const ds = b.failureScore - a.failureScore;
      return ds !== 0 ? ds : a.projectId.localeCompare(b.projectId);
    });

  const criticalCount   = predictions.filter(p => p.riskLevel === "critical").length;
  const highCount       = predictions.filter(p => p.riskLevel === "high").length;
  const withData        = predictions.filter(p => p.memoryCount > 0);
  const avgFailureScore = withData.length === 0
    ? 0
    : Math.round(withData.reduce((s, p) => s + p.failureScore, 0) / withData.length);
  const topRiskProject  = predictions[0]?.riskLevel !== "low" ? predictions[0].projectName : null;

  return {
    predictions,
    summary: { totalProjects: predictions.length, criticalCount, highCount, avgFailureScore, topRiskProject },
  };
}
