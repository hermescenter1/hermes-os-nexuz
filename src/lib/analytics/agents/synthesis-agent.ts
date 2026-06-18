/**
 * Phase 27 — Synthesis Agent (pure engine).
 *
 * Cross-correlates findings from Memory, Project, and Domain agents to
 * produce meta-insights, prioritized actions, and a system intelligence
 * grade. No I/O, no side effects, fully deterministic.
 */

import type { MemoryAgentResult } from "./memory-agent";
import type { ProjectAgentResult } from "./project-agent";
import type { DomainAgentResult }  from "./domain-agent";

// ── Public types ───────────────────────────────────────────────────────────

export type CorrelationType =
  | "low_memory_high_risk"
  | "domain_gap_risk"
  | "knowledge_ready"
  | "feedback_bottleneck"
  | "expertise_concentration";

export type CorrelationSeverity = "info" | "warning" | "critical";

export interface Correlation {
  type:        CorrelationType;
  description: string;
  severity:    CorrelationSeverity;
}

export interface PrioritizedAction {
  rank:   number;
  action: string;
  impact: "high" | "medium" | "low";
  agents: string[];
}

export type IntelligenceGrade = "A" | "B" | "C" | "D" | "F";

export interface SynthesisData {
  systemCoherenceScore: number;
  correlations:         Correlation[];
  prioritizedActions:   PrioritizedAction[];
  intelligenceGrade:    IntelligenceGrade;
}

export interface SynthesisResult {
  agentId:  "synthesis";
  score:    number;
  findings: string[];
  data:     SynthesisData;
}

// ── Constants ──────────────────────────────────────────────────────────────

const SEV_ORDER: Record<CorrelationSeverity, number> = { critical: 0, warning: 1, info: 2 };
const IMPACT_ORDER: Record<"high" | "medium" | "low", number> = { high: 0, medium: 1, low: 2 };

// ── Helpers ────────────────────────────────────────────────────────────────

function scoreToGrade(score: number): IntelligenceGrade {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

// ── Main export ────────────────────────────────────────────────────────────

export function computeSynthesisAgent(
  memory:       MemoryAgentResult,
  project:      ProjectAgentResult,
  domain:       DomainAgentResult,
  overallScore: number
): SynthesisResult {
  // System coherence: inverse of the spread across agent scores
  const scores   = [memory.score, project.score, domain.score];
  const maxDiff  = Math.max(...scores) - Math.min(...scores);
  const systemCoherenceScore = Math.max(0, Math.round(100 - maxDiff * 0.5));

  // ── Deterministic correlation rules ──────────────────────────────────────

  const correlations: Correlation[] = [];

  // Rule 1: at-risk projects with low memory coverage
  if (project.data.atRiskCount > 0 && project.data.memoryCoverage < 50) {
    correlations.push({
      type:        "low_memory_high_risk",
      description: `${project.data.atRiskCount} at-risk project(s) have insufficient engineering memory coverage`,
      severity:    "critical",
    });
  }

  // Rule 2: domain critical gaps correlate with project risk
  if (domain.data.criticalGaps.length > 0 && project.data.atRiskCount > 0) {
    correlations.push({
      type:        "domain_gap_risk",
      description: `Domain expertise gaps in ${domain.data.criticalGaps.length} area(s) correlate with project risk`,
      severity:    "warning",
    });
  }

  // Rule 3: all three dimensions are healthy
  if (memory.score >= 70 && project.score >= 70 && domain.score >= 70) {
    correlations.push({
      type:        "knowledge_ready",
      description: "System knowledge is mature and project risk is well-managed",
      severity:    "info",
    });
  }

  // Rule 4: many memories but low feedback completeness
  if (memory.data.totalMemories >= 5 && memory.data.feedbackCompleteness < 30) {
    correlations.push({
      type:        "feedback_bottleneck",
      description: `${memory.data.totalMemories} memories exist but feedback completeness is only ${memory.data.feedbackCompleteness}%`,
      severity:    "warning",
    });
  }

  // Rule 5: narrow expertise despite having multiple domains
  if (domain.data.totalDomains >= 3 && domain.data.expertiseBreadth < 30) {
    correlations.push({
      type:        "expertise_concentration",
      description: `Expertise is concentrated — only ${domain.data.expertiseBreadth}% of domains have deep coverage`,
      severity:    "warning",
    });
  }

  // Sort: critical → warning → info, then type ASC for determinism
  correlations.sort((a, b) => {
    const ds = SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
    return ds !== 0 ? ds : a.type.localeCompare(b.type);
  });

  // ── Prioritized actions (up to 5) ────────────────────────────────────────

  type RawAction = { action: string; impact: "high" | "medium" | "low"; agents: string[]; order: number };
  const rawActions: RawAction[] = [];
  let seq = 0;

  if (project.data.atRiskCount > 0)
    rawActions.push({ action: "Review and address at-risk project memories",          impact: "high",   agents: ["project", "synthesis"], order: seq++ });
  if (memory.data.totalMemories > 0 && memory.data.feedbackCompleteness < 30)
    rawActions.push({ action: "Collect feedback on existing engineering memories",     impact: "high",   agents: ["memory", "synthesis"],  order: seq++ });
  if (domain.data.criticalGaps.length > 0)
    rawActions.push({ action: "Document knowledge in under-covered domains",           impact: "medium", agents: ["domain"],               order: seq++ });
  if (memory.data.coverageGaps.length > 0)
    rawActions.push({ action: "Expand memory coverage for gap domains",                impact: "medium", agents: ["memory", "domain"],     order: seq++ });
  if (project.data.totalProjects > 0 && project.data.memoryCoverage < 50)
    rawActions.push({ action: "Link engineering memories to projects",                 impact: "medium", agents: ["project", "memory"],    order: seq++ });
  if (memory.data.learningVelocity === "decelerating")
    rawActions.push({ action: "Encourage new memory capture to maintain learning velocity", impact: "low", agents: ["memory"],            order: seq++ });

  // Sort: high → medium → low, then insertion order for ties
  rawActions.sort((a, b) => {
    const di = IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact];
    return di !== 0 ? di : a.order - b.order;
  });

  const prioritizedActions: PrioritizedAction[] = rawActions.slice(0, 5).map((a, i) => ({
    rank:   i + 1,
    action: a.action,
    impact: a.impact,
    agents: a.agents,
  }));

  const intelligenceGrade = scoreToGrade(overallScore);

  // ── Findings ──────────────────────────────────────────────────────────────

  const findings: string[] = [];
  findings.push(`System intelligence grade: ${intelligenceGrade} (score: ${overallScore})`);
  if (correlations.some(c => c.severity === "critical"))
    findings.push("Critical correlation detected — immediate action required");
  if (systemCoherenceScore < 50)
    findings.push("Low system coherence — knowledge, project, and domain health are misaligned");
  if (prioritizedActions.length === 0)
    findings.push("No improvement actions required");

  return {
    agentId: "synthesis",
    score:   systemCoherenceScore,
    findings,
    data: { systemCoherenceScore, correlations, prioritizedActions, intelligenceGrade },
  };
}
