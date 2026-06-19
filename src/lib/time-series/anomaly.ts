/**
 * Simple anomaly detection — Phase 37. Rule-based only. No ML.
 *
 * All thresholds are named, exported constants with documented units.
 * The Copilot (Phase 38) reuses these constants — do NOT redefine them.
 */

import { getPrisma }        from "@/lib/db/prisma";
import { STALE_THRESHOLD_MINUTES } from "@/lib/digital-twin/health";
import type { PeriodRange } from "./periods";

// ── Threshold constants ────────────────────────────────────────────────────────
// Units documented in-line. All exported so Phase 38 Copilot can reference them.

/** % change vs 10-point rolling baseline that flags a spike (upward). */
export const SPIKE_THRESHOLD_PCT  = 50;

/** % change (downward) vs 10-point rolling baseline that flags a drop. */
export const DROP_THRESHOLD_PCT   = 50;

/** Number of consecutive BAD or STALE quality records that flags "repeated_fault". */
export const FAULT_REPEAT_COUNT   = 3;

/** Gap in receivedAt (minutes) > this = "stale" anomaly. Mirrors Phase 36's threshold. */
export const STALE_GAP_MINUTES    = STALE_THRESHOLD_MINUTES;

/** Health score drop of this % over the analysis window = "declining_health" anomaly. */
export const HEALTH_DECLINE_PCT   = 20;

export type AnomalyType =
  | "spike"
  | "drop"
  | "repeated_fault"
  | "stale_telemetry"
  | "declining_health";

export interface AnomalyEvent {
  type:        AnomalyType;
  assetId:     string;
  tag:         string;
  detectedAt:  string;    // ISO
  description: string;
  value?:      number;
  baseline?:   number;
}

type FindModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

export async function detectSimpleAnomalies(
  organizationId: string,
  assetId:        string,
  tag:            string,
  range:          PeriodRange,
): Promise<AnomalyEvent[]> {
  const prisma = await getPrisma();
  if (!prisma) return [];

  // Load a bounded window of numeric telemetry (max 500 rows, newest first for stale check)
  const rows = await (prisma.telemetryRecord as unknown as FindModel).findMany({
    where: {
      organizationId,
      assetId,
      tag,
      receivedAt: { gte: range.from, lte: range.to },
    },
    orderBy: { receivedAt: "asc" },
    take:    500,
    select:  { numericValue: true, quality: true, receivedAt: true },
  });

  const anomalies: AnomalyEvent[] = [];

  if (rows.length === 0) return [];

  // ── Stale telemetry ───────────────────────────────────────────────────────
  const lastRow  = rows[rows.length - 1];
  const lastAt   = new Date(lastRow.receivedAt as string).getTime();
  const nowMs    = Date.now();
  if (nowMs - lastAt > STALE_GAP_MINUTES * 60_000) {
    anomalies.push({
      type:       "stale_telemetry",
      assetId,
      tag,
      detectedAt: new Date().toISOString(),
      description: `No telemetry received for tag "${tag}" in the last ${STALE_GAP_MINUTES} minutes.`,
    });
  }

  // ── Repeated fault ────────────────────────────────────────────────────────
  let consecutive = 0;
  let faultStart: string | null = null;
  for (const r of rows) {
    if (r.quality === "BAD" || r.quality === "STALE") {
      if (consecutive === 0) faultStart = r.receivedAt as string;
      consecutive++;
      if (consecutive >= FAULT_REPEAT_COUNT) {
        anomalies.push({
          type:       "repeated_fault",
          assetId,
          tag,
          detectedAt: new Date(faultStart!).toISOString(),
          description: `Tag "${tag}" had ${consecutive} consecutive BAD/STALE records.`,
        });
        break;
      }
    } else {
      consecutive = 0;
      faultStart  = null;
    }
  }

  // ── Spike and drop — rolling 10-point baseline ────────────────────────────
  const numeric = rows
    .filter((r) => r.numericValue != null)
    .map((r) => ({ v: r.numericValue as number, at: r.receivedAt as string }));

  for (let i = 10; i < numeric.length; i++) {
    const window  = numeric.slice(i - 10, i).map((r) => r.v);
    const baseline = window.reduce((a, b) => a + b, 0) / window.length;
    const current  = numeric[i].v;
    if (baseline === 0) continue;
    const changePct = ((current - baseline) / Math.abs(baseline)) * 100;
    if (changePct > SPIKE_THRESHOLD_PCT) {
      anomalies.push({
        type:       "spike",
        assetId,
        tag,
        detectedAt: new Date(numeric[i].at).toISOString(),
        description: `Spike detected: value ${current.toFixed(2)} is ${changePct.toFixed(1)}% above 10-point rolling average (${baseline.toFixed(2)}).`,
        value:    current,
        baseline: baseline,
      });
      break;
    }
    if (changePct < -DROP_THRESHOLD_PCT) {
      anomalies.push({
        type:       "drop",
        assetId,
        tag,
        detectedAt: new Date(numeric[i].at).toISOString(),
        description: `Drop detected: value ${current.toFixed(2)} is ${Math.abs(changePct).toFixed(1)}% below 10-point rolling average (${baseline.toFixed(2)}).`,
        value:    current,
        baseline: baseline,
      });
      break;
    }
  }

  return anomalies;
}
