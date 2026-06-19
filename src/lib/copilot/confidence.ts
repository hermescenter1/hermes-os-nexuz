/**
 * Confidence scoring — Phase 38.
 *
 * Scores confidence as LOW / MEDIUM / HIGH based on:
 *   - data freshness (vs STALE_THRESHOLD_MINUTES from Phase 36)
 *   - evidence count (records, insights, KPIs)
 *   - telemetry quality fraction
 *
 * If evidence is insufficient, the Copilot must respond:
 * "I do not have enough industrial data to answer this reliably."
 */

import { STALE_THRESHOLD_MINUTES } from "@/lib/digital-twin/health";
import type { CopilotConfidence }  from "./types";

export const INSUFFICIENT_DATA_RESPONSE_EN = "I do not have enough industrial data to answer this reliably. Please ensure telemetry is flowing from the relevant assets.";
export const INSUFFICIENT_DATA_RESPONSE_FA = "داده‌های صنعتی کافی برای پاسخ مطمئن به این سوال وجود ندارد. لطفاً مطمئن شوید که تله‌متری از دارایی‌های مرتبط دریافت می‌شود.";

export interface EvidenceForConfidence {
  lastTelemetryAt:   Date | null;
  evidenceCount:     number;   // total records (insights + KPIs + telemetry points)
  goodQualityFrac:   number;   // 0–1, fraction of telemetry with quality=GOOD
}

export function scoreConfidence(e: EvidenceForConfidence): CopilotConfidence {
  if (e.evidenceCount === 0) return "LOW";

  let points = 0;

  // Freshness (0–2 pts)
  if (e.lastTelemetryAt) {
    const ageMins = (Date.now() - e.lastTelemetryAt.getTime()) / 60_000;
    if (ageMins <= STALE_THRESHOLD_MINUTES)       points += 2;
    else if (ageMins <= STALE_THRESHOLD_MINUTES * 4) points += 1;
  }

  // Evidence count (0–2 pts)
  if (e.evidenceCount >= 5) points += 2;
  else if (e.evidenceCount >= 2) points += 1;

  // Quality fraction (0–2 pts)
  if (e.goodQualityFrac >= 0.9)       points += 2;
  else if (e.goodQualityFrac >= 0.6)  points += 1;

  if (points >= 5) return "HIGH";
  if (points >= 2) return "MEDIUM";
  return "LOW";
}

export function isInsufficientData(confidence: CopilotConfidence, evidenceCount: number): boolean {
  return confidence === "LOW" && evidenceCount === 0;
}
