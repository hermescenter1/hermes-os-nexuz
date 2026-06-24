/**
 * Phase 49 — Asset Intelligence Automation Engine.
 *
 * Recalculates risk scores, health scores, maintenance recommendations,
 * alerts, and intelligence snapshots for all assets in an organisation.
 *
 * SAFETY INVARIANT: READ / ANALYZE / ALERT ONLY.
 * This engine never writes to PLCs, gateways, connectors, or any control
 * system. All outputs are advisory records in the Hermes database.
 */

import { getPrisma } from "@/lib/db/prisma";

// ── Criticality multipliers by asset type ─────────────────────────────────────
const CRITICALITY: Record<string, number> = {
  PLC: 1.3, SCADA: 1.3, HMI: 1.1,
  MOTOR: 1.1, PUMP: 1.1, COMPRESSOR: 1.2,
  CONVEYOR: 1.0, SENSOR: 0.9, DRIVE: 1.1,
  PANEL: 1.0, VFD: 1.1, VALVE: 1.0, OTHER: 0.8,
};

// ── Score components ──────────────────────────────────────────────────────────

function scoreHealthTrend(history: { healthScore: number }[]): number {
  if (history.length < 2) return 0;
  const recent = history.slice(0, 3).map((h) => h.healthScore);
  const older  = history.slice(-3).map((h) => h.healthScore);
  const avgR   = recent.reduce((a, b) => a + b, 0) / recent.length;
  const avgO   = older.reduce((a, b)  => a + b, 0) / older.length;
  const drop   = avgO - avgR; // positive = health declining
  if (drop > 20) return 30;
  if (drop > 10) return 22;
  if (drop > 5)  return 15;
  if (drop > 0)  return 8;
  return 2;
}

function scoreTelQuality(qualities: string[]): number {
  if (qualities.length === 0) return 10;
  const bad = qualities.filter((q) => q === "BAD" || q === "STALE").length;
  return Math.round((bad / qualities.length) * 15);
}

function scoreTelFreshness(lastAt: Date | null): number {
  if (!lastAt) return 10;
  const h = (Date.now() - lastAt.getTime()) / 3_600_000;
  if (h > 48) return 10;
  if (h > 24) return 7;
  if (h > 8)  return 4;
  if (h > 1)  return 2;
  return 0;
}

function scoreAlarmTrend(badCount: number): number {
  if (badCount >= 20) return 25;
  if (badCount >= 10) return 18;
  if (badCount >= 5)  return 12;
  if (badCount >= 1)  return 6;
  return 0;
}

function scoreKpiDegradation(kpiRows: { value: number }[]): number {
  if (kpiRows.length < 2) return 0;
  const recent = kpiRows.slice(0, 2);
  const older  = kpiRows.slice(-2);
  const avgR   = recent.reduce((a, r) => a + r.value, 0) / recent.length;
  const avgO   = older.reduce((a, r)  => a + r.value, 0) / older.length;
  const drop   = avgO - avgR;
  if (drop > 20) return 20;
  if (drop > 10) return 14;
  if (drop > 5)  return 8;
  if (drop > 0)  return 3;
  return 0;
}

function riskLevel(score: number): string {
  if (score >= 76) return "CRITICAL";
  if (score >= 51) return "HIGH";
  if (score >= 26) return "MEDIUM";
  return "LOW";
}

// ── Prisma model helpers ──────────────────────────────────────────────────────

type FM = { findMany:  (a: unknown) => Promise<Record<string, unknown>[]> };
type FF = { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };
type FC = { create:    (a: unknown) => Promise<Record<string, unknown>> };
type FU = { update:    (a: unknown) => Promise<Record<string, unknown>> };
type Db = Record<string, FM | FF | FC | FU>;

// ── Run result types ──────────────────────────────────────────────────────────

export interface AssetRunResult {
  assetId:     string;
  riskScore:   number;
  riskLevel:   string;
  healthScore: number | null;
  alertsCreated: number;
  maintenanceCreated: number;
  snapshotCreated: boolean;
}

export interface AutomationRunResult {
  organizationId: string;
  assetsProcessed: number;
  alertsCreated:   number;
  maintenanceCreated: number;
  snapshotsCreated: number;
  errors:          string[];
  durationMs:      number;
  runAt:           string;
}

// ── Main engine ───────────────────────────────────────────────────────────────

export async function runIntelligenceAutomation(
  organizationId: string
): Promise<AutomationRunResult> {
  const start = Date.now();
  const errors: string[] = [];
  let alertsCreated = 0;
  let maintenanceCreated = 0;
  let snapshotsCreated = 0;

  const db = await getPrisma();
  if (!db) {
    return {
      organizationId,
      assetsProcessed: 0,
      alertsCreated: 0,
      maintenanceCreated: 0,
      snapshotsCreated: 0,
      errors: ["Database unavailable"],
      durationMs: Date.now() - start,
      runAt: new Date().toISOString(),
    };
  }

  const r = db as unknown as Db;

  // Fetch all assets for the org
  const assets = await (r.industrialAsset as FM).findMany({
    where:  { organizationId },
    select: { id: true, assetType: true, siteId: true, gatewayId: true },
  });

  for (const rawAsset of assets) {
    const assetId   = rawAsset.id as string;
    const assetType = (rawAsset.assetType as string) ?? "OTHER";
    try {
      const result = await processAsset(r, organizationId, assetId, assetType);
      alertsCreated      += result.alertsCreated;
      maintenanceCreated += result.maintenanceCreated;
      if (result.snapshotCreated) snapshotsCreated++;
    } catch (e) {
      errors.push(`asset ${assetId}: ${String(e)}`);
    }
  }

  return {
    organizationId,
    assetsProcessed:    assets.length,
    alertsCreated,
    maintenanceCreated,
    snapshotsCreated,
    errors,
    durationMs: Date.now() - start,
    runAt: new Date().toISOString(),
  };
}

// ── Per-asset processing ──────────────────────────────────────────────────────

async function processAsset(
  r:              Db,
  organizationId: string,
  assetId:        string,
  assetType:      string
): Promise<AssetRunResult> {
  let alertsCreated = 0;
  let maintenanceCreated = 0;

  // ─ 1. Health history (last 30, newest first) ─
  const healthRows = await (r.assetHealthHistory as FM).findMany({
    where:   { assetId, organizationId },
    orderBy: { createdAt: "desc" },
    take:    30,
  }) as { healthScore: number; healthStatus: string }[];

  const latestHealth = healthRows[0] ?? null;
  const currentHealthScore = latestHealth?.healthScore ?? null;
  const currentHealthStatus = latestHealth?.healthStatus ?? "unknown";

  // ─ 2. Recent telemetry quality/freshness ─
  const telRows = await (r.telemetryRecord as FM).findMany({
    where:   { assetId, organizationId },
    orderBy: { receivedAt: "desc" },
    take:    100,
    select:  { quality: true, receivedAt: true },
  }) as { quality: string; receivedAt: Date | string }[];

  const qualities   = telRows.map((t) => t.quality);
  const lastTelAt   = telRows[0]?.receivedAt
    ? new Date(telRows[0].receivedAt as string)
    : null;
  const badTelCount = qualities.filter((q) => q === "BAD" || q === "STALE").length;

  // ─ 3. Recent KPI records ─
  const kpiRows = await (r.kPIRecord as FM).findMany({
    where:   { assetId, organizationId, kpiName: { in: ["availability", "efficiency"] } },
    orderBy: { calculatedAt: "desc" },
    take:    10,
    select:  { value: true },
  }) as { value: number }[];

  // ─ 4. Knowledge links count ─
  const linkRows = await (r.assetKnowledgeLink as FM).findMany({
    where:  { assetId, organizationId },
    select: { id: true },
  }) as { id: string }[];

  // ─ 5. Asset tag count ─
  const tagRows = await (r.assetTag as FM).findMany({
    where:  { assetId, organizationId },
    select: { id: true },
  }) as { id: string }[];

  // ─ 6. Compute risk score components ─
  const htScore  = scoreHealthTrend(healthRows);
  const atScore  = scoreAlarmTrend(badTelCount);
  const kpiScore = scoreKpiDegradation(kpiRows);
  const tqScore  = scoreTelQuality(qualities);
  const tfScore  = scoreTelFreshness(lastTelAt);
  const cf       = CRITICALITY[assetType] ?? 0.8;

  const rawScore   = htScore + atScore + kpiScore + tqScore + tfScore;
  const riskScore  = Math.min(100, Math.round(rawScore * cf));
  const confidence = qualities.length >= 20 ? "HIGH" : qualities.length >= 5 ? "MEDIUM" : "LOW";

  // ─ 7. Persist new risk score ─
  await (r.assetRiskScore as FC).create({
    data: {
      organizationId,
      assetId,
      riskScore,
      confidence,
      healthTrendScore:    htScore,
      alarmTrendScore:     atScore,
      kpiDegradationScore: kpiScore,
      telQualityScore:     tqScore,
      telFreshnessScore:   tfScore,
      criticalityFactor:   cf,
      metadata:            { source: "automation_v49", computedAt: new Date().toISOString() },
    },
  });

  // ─ 8. Persist new health history entry (carry forward latest score) ─
  if (currentHealthScore !== null) {
    await (r.assetHealthHistory as FC).create({
      data: {
        organizationId,
        assetId,
        healthScore:  currentHealthScore,
        healthStatus: currentHealthStatus,
      },
    });
  }

  // ─ 9. Derive health trend ─
  const ht = deriveHealthTrend(healthRows);

  // ─ 10. Previous snapshot for delta ─
  const prevSnapshot = (await (r.assetIntelligenceSnapshot as FM).findMany({
    where:   { assetId, organizationId },
    orderBy: { createdAt: "desc" },
    take:    1,
  }))[0] as { riskScore?: number | null; healthScore?: number | null } | undefined;

  const deltaRisk   = prevSnapshot?.riskScore   != null ? riskScore - (prevSnapshot.riskScore as number) : null;
  const deltaHealth = prevSnapshot?.healthScore != null && currentHealthScore != null
    ? currentHealthScore - (prevSnapshot.healthScore as number)
    : null;

  // ─ 11. Create intelligence snapshot ─
  await (r.assetIntelligenceSnapshot as FC).create({
    data: {
      organizationId,
      assetId,
      riskScore:      riskScore,
      riskLevel:      riskLevel(riskScore),
      healthScore:    currentHealthScore,
      healthStatus:   currentHealthStatus,
      healthTrend:    ht,
      tagCount:       tagRows.length,
      knowledgeTotal: linkRows.length,
      deltaRiskScore: deltaRisk,
      deltaHealth:    deltaHealth,
      metadata:       { source: "automation_v49" },
    },
  });

  // ─ 12. Alerts ─
  const hoursWithoutTel = lastTelAt
    ? (Date.now() - lastTelAt.getTime()) / 3_600_000
    : Infinity;

  const alertDefs: Array<{
    alertType: string;
    severity: string;
    title: string;
    description: string;
    condition: boolean;
  }> = [
    {
      alertType: "CRITICAL_RISK",
      severity:  "CRITICAL",
      title:     "Critical Risk Level Detected",
      description: `Asset risk score reached ${riskScore}/100 — immediate inspection recommended.`,
      condition: riskScore >= 76,
    },
    {
      alertType: "HEALTH_DEGRADATION",
      severity:  currentHealthScore !== null && currentHealthScore <= 30 ? "HIGH" : "MEDIUM",
      title:     "Asset Health Degradation",
      description: currentHealthScore !== null
        ? `Health score is ${Math.round(currentHealthScore)}/100 with a ${ht} trend.`
        : `Asset health is trending ${ht} with no recent score data.`,
      condition: (currentHealthScore !== null && currentHealthScore <= 40)
        || (currentHealthScore !== null && currentHealthScore <= 60 && ht === "degrading"),
    },
    {
      alertType: "COMMUNICATION_FAILURE",
      severity:  "HIGH",
      title:     "Asset Communication Failure",
      description: lastTelAt
        ? `No telemetry received for ${Math.round(hoursWithoutTel)} hours.`
        : "No telemetry has ever been received for this asset.",
      condition: hoursWithoutTel > 24,
    },
    {
      alertType: "KNOWLEDGE_COVERAGE_LOW",
      severity:  "LOW",
      title:     "No Knowledge Coverage",
      description: "This asset has no linked knowledge articles, failure modes, procedures, or cases.",
      condition: linkRows.length === 0,
    },
  ];

  for (const def of alertDefs) {
    if (!def.condition) continue;

    // Deduplication: skip if active (non-dismissed) alert of this type already exists
    const existing = await (r.assetAlert as FM).findMany({
      where: {
        assetId,
        organizationId,
        alertType: def.alertType,
        dismissed: false,
      },
      take: 1,
    });
    if (existing.length > 0) continue;

    await (r.assetAlert as FC).create({
      data: {
        organizationId,
        assetId,
        alertType:   def.alertType,
        severity:    def.severity,
        title:       def.title,
        description: def.description,
        metadata:    { source: "automation_v49", riskScore, healthScore: currentHealthScore },
      },
    });
    alertsCreated++;
  }

  // ─ 13. Maintenance recommendations ─
  const maintDefs: Array<{
    recommendationType: string;
    priority: string;
    title: string;
    description: string;
    condition: boolean;
  }> = [
    {
      recommendationType: "inspection",
      priority:  "HIGH",
      title:     "Schedule Immediate Asset Inspection",
      description: `Risk score ${riskScore}/100 exceeds HIGH threshold. Physical inspection is recommended before the next scheduled maintenance window.`,
      condition: riskScore >= 51,
    },
    {
      recommendationType: "alarm_review",
      priority:  "MEDIUM",
      title:     "Review Alarm and Quality Data",
      description: `${badTelCount} bad/stale telemetry readings detected in the last 100 samples. Review alarm configuration and sensor calibration.`,
      condition: badTelCount >= 5,
    },
    {
      recommendationType: "maintenance_review",
      priority:  currentHealthScore !== null && currentHealthScore <= 30 ? "HIGH" : "MEDIUM",
      title:     "Asset Health Below Threshold",
      description: currentHealthScore !== null
        ? `Health score ${Math.round(currentHealthScore)}/100 indicates the asset may need preventive maintenance.`
        : "No health data recorded — establish a baseline health assessment.",
      condition: currentHealthScore === null || currentHealthScore <= 50,
    },
    {
      recommendationType: "comms_inspection",
      priority:  "HIGH",
      title:     "Inspect Communication Path",
      description: lastTelAt
        ? `Asset has not transmitted data for ${Math.round(hoursWithoutTel)} hours. Verify gateway connectivity and sensor wiring.`
        : "Asset has never reported telemetry. Verify gateway and connector configuration.",
      condition: hoursWithoutTel > 24,
    },
  ];

  for (const def of maintDefs) {
    if (!def.condition) continue;

    // Dedup: skip if an undismissed rec of same type exists
    const existing = await (r.maintenanceRecommendation as FM).findMany({
      where: {
        assetId,
        organizationId,
        recommendationType: def.recommendationType,
        dismissed: false,
      },
      take: 1,
    });
    if (existing.length > 0) continue;

    await (r.maintenanceRecommendation as FC).create({
      data: {
        organizationId,
        assetId,
        recommendationType: def.recommendationType,
        priority:           def.priority,
        title:              def.title,
        description:        def.description,
        confidence:         confidence,
        evidence:           [],
        evidenceRecordIds:  [],
        metadata:           { source: "automation_v49", riskScore },
      },
    });
    maintenanceCreated++;
  }

  return {
    assetId,
    riskScore,
    riskLevel:         riskLevel(riskScore),
    healthScore:       currentHealthScore,
    alertsCreated,
    maintenanceCreated,
    snapshotCreated:   true,
  };
}

// ── Health trend helper ───────────────────────────────────────────────────────

function deriveHealthTrend(history: { healthScore: number }[]): string {
  if (history.length < 2) return "unknown";
  const recent = history.slice(0, 3).map((h) => h.healthScore);
  const older  = history.slice(-3).map((h) => h.healthScore);
  const avgR   = recent.reduce((a, b) => a + b, 0) / recent.length;
  const avgO   = older.reduce((a, b)  => a + b, 0) / older.length;
  const delta  = avgR - avgO;
  if (delta > 3)  return "improving";
  if (delta < -3) return "degrading";
  return "stable";
}
