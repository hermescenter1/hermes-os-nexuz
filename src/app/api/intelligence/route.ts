import { NextResponse } from "next/server";
import { getIntelligence } from "@/lib/services/intelligence-service";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { requireAuthoring } from "@/lib/auth/api-guards";

const EMPTY_INTELLIGENCE = {
  generatedAt:     new Date(0).toISOString(),
  predictions:     {
    predictions: [],
    summary: { totalProjects: 0, criticalCount: 0, highCount: 0, avgFailureScore: 0, topRiskProject: null },
  },
  recommendations: { recommendations: [], totalCount: 0 },
  playbooks:       { playbooks: [], totalCount: 0 },
};

/**
 * GET /api/intelligence — unified predictive intelligence layer.
 *
 * Phase 86C4B2B1D-SECURITY-5: recommendation/playbook descriptions embed raw
 * user-entered memory text (query / analysisSummary) from the GLOBAL brain,
 * which may contain plant or customer detail — not for anonymous exposure.
 * Gated with the canonical "authoring" guard (its engineering-surface
 * audience already holds that capability).
 */
export async function GET() {
  const gate = await requireAuthoring();
  if (!gate.ok) return gate.response;

  const storageMode = getStorageMode();
  try {
    const result = await getIntelligence();
    return NextResponse.json({ storageMode, ...result });
  } catch {
    return NextResponse.json({ storageMode, ...EMPTY_INTELLIGENCE });
  }
}
