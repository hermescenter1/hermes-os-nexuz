import { NextResponse } from "next/server";
import { getDashboard } from "@/lib/services/dashboard-service";
import { getStorageMode } from "@/lib/storage/storage-mode";

const EMPTY_DASHBOARD = {
  generatedAt: new Date(0).toISOString(),
  systemSummary:  { totalProjects: 0, activeProjects: 0, totalMemories: 0, linkedMemories: 0, totalDomains: 0, totalCases: 0 },
  memoryHealth:   { avgConfidence: 0, highConfidenceCount: 0, lowConfidenceCount: 0, outcomeDistribution: { success: 0, partial: 0, failed: 0, unknown: 0 }, feedbackRate: 0, successRate: 0 },
  projectHealth:  { byStatus: { active: 0, archived: 0, completed: 0 }, avgFailureRate: 0, highRiskProjects: 0, systemRiskLevel: "low" as const },
  graphSnapshot:  { totalNodes: 0, totalEdges: 0, connectedComponents: 0, avgDegree: 0, healthScore: 0, isolatedNodes: 0 },
  systemHealth:   { overall: 0, memory: 0, projects: 0, graph: 0 },
  insights:       [],
};

/** GET /api/dashboard — unified system intelligence dashboard. */
export async function GET() {
  const storageMode = getStorageMode();
  try {
    const result = await getDashboard();
    return NextResponse.json({ storageMode, ...result });
  } catch {
    return NextResponse.json({ storageMode, ...EMPTY_DASHBOARD });
  }
}
