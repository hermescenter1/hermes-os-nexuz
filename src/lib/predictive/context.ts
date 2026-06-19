/**
 * Predictive context bridge — Phase 39.
 *
 * getPredictiveContext() is the single read-only interface that Copilot (Phase 38)
 * uses to read risk scores, RUL, recommendations, and degradation summaries.
 *
 * READ-ONLY INVARIANT: This function only reads. Copilot NEVER writes to PM tables.
 * getPredictiveAssetSummaries() reads the most recent persisted records only — it
 * does NOT trigger new calculations (to avoid polluting metrics from Copilot reads).
 */

import { getPrisma }      from "@/lib/db/prisma";
import { calculateRiskScore }            from "./risk";
import { calculateRUL }                  from "./rul";
import { calculateFailureProbability }   from "./failure";
import { generateMaintenanceRecommendations } from "./maintenance";
import { calculateDegradationRate }      from "./degradation";
import { getBaseline }                   from "./baseline";
import type {
  PredictiveContext,
  RiskScoreResult,
  RULResult,
  FailureProbabilityResult,
  MaintenanceRecommendationResult,
  DegradationResult,
  BaselineResult,
} from "./types";

/**
 * Compute full predictive context for a single asset.
 * Used by API routes and Dashboard. Triggers all 6 engines.
 */
export async function getPredictiveContext(
  organizationId: string,
  assetId:        string,
): Promise<PredictiveContext> {
  const [riskRaw, rulRaw, failureRaw, recommendations, degRaw, baseline] = await Promise.all([
    calculateRiskScore(organizationId, assetId),
    calculateRUL(organizationId, assetId),
    calculateFailureProbability(organizationId, assetId),
    generateMaintenanceRecommendations(organizationId, assetId),
    calculateDegradationRate(organizationId, assetId, 90),
    getBaseline(organizationId, assetId, 90),
  ]);

  return {
    assetId,
    riskScore:          "state" in riskRaw    ? null : riskRaw    as RiskScoreResult,
    rul:                "state" in rulRaw     ? null : rulRaw     as RULResult,
    failureProbability: "state" in failureRaw ? null : failureRaw as FailureProbabilityResult,
    recommendations:    recommendations       as MaintenanceRecommendationResult[],
    degradation:        "state" in degRaw     ? null : degRaw     as DegradationResult,
    baseline:           baseline              as BaselineResult | null,
  };
}

// ── Copilot read-only summary (reads persisted records, no new calculations) ──

type RiskRow = Record<string, unknown>;
type RULRow  = Record<string, unknown>;
type RecRow  = Record<string, unknown>;

type RiskModel = { findFirst: (a: unknown) => Promise<RiskRow | null> };
type RULModel  = { findFirst: (a: unknown) => Promise<RULRow  | null> };
type RecModel  = { findMany:  (a: unknown) => Promise<RecRow[]>       };

export interface CopilotPredictiveSummary {
  assetId:         string;
  latestRiskScore: number | null;
  riskConfidence:  string | null;
  rulState:        string | null;
  rulMinDays:      number | null;
  rulMaxDays:      number | null;
  openRecs:        number;
  highPriorityRecs: number;
}

/**
 * Read-only summary for Copilot integration.
 * Reads latest persisted records only — does NOT trigger calculations.
 */
export async function getCopilotPredictiveSummary(
  organizationId: string,
  assetId:        string,
): Promise<CopilotPredictiveSummary> {
  const empty: CopilotPredictiveSummary = {
    assetId, latestRiskScore: null, riskConfidence: null,
    rulState: null, rulMinDays: null, rulMaxDays: null,
    openRecs: 0, highPriorityRecs: 0,
  };

  const prisma = await getPrisma();
  if (!prisma) return empty;
  const db = prisma as unknown as Record<string, unknown>;

  const [riskRow, rulRow, recRows] = await Promise.all([
    (db.assetRiskScore as unknown as RiskModel).findFirst({
      where: { organizationId, assetId }, orderBy: { createdAt: "desc" },
    }),
    (db.rULSnapshot as unknown as RULModel).findFirst({
      where: { organizationId, assetId }, orderBy: { createdAt: "desc" },
    }),
    (db.maintenanceRecommendation as unknown as RecModel).findMany({
      where: { organizationId, assetId, dismissed: false },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return {
    assetId,
    latestRiskScore:  riskRow ? (riskRow.riskScore  as number) : null,
    riskConfidence:   riskRow ? (riskRow.confidence  as string) : null,
    rulState:         rulRow  ? (rulRow.state         as string) : null,
    rulMinDays:       rulRow  ? (rulRow.minDays        as number | null) : null,
    rulMaxDays:       rulRow  ? (rulRow.maxDays        as number | null) : null,
    openRecs:         recRows.length,
    highPriorityRecs: recRows.filter((r) => r.priority === "HIGH").length,
  };
}
