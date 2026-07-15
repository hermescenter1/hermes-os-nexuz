import { NextResponse } from "next/server";
import { getDashboard } from "@/lib/services/dashboard-service";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { requireAuthoring } from "@/lib/auth/api-guards";

const EMPTY_DASHBOARD = {
  generatedAt: new Date(0).toISOString(),
  systemSummary:  { totalProjects: 0, activeProjects: 0, totalMemories: 0, linkedMemories: 0, totalDomains: 0, totalCases: 0 },
  memoryHealth:   { avgConfidence: 0, highConfidenceCount: 0, lowConfidenceCount: 0, outcomeDistribution: { success: 0, partial: 0, failed: 0, unknown: 0 }, feedbackRate: 0, successRate: 0 },
  projectHealth:  { byStatus: { active: 0, archived: 0, completed: 0 }, avgFailureRate: 0, highRiskProjects: 0, systemRiskLevel: "low" as const },
  graphSnapshot:  { totalNodes: 0, totalEdges: 0, connectedComponents: 0, avgDegree: 0, healthScore: 0, isolatedNodes: 0 },
  systemHealth:   { overall: 0, memory: 0, projects: 0, graph: 0 },
  insights:       [],
};

/**
 * GET /api/dashboard — unified system intelligence dashboard.
 *
 * Phase 86C4B2B1D-SECURITY-5: the response aggregates the GLOBAL engineering
 * brain (project/memory/graph health), platform-internal data with no public
 * use. Gated with the canonical "authoring" guard — the same capability that
 * fronts its only consumer, the `/engineering` hub (canAccessEngineering =
 * superadmin/admin/engineer), so no legitimate caller is affected.
 */
export async function GET() {
  const gate = await requireAuthoring();
  if (!gate.ok) return gate.response;

  const storageMode = getStorageMode();
  try {
    const result = await getDashboard();
    return NextResponse.json({ storageMode, ...result });
  } catch {
    return NextResponse.json({ storageMode, ...EMPTY_DASHBOARD });
  }
}
