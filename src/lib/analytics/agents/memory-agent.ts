/**
 * Phase 27 — Memory Intelligence Agent (pure engine).
 *
 * Analyzes the quality and coverage of the engineering memory corpus.
 * No I/O, no side effects, fully deterministic.
 */

import type { StoredMemory, StoredMemoryFeedback } from "@/lib/storage/types";

// ── Public types ───────────────────────────────────────────────────────────

export type LearningVelocity = "accelerating" | "stable" | "decelerating";

export interface MemoryAgentData {
  totalMemories:        number;
  qualityScore:         number;        // avg confidence 0-100
  feedbackCompleteness: number;        // % memories with ≥1 feedback
  successRate:          number;        // % outcome = success
  coverageGaps:         string[];      // domains with < GAP_THRESHOLD memories, sorted ASC
  learningVelocity:     LearningVelocity;
}

export interface MemoryAgentResult {
  agentId:  "memory";
  score:    number;      // 0-100 composite quality
  findings: string[];
  data:     MemoryAgentData;
}

// ── Constants ──────────────────────────────────────────────────────────────

const GAP_THRESHOLD      = 3;
const VELOCITY_THRESHOLD = 2;
const EMERGING_MS        = 30 * 24 * 60 * 60 * 1000;

// ── Helpers ────────────────────────────────────────────────────────────────

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 100);
}

// ── Main export ────────────────────────────────────────────────────────────

export function computeMemoryAgent(
  memories:           StoredMemory[],
  feedbackByMemoryId: Map<string, StoredMemoryFeedback[]>,
  now                 = new Date()
): MemoryAgentResult {
  const total = memories.length;

  if (total === 0) {
    return {
      agentId:  "memory",
      score:    0,
      findings: ["No engineering memories found"],
      data: {
        totalMemories:        0,
        qualityScore:         0,
        feedbackCompleteness: 0,
        successRate:          0,
        coverageGaps:         [],
        learningVelocity:     "stable",
      },
    };
  }

  const qualityScore         = avg(memories.map(m => m.confidence));
  const withFb               = memories.filter(m => (feedbackByMemoryId.get(m.id) ?? []).length > 0).length;
  const feedbackCompleteness = pct(withFb, total);
  const successRate          = pct(memories.filter(m => m.outcome === "success").length, total);

  // Domain coverage gaps: domains that exist but have < GAP_THRESHOLD memories
  const domainCounts = new Map<string, number>();
  for (const m of memories) {
    domainCounts.set(m.domain, (domainCounts.get(m.domain) ?? 0) + 1);
  }
  const coverageGaps = [...domainCounts.entries()]
    .filter(([, count]) => count < GAP_THRESHOLD)
    .map(([d]) => d)
    .sort();

  // Learning velocity: last 30 days vs prior 30 days
  const nowMs   = now.getTime();
  const cut30   = nowMs - EMERGING_MS;
  const cut60   = nowMs - 2 * EMERGING_MS;
  const recent  = memories.filter(m => new Date(m.createdAt).getTime() >= cut30).length;
  const prior   = memories.filter(m => {
    const t = new Date(m.createdAt).getTime();
    return t >= cut60 && t < cut30;
  }).length;

  let learningVelocity: LearningVelocity = "stable";
  if (recent - prior > VELOCITY_THRESHOLD)  learningVelocity = "accelerating";
  else if (prior - recent > VELOCITY_THRESHOLD) learningVelocity = "decelerating";

  // Composite score: quality×0.4 + feedback×0.3 + success×0.2 + no-gap×0.1
  const gapPenalty = Math.min(100, coverageGaps.length * 10);
  const score      = Math.min(100, Math.max(0, Math.round(
    qualityScore * 0.4 +
    feedbackCompleteness * 0.3 +
    successRate * 0.2 +
    (100 - gapPenalty) * 0.1
  )));

  const findings: string[] = [];
  if (qualityScore >= 70)           findings.push("High average memory confidence");
  else if (qualityScore < 40)       findings.push("Low average memory confidence");
  if (feedbackCompleteness < 30)    findings.push("Feedback coverage is insufficient");
  if (coverageGaps.length > 0)      findings.push(`Coverage gaps in ${coverageGaps.length} domain(s)`);
  if (learningVelocity === "accelerating")  findings.push("Learning velocity is accelerating");
  else if (learningVelocity === "decelerating") findings.push("Learning velocity is slowing");
  if (findings.length === 0)        findings.push("Memory corpus is healthy");

  return {
    agentId: "memory",
    score,
    findings,
    data: { totalMemories: total, qualityScore, feedbackCompleteness, successRate, coverageGaps, learningVelocity },
  };
}
