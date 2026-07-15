import { NextResponse } from "next/server";
import { runMultiAgentAnalysis } from "@/lib/services/multi-agent-service";
import { getStorageMode }        from "@/lib/storage/storage-mode";
import { requireAuthoring }      from "@/lib/auth/api-guards";

const EMPTY_REPORT = {
  generatedAt:  new Date(0).toISOString(),
  overallScore: 0,
  memory:   { agentId: "memory",   status: "degraded", score: 0, findings: [], data: { totalMemories: 0, qualityScore: 0, feedbackCompleteness: 0, successRate: 0, coverageGaps: [], learningVelocity: "stable" } },
  project:  { agentId: "project",  status: "degraded", score: 0, findings: [], data: { totalProjects: 0, portfolioScore: 0, atRiskCount: 0, memoryCoverage: 0, riskConcentration: 0 } },
  domain:   { agentId: "domain",   status: "degraded", score: 0, findings: [], data: { totalDomains: 0, expertiseBreadth: 0, expertiseDepth: 0, emergingDomains: [], criticalGaps: [] } },
  synthesis: { agentId: "synthesis", status: "degraded", score: 0, findings: [], data: { systemCoherenceScore: 0, correlations: [], prioritizedActions: [], intelligenceGrade: "F" } },
};

/**
 * GET /api/intelligence/agents — multi-agent engineering intelligence report.
 *
 * Phase 86C4B2B1D-SECURITY-5: aggregates the GLOBAL engineering brain
 * (memory/project/domain agent analysis), platform-internal data. Gated with
 * the canonical "authoring" guard; its only consumer is the `/engineering`
 * hub whose audience already holds that capability.
 */
export async function GET() {
  const gate = await requireAuthoring();
  if (!gate.ok) return gate.response;

  const storageMode = getStorageMode();
  try {
    const result = await runMultiAgentAnalysis();
    return NextResponse.json({ storageMode, ...result });
  } catch {
    return NextResponse.json({ storageMode, ...EMPTY_REPORT });
  }
}
