import { NextResponse } from "next/server";
import { getProjectAnalytics } from "@/lib/analytics/analytics-service";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { requireAuthoring } from "@/lib/auth/api-guards";

const EMPTY_SUMMARY = {
  totalProjects: 0,
  activeProjects: 0,
  completedProjects: 0,
  archivedProjects: 0,
  totalMemories: 0,
  memoriesPerProject: 0,
  successfulOutcomes: 0,
  failedOutcomes: 0,
  partialOutcomes: 0,
  unknownOutcomes: 0,
  projectRiskDistribution: { low: 0, medium: 0, high: 0, unknown: 0 },
} as const;

/** GET /api/projects/analytics — portfolio-level project analytics.
 *  Phase 82C: authoring only. */
export async function GET() {
  const gate = await requireAuthoring();
  if (!gate.ok) return gate.response;

  try {
    const analytics = await getProjectAnalytics();
    return NextResponse.json({ storageMode: getStorageMode(), ...analytics });
  } catch {
    return NextResponse.json({
      storageMode: getStorageMode(),
      summary: EMPTY_SUMMARY,
      projectStats: [],
      insights: [],
    });
  }
}
