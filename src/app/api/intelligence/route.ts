import { NextResponse } from "next/server";
import { getIntelligence } from "@/lib/services/intelligence-service";
import { getStorageMode } from "@/lib/storage/storage-mode";

const EMPTY_INTELLIGENCE = {
  generatedAt:     new Date(0).toISOString(),
  predictions:     {
    predictions: [],
    summary: { totalProjects: 0, criticalCount: 0, highCount: 0, avgFailureScore: 0, topRiskProject: null },
  },
  recommendations: { recommendations: [], totalCount: 0 },
  playbooks:       { playbooks: [], totalCount: 0 },
};

/** GET /api/intelligence — unified predictive intelligence layer. */
export async function GET() {
  const storageMode = getStorageMode();
  try {
    const result = await getIntelligence();
    return NextResponse.json({ storageMode, ...result });
  } catch {
    return NextResponse.json({ storageMode, ...EMPTY_INTELLIGENCE });
  }
}
