/**
 * Deterministic insight generation — Phase 38.
 *
 * Generates CopilotInsight records based on rules over Phase 35/36/37 data.
 * All thresholds reference Phase 37 constants — NOT redefined here.
 *
 * Insight types:
 *   stale_telemetry     — last telemetry > STALE_THRESHOLD_MINUTES
 *   repeated_fault      — BAD/STALE quality streak >= FAULT_REPEAT_COUNT
 *   declining_health    — health score dropped >= HEALTH_DECLINE_PCT
 *   abnormal_kpi        — availability < AVAILABILITY_LOW_PCT
 *   frequent_alarms     — alarm rate > ALARM_RATE_HIGH
 *   missing_telemetry   — no telemetry records in period
 *   disconnected_asset  — ASSET node with no relations in Digital Twin graph
 *
 * READ-ONLY: all sources are read-only. No PLC control path.
 */

import { getPrisma }                from "@/lib/db/prisma";
import { STALE_THRESHOLD_MINUTES }  from "@/lib/digital-twin/health";
import { FAULT_REPEAT_COUNT, HEALTH_DECLINE_PCT } from "@/lib/time-series/anomaly";
import { getPeriodRange }           from "@/lib/time-series/periods";
import { getAlarmFrequency }        from "@/lib/time-series/alarms";
import { calculateAvailability }    from "@/lib/time-series/kpi";
import { getHealthTrend }           from "@/lib/time-series/health-history";
import { listAssets }               from "@/lib/industrial/assets";
import { detectDataQualityWarnings } from "@/lib/digital-twin/analytics";
import { getAssetGraph }            from "@/lib/digital-twin/graph";
import { escapeUntrustedData }      from "./safety";
import type { CopilotInsightRecord, CopilotInsightType, CopilotInsightSeverity } from "./types";

// Named threshold constants with units
export const AVAILABILITY_LOW_PCT = 80;    // % availability below this = "abnormal_kpi"
export const ALARM_RATE_HIGH      = 0.25;  // fraction (25%) alarm rate above this = "frequent_alarms"

type InsightModel = {
  create:   (a: unknown) => Promise<Record<string, unknown>>;
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
};
type TelemetryModel = {
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  findMany:  (a: unknown) => Promise<Record<string, unknown>[]>;
  count:     (a: unknown) => Promise<number>;
};

async function persistInsight(
  db:   Record<string, unknown>,
  data: Omit<CopilotInsightRecord, "id" | "createdAt">,
): Promise<CopilotInsightRecord> {
  const row = await (db.copilotInsight as unknown as InsightModel).create({ data });
  return {
    id:             row.id as string,
    organizationId: row.organizationId as string,
    siteId:         (row.siteId  ?? null) as string | null,
    assetId:        (row.assetId ?? null) as string | null,
    insightType:    row.insightType as CopilotInsightType,
    severity:       row.severity as CopilotInsightSeverity,
    title:          row.title as string,
    description:    row.description as string,
    metadata:       (row.metadata ?? {}) as Record<string, unknown>,
    createdAt:      new Date(row.createdAt as string).toISOString(),
  };
}

export async function generateInsights(
  organizationId: string,
  siteId?:        string,
): Promise<CopilotInsightRecord[]> {
  const prisma = await getPrisma();
  if (!prisma) return [];

  const db       = prisma as unknown as Record<string, unknown>;
  const assets   = await listAssets(organizationId, siteId ? { siteId } : undefined);
  const range24h = getPeriodRange("last24Hours");
  const results: CopilotInsightRecord[] = [];

  for (const asset of assets.slice(0, 50)) {  // cap at 50 assets per run
    const assetName = escapeUntrustedData(asset.name);

    // ── stale telemetry ────────────────────────────────────────────────────
    const latest = await (db.telemetryRecord as unknown as TelemetryModel).findFirst({
      where:   { organizationId, assetId: asset.id },
      orderBy: { receivedAt: "desc" },
    });
    if (!latest) {
      results.push(await persistInsight(db, {
        organizationId, siteId: asset.siteId, assetId: asset.id,
        insightType: "missing_telemetry",
        severity:    "WARNING",
        title:       `No telemetry: ${assetName}`,
        description: `Asset "${assetName}" has no telemetry records. Gateway may be offline.`,
        metadata:    { assetId: asset.id },
      }));
      continue;
    }

    const lastAt  = new Date(latest.receivedAt as string);
    const ageMins = (Date.now() - lastAt.getTime()) / 60_000;
    if (ageMins > STALE_THRESHOLD_MINUTES) {
      results.push(await persistInsight(db, {
        organizationId, siteId: asset.siteId, assetId: asset.id,
        insightType: "stale_telemetry",
        severity:    ageMins > STALE_THRESHOLD_MINUTES * 4 ? "CRITICAL" : "WARNING",
        title:       `Stale telemetry: ${assetName}`,
        description: `Last telemetry for "${assetName}" was ${Math.round(ageMins)} minutes ago (threshold: ${STALE_THRESHOLD_MINUTES} min).`,
        metadata:    { assetId: asset.id, ageMinutes: Math.round(ageMins) },
      }));
    }

    // ── repeated fault ─────────────────────────────────────────────────────
    const recent = await (db.telemetryRecord as unknown as TelemetryModel).findMany({
      where:   { organizationId, assetId: asset.id },
      orderBy: { receivedAt: "desc" },
      take:    FAULT_REPEAT_COUNT * 2,
      select:  { quality: true, receivedAt: true },
    });
    const consecutive = recent.findIndex((r) => r.quality === "GOOD");
    if (consecutive === -1 && recent.length >= FAULT_REPEAT_COUNT) {
      results.push(await persistInsight(db, {
        organizationId, siteId: asset.siteId, assetId: asset.id,
        insightType: "repeated_fault",
        severity:    "CRITICAL",
        title:       `Repeated fault: ${assetName}`,
        description: `Asset "${assetName}" has ${recent.length} consecutive BAD/STALE telemetry records.`,
        metadata:    { assetId: asset.id, faultCount: recent.length },
      }));
    }

    // ── frequent alarms ────────────────────────────────────────────────────
    const alarmFreq = await getAlarmFrequency(organizationId, asset.id, range24h);
    if (alarmFreq && alarmFreq.alarmRate > ALARM_RATE_HIGH) {
      results.push(await persistInsight(db, {
        organizationId, siteId: asset.siteId, assetId: asset.id,
        insightType: "frequent_alarms",
        severity:    "WARNING",
        title:       `Frequent alarms: ${assetName}`,
        description: `Asset "${assetName}" alarm rate is ${(alarmFreq.alarmRate * 100).toFixed(1)}% over the last 24 hours (threshold: ${ALARM_RATE_HIGH * 100}%).`,
        metadata:    { assetId: asset.id, alarmRate: alarmFreq.alarmRate, badCount: alarmFreq.badCount },
      }));
    }

    // ── abnormal KPI (availability) ────────────────────────────────────────
    const avail = await calculateAvailability(organizationId, asset.id, range24h, "last24Hours");
    if (avail && avail.value < AVAILABILITY_LOW_PCT) {
      results.push(await persistInsight(db, {
        organizationId, siteId: asset.siteId, assetId: asset.id,
        insightType: "abnormal_kpi",
        severity:    avail.value < 50 ? "CRITICAL" : "WARNING",
        title:       `Low availability: ${assetName}`,
        description: `Asset "${assetName}" availability is ${avail.value.toFixed(1)}% (threshold: ${AVAILABILITY_LOW_PCT}%).`,
        metadata:    { assetId: asset.id, availability: avail.value },
      }));
    }

    // ── declining health ───────────────────────────────────────────────────
    const healthHistory = await getHealthTrend(organizationId, asset.id, range24h);
    if (healthHistory.length >= 2) {
      const first = healthHistory[0].healthScore;
      const last  = healthHistory[healthHistory.length - 1].healthScore;
      if (first - last >= HEALTH_DECLINE_PCT) {
        results.push(await persistInsight(db, {
          organizationId, siteId: asset.siteId, assetId: asset.id,
          insightType: "declining_health",
          severity:    "WARNING",
          title:       `Declining health: ${assetName}`,
          description: `Asset "${assetName}" health score dropped from ${first.toFixed(0)} to ${last.toFixed(0)} (−${(first - last).toFixed(0)} points) over the last 24 hours.`,
          metadata:    { assetId: asset.id, startScore: first, endScore: last, drop: first - last },
        }));
      }
    }
  }

  // ── disconnected assets (Digital Twin) ────────────────────────────────────
  if (siteId) {
    const graph = await getAssetGraph(organizationId, siteId);
    if (graph) {
      const knownAssetIds = new Set(assets.map((a) => a.id));
      const warnings      = detectDataQualityWarnings(graph, knownAssetIds);
      for (const w of warnings.filter((w) => w.type === "disconnected_critical").slice(0, 10)) {
        const node = graph.nodes.get(w.nodeId);
        results.push(await persistInsight(db, {
          organizationId, siteId, assetId: node?.assetId ?? null,
          insightType: "disconnected_asset",
          severity:    "INFO",
          title:       `Disconnected node: ${escapeUntrustedData(node?.displayName ?? w.nodeId)}`,
          description: escapeUntrustedData(w.message),
          metadata:    { nodeId: w.nodeId },
        }));
      }
    }
  }

  return results;
}

export async function listInsights(
  organizationId: string,
  opts?: { siteId?: string; assetId?: string; limit?: number },
): Promise<CopilotInsightRecord[]> {
  const prisma = await getPrisma();
  if (!prisma) return [];
  const db = prisma as unknown as Record<string, unknown>;
  const where: Record<string, unknown> = { organizationId };
  if (opts?.siteId)  where.siteId  = opts.siteId;
  if (opts?.assetId) where.assetId = opts.assetId;
  const rows = await (db.copilotInsight as unknown as InsightModel).findMany({
    where,
    orderBy: { createdAt: "desc" },
    take:    opts?.limit ?? 50,
  });
  return rows.map((row) => ({
    id:             row.id as string,
    organizationId: row.organizationId as string,
    siteId:         (row.siteId  ?? null) as string | null,
    assetId:        (row.assetId ?? null) as string | null,
    insightType:    row.insightType as CopilotInsightType,
    severity:       row.severity   as CopilotInsightSeverity,
    title:          row.title       as string,
    description:    row.description as string,
    metadata:       (row.metadata ?? {}) as Record<string, unknown>,
    createdAt:      new Date(row.createdAt as string).toISOString(),
  }));
}
