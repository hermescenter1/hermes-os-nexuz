import { NextResponse } from "next/server";
import { getBenchmark } from "@/lib/services/project-benchmark-service";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { requireAuthoring } from "@/lib/auth/api-guards";

/** GET /api/projects/benchmark — portfolio-level benchmarking and rankings.
 *  Phase 82C: authoring only. */
export async function GET() {
  const gate = await requireAuthoring();
  if (!gate.ok) return gate.response;

  const storageMode = getStorageMode();
  try {
    const result = await getBenchmark();
    return NextResponse.json({ storageMode, ...result });
  } catch {
    return NextResponse.json({
      storageMode,
      summary:  { totalProjects: 0, activeProjects: 0, completedProjects: 0, archivedProjects: 0 },
      leaders:  { highestSuccessRate: null, highestRisk: null, mostActive: null, mostMemories: null, mostIncidents: null, bestConfidence: null },
      rankings: { successRate: [], riskScore: [], activity: [], confidence: [] },
      insights: [],
    });
  }
}
