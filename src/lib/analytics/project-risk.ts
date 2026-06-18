import type {
  StoredProject,
  StoredMemory,
  StoredMemoryFeedback,
  MemoryOutcome,
} from "@/lib/storage/types";

// ── Types ──────────────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type RiskTrend = "increasing" | "stable" | "decreasing";
export type RiskHistorySource =
  | "project_created"
  | "outcome_resolved"
  | "outcome_failed"
  | "outcome_partial";

export interface RiskHistoryEntry {
  timestamp: string;
  riskLevel: RiskLevel;
  /** 0–100 composite risk score at this point in time. */
  score: number;
  reason: string;
  source: RiskHistorySource;
}

export interface CurrentRiskAssessment {
  score: number;
  riskLevel: RiskLevel;
  reason: string;
}

export interface RiskEvolutionResult {
  projectId: string;
  currentRisk: CurrentRiskAssessment;
  riskTrend: RiskTrend;
  history: RiskHistoryEntry[];
}

// ── Internal types ─────────────────────────────────────────────────────────

interface FlatFeedback {
  id: string;
  memoryId: string;
  outcome: Exclude<MemoryOutcome, "unknown">;
  domain: string;
  createdAt: string;
}

// ── Pure helpers ───────────────────────────────────────────────────────────

/**
 * Risk thresholds (0–100 composite score):
 *   0–19  → low
 *   20–39 → medium
 *   40–64 → high
 *   65–100 → critical
 *
 * Critical is only reachable under a multi-factor storm
 * (near-100 % failure rate + very low confidence + ≥5 recent incidents).
 */
export function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 65) return "critical";
  if (score >= 40) return "high";
  if (score >= 20) return "medium";
  return "low";
}

function buildReason(params: {
  riskLevel: RiskLevel;
  failedCount: number;
  partialCount: number;
  totalOutcomeFeedback: number;
  unresolvedCount: number;
  totalMemories: number;
  avgConfidence: number;
  recentFailures: number;
  resolvedCount: number;
}): string {
  const {
    riskLevel, failedCount, partialCount, totalOutcomeFeedback,
    unresolvedCount, totalMemories, avgConfidence,
    recentFailures, resolvedCount,
  } = params;

  if (totalMemories === 0) {
    return "No engineering activity recorded — monitoring only.";
  }

  const failPct = totalOutcomeFeedback > 0
    ? Math.round((failedCount / totalOutcomeFeedback) * 100)
    : 0;
  const conf = Math.round(avgConfidence);

  switch (riskLevel) {
    case "critical":
      if (recentFailures >= 3 && failPct >= 70) {
        return `Critical: ${failPct}% failure rate with ${recentFailures} recent incident(s) — immediate attention required.`;
      }
      return `Critical risk: sustained failures (${failedCount}) with low confidence (${conf}%) and recent incidents.`;

    case "high":
      if (recentFailures >= 2) {
        return `High risk: ${recentFailures} engineering failure(s) in the past 30 days indicate escalating activity.`;
      }
      return `High risk: ${failPct}% failure rate across ${totalOutcomeFeedback} recorded outcome(s).`;

    case "medium":
      if (unresolvedCount > 0 && failedCount > 0) {
        return `Moderate risk: ${failedCount} failure(s) alongside ${unresolvedCount} unresolved memory outcome(s).`;
      }
      if (unresolvedCount > 0 && partialCount > 0) {
        return `Moderate uncertainty: ${unresolvedCount} unresolved and ${partialCount} partial outcome(s) require follow-up.`;
      }
      if (unresolvedCount > totalMemories / 2) {
        return `Moderate uncertainty: ${unresolvedCount} of ${totalMemories} memories lack resolved outcomes.`;
      }
      return "Moderate risk: some failures or unresolved outcomes detected — continued monitoring recommended.";

    default: // low
      if (resolvedCount > 0) {
        return `Low risk: ${resolvedCount} resolved outcome(s) with acceptable failure rate — project on track.`;
      }
      return "Low risk: early-stage project with no significant failure pattern recorded.";
  }
}

/**
 * Computes the composite risk score and level at a given point in time,
 * using only memories and feedback that existed at or before `cutoffTs`.
 * `refTime` is the "now" used for the "last-30-days incident frequency" window.
 */
function computeRiskAtPoint(
  memories: StoredMemory[],
  allFlatFeedback: FlatFeedback[],
  cutoffTs: string,
  refTime: Date
): { score: number; riskLevel: RiskLevel; reason: string } {
  const cutoffDate = new Date(cutoffTs);
  const memoriesAtT  = memories.filter(m => new Date(m.createdAt) <= cutoffDate);
  const feedbackAtT  = allFlatFeedback.filter(f => new Date(f.createdAt) <= cutoffDate);

  const totalMemories        = memoriesAtT.length;
  const memoriesWithFeedback = new Set(feedbackAtT.map(f => f.memoryId));
  const unresolvedCount      = memoriesAtT.filter(m => !memoriesWithFeedback.has(m.id)).length;

  const failedCount   = feedbackAtT.filter(f => f.outcome === "failed").length;
  const partialCount  = feedbackAtT.filter(f => f.outcome === "partial").length;
  const resolvedCount = feedbackAtT.filter(f => f.outcome === "success").length;
  const totalOutcomeFeedback = feedbackAtT.length;

  // Incidents in the 30 days leading up to refTime
  const thirtyDaysBefore = new Date(refTime.getTime() - 30 * 24 * 3_600_000);
  const recentFailures   = feedbackAtT.filter(
    f => f.outcome === "failed" && new Date(f.createdAt) >= thirtyDaysBefore
  ).length;

  const avgConfidence = totalMemories > 0
    ? memoriesAtT.reduce((sum, m) => sum + m.confidence, 0) / totalMemories
    : 100; // no memories → neutral contribution

  // Score components (weights sum to 100)
  const failureComponent    = totalOutcomeFeedback > 0
    ? (failedCount  / totalOutcomeFeedback) * 40 : 0;
  const partialComponent    = totalOutcomeFeedback > 0
    ? (partialCount / totalOutcomeFeedback) * 10 : 0;
  const unresolvedComponent = totalMemories > 0
    ? (unresolvedCount / totalMemories) * 20 : 0;
  const lowConfComponent    = ((100 - avgConfidence) / 100) * 15;
  const incidentComponent   = Math.min(recentFailures / 5, 1) * 15;

  const rawScore = failureComponent + partialComponent + unresolvedComponent
                 + lowConfComponent + incidentComponent;
  const score    = Math.round(Math.min(rawScore, 100));
  const riskLevel = scoreToRiskLevel(score);
  const reason    = buildReason({
    riskLevel, failedCount, partialCount, totalOutcomeFeedback,
    unresolvedCount, totalMemories, avgConfidence, recentFailures, resolvedCount,
  });

  return { score, riskLevel, reason };
}

function computeTrend(history: RiskHistoryEntry[], now: Date): RiskTrend {
  if (history.length < 2) return "stable";

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3_600_000);
  const pastEntries   = history.filter(h => new Date(h.timestamp) < thirtyDaysAgo);
  if (pastEntries.length === 0) return "stable";

  const past    = pastEntries[pastEntries.length - 1];
  const current = history[history.length - 1];
  const diff    = current.score - past.score;

  if (diff >  5) return "increasing";
  if (diff < -5) return "decreasing";
  return "stable";
}

// ── Core risk evolution engine ─────────────────────────────────────────────

/**
 * Pure, deterministic risk evolution engine — no I/O, no side effects.
 *
 * Generates a full risk history by replaying every outcome event in
 * chronological order and computing the composite risk score at each
 * point using only the data that existed at that time.
 */
export function computeProjectRisk(
  project: StoredProject,
  memories: StoredMemory[],
  feedbackByMemoryId: Map<string, StoredMemoryFeedback[]>,
  now = new Date()
): RiskEvolutionResult {

  // Flatten non-unknown outcome feedback, sorted chronologically
  const allFlatFeedback: FlatFeedback[] = [];
  for (const memory of memories) {
    for (const fb of feedbackByMemoryId.get(memory.id) ?? []) {
      if (fb.outcome !== "unknown") {
        allFlatFeedback.push({
          id: fb.id,
          memoryId: fb.memoryId,
          outcome: fb.outcome as Exclude<MemoryOutcome, "unknown">,
          domain: memory.domain,
          createdAt: fb.createdAt,
        });
      }
    }
  }
  allFlatFeedback.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const history: RiskHistoryEntry[] = [];

  // Baseline entry at project creation
  const init = computeRiskAtPoint(
    memories, allFlatFeedback,
    project.createdAt, new Date(project.createdAt)
  );
  history.push({
    timestamp: project.createdAt,
    riskLevel: init.riskLevel,
    score:     init.score,
    reason:    "Initial assessment: project created with no activity recorded.",
    source:    "project_created",
  });

  // One entry per outcome-affecting feedback event
  for (const fb of allFlatFeedback) {
    const risk = computeRiskAtPoint(
      memories, allFlatFeedback,
      fb.createdAt, new Date(fb.createdAt)
    );
    const source: RiskHistorySource =
      fb.outcome === "success" ? "outcome_resolved" :
      fb.outcome === "failed"  ? "outcome_failed" :
      "outcome_partial";
    const reason =
      fb.outcome === "success" ? `Resolved outcome in domain '${fb.domain}' — risk profile improved.` :
      fb.outcome === "failed"  ? `Failure in domain '${fb.domain}' — risk elevated.` :
      `Partial outcome in domain '${fb.domain}' — ongoing monitoring recommended.`;

    history.push({
      timestamp: fb.createdAt,
      riskLevel: risk.riskLevel,
      score:     risk.score,
      reason,
      source,
    });
  }

  // Current risk as of `now`
  const current = computeRiskAtPoint(
    memories, allFlatFeedback, now.toISOString(), now
  );

  return {
    projectId:   project.id,
    currentRisk: { score: current.score, riskLevel: current.riskLevel, reason: current.reason },
    riskTrend:   computeTrend(history, now),
    history,
  };
}
