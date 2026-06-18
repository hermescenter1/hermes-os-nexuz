/**
 * Phase 27 — Multi-Agent Engineering Intelligence Orchestrator.
 *
 * Loads all data once, then runs four agents concurrently with full
 * failure isolation per agent. Never throws to the route.
 */

import { listProjects }                     from "@/lib/memory/project-service";
import { listEngineeringMemories, getEngineeringMemory } from "@/lib/memory/memory-service";
import { computeMemoryAgent }               from "@/lib/analytics/agents/memory-agent";
import { computeProjectAgent }              from "@/lib/analytics/agents/project-agent";
import { computeDomainAgent }               from "@/lib/analytics/agents/domain-agent";
import { computeSynthesisAgent }            from "@/lib/analytics/agents/synthesis-agent";
import type { MemoryAgentResult }           from "@/lib/analytics/agents/memory-agent";
import type { ProjectAgentResult }          from "@/lib/analytics/agents/project-agent";
import type { DomainAgentResult }           from "@/lib/analytics/agents/domain-agent";
import type { SynthesisResult }             from "@/lib/analytics/agents/synthesis-agent";
import type { StoredProject, StoredMemory, StoredMemoryFeedback } from "@/lib/storage/types";

// ── Public types ───────────────────────────────────────────────────────────

export type AgentStatus = "success" | "degraded";

export type AgentResultWithStatus<T> = T & { status: AgentStatus };

export interface MultiAgentResult {
  generatedAt:  string;
  overallScore: number;
  memory:       AgentResultWithStatus<MemoryAgentResult>;
  project:      AgentResultWithStatus<ProjectAgentResult>;
  domain:       AgentResultWithStatus<DomainAgentResult>;
  synthesis:    AgentResultWithStatus<SynthesisResult>;
}

// Re-export pure-engine types for API consumers
export type {
  MemoryAgentResult, MemoryAgentData, LearningVelocity,
} from "@/lib/analytics/agents/memory-agent";
export type {
  ProjectAgentResult, ProjectAgentData,
} from "@/lib/analytics/agents/project-agent";
export type {
  DomainAgentResult, DomainAgentData,
} from "@/lib/analytics/agents/domain-agent";
export type {
  SynthesisResult, SynthesisData, Correlation, CorrelationType,
  CorrelationSeverity, PrioritizedAction, IntelligenceGrade,
} from "@/lib/analytics/agents/synthesis-agent";

// ── Degraded defaults (used when an agent throws) ─────────────────────────

const DEGRADED_MEMORY: AgentResultWithStatus<MemoryAgentResult> = {
  agentId: "memory", status: "degraded", score: 0,
  findings: ["Agent unavailable"],
  data: { totalMemories: 0, qualityScore: 0, feedbackCompleteness: 0, successRate: 0, coverageGaps: [], learningVelocity: "stable" },
};

const DEGRADED_PROJECT: AgentResultWithStatus<ProjectAgentResult> = {
  agentId: "project", status: "degraded", score: 0,
  findings: ["Agent unavailable"],
  data: { totalProjects: 0, portfolioScore: 0, atRiskCount: 0, memoryCoverage: 0, riskConcentration: 0 },
};

const DEGRADED_DOMAIN: AgentResultWithStatus<DomainAgentResult> = {
  agentId: "domain", status: "degraded", score: 0,
  findings: ["Agent unavailable"],
  data: { totalDomains: 0, expertiseBreadth: 0, expertiseDepth: 0, emergingDomains: [], criticalGaps: [] },
};

// ── Orchestrator ───────────────────────────────────────────────────────────

export async function runMultiAgentAnalysis(): Promise<MultiAgentResult> {
  let projects: StoredProject[] = [];
  let memories: StoredMemory[]  = [];

  try { projects = await listProjects();             } catch { /* degrade */ }
  try { memories = await listEngineeringMemories(0); } catch { /* degrade */ }

  const feedbackByMemoryId = new Map<string, StoredMemoryFeedback[]>();
  await Promise.allSettled(
    memories.map(async m => {
      try {
        const full = await getEngineeringMemory(m.id);
        if (full && full.feedback.length > 0) feedbackByMemoryId.set(m.id, full.feedback);
      } catch { /* skip this memory's feedback */ }
    })
  );

  const now = new Date();

  // Run each agent with independent failure isolation
  let memory:  AgentResultWithStatus<MemoryAgentResult>  = DEGRADED_MEMORY;
  let project: AgentResultWithStatus<ProjectAgentResult> = DEGRADED_PROJECT;
  let domain:  AgentResultWithStatus<DomainAgentResult>  = DEGRADED_DOMAIN;

  try { memory  = { ...computeMemoryAgent(memories, feedbackByMemoryId, now),     status: "success" }; } catch { /* use degraded default */ }
  try { project = { ...computeProjectAgent(projects, memories, feedbackByMemoryId), status: "success" }; } catch { /* use degraded default */ }
  try { domain  = { ...computeDomainAgent(memories, now),                           status: "success" }; } catch { /* use degraded default */ }

  const overallScore = Math.round(memory.score * 0.35 + project.score * 0.35 + domain.score * 0.30);

  const DEGRADED_SYNTHESIS: AgentResultWithStatus<SynthesisResult> = {
    agentId: "synthesis", status: "degraded", score: 0,
    findings: ["Agent unavailable"],
    data: { systemCoherenceScore: 0, correlations: [], prioritizedActions: [], intelligenceGrade: "F" },
  };

  let synthesis: AgentResultWithStatus<SynthesisResult> = DEGRADED_SYNTHESIS;
  try { synthesis = { ...computeSynthesisAgent(memory, project, domain, overallScore), status: "success" }; } catch { /* use degraded default */ }

  return {
    generatedAt: now.toISOString(),
    overallScore,
    memory,
    project,
    domain,
    synthesis,
  };
}
