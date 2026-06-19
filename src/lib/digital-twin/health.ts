/**
 * Digital Twin Health Scoring — Phase 36.
 *
 * calculateHealthScore() produces a deterministic 0–100 score per asset node.
 * Inputs and weights:
 *   - Telemetry freshness  (40 pts): time since last telemetry vs STALE_THRESHOLD
 *   - Telemetry quality    (35 pts): fraction of recent records with GOOD quality
 *   - Asset status         (25 pts): asset.status string
 *
 * No AI, no probabilistic models — deterministic only.
 * READ/OBSERVE ONLY: Does not write to any asset or control system.
 */

import { getPrisma } from "@/lib/db/prisma";
import type { AssetHealthScore } from "./types";

// A named, configurable constant. Telemetry older than this threshold is stale.
export const STALE_THRESHOLD_MINUTES = 15;

// How many recent telemetry records to sample for quality scoring.
const QUALITY_SAMPLE_SIZE = 20;

// Score weights (must sum to 100)
const W_FRESHNESS = 40;
const W_QUALITY   = 35;
const W_STATUS    = 25;

type TelemetryModel = {
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  findMany:  (a: unknown) => Promise<Record<string, unknown>[]>;
};

/** Map asset status string to a score fraction 0.0–1.0. */
function statusFraction(status: string): number {
  const s = status.toUpperCase();
  if (s === "ACTIVE")      return 1.0;
  if (s === "MAINTENANCE") return 0.5;
  if (s === "INACTIVE")    return 0.2;
  return 0.6; // unknown status — partial credit
}

export async function calculateHealthScore(params: {
  organizationId: string;
  assetId:        string;
  assetStatus:    string;
}): Promise<AssetHealthScore | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;

  const telModel = prisma.telemetryRecord as unknown as TelemetryModel;

  // Most recent telemetry row for this asset
  const latest = await telModel.findFirst({
    where:   { organizationId: params.organizationId, assetId: params.assetId },
    orderBy: { receivedAt: "desc" },
  });

  const lastAt    = latest ? new Date(latest.receivedAt as string) : null;
  const nowMs     = Date.now();
  const staleMs   = STALE_THRESHOLD_MINUTES * 60 * 1000;
  const stale     = !lastAt || (nowMs - lastAt.getTime()) > staleMs;

  // Freshness score (40 pts)
  let freshnessScore = 0;
  if (lastAt) {
    const ageMs     = nowMs - lastAt.getTime();
    const ageFrac   = Math.min(ageMs / staleMs, 1.0);  // 0 = fresh, 1 = at threshold
    freshnessScore  = Math.round(W_FRESHNESS * (1 - ageFrac));
  }

  // Quality score (35 pts) — sample last N records
  const recentRows = await telModel.findMany({
    where:   { organizationId: params.organizationId, assetId: params.assetId },
    orderBy: { receivedAt: "desc" },
    take:    QUALITY_SAMPLE_SIZE,
  });

  let qualityScore = 0;
  if (recentRows.length > 0) {
    const goodCount = recentRows.filter((r) => r.quality === "GOOD").length;
    qualityScore    = Math.round(W_QUALITY * (goodCount / recentRows.length));
  }

  // Status score (25 pts)
  const statusScore = Math.round(W_STATUS * statusFraction(params.assetStatus));

  const score = Math.min(100, freshnessScore + qualityScore + statusScore);

  return {
    nodeId:          "",  // caller fills this in
    assetId:         params.assetId,
    score,
    freshnessScore,
    qualityScore,
    statusScore,
    lastTelemetryAt: lastAt?.toISOString() ?? null,
    stale,
  };
}
