// PHASE 87F — pure derivation of the command surface from the existing
// DashboardSnapshot. JSX-free so it is directly unit-testable and provably
// traceable to real snapshot fields (no fabricated values).

import type { DashboardSnapshot, Severity } from "@/lib/services/types";
import { SEVERITY_RANK, posture, type DashboardPosture } from "./severity";

export interface DerivedAttentionItem {
  id: string;
  severity: Severity;
  /** kind → which reason string the UI localizes. */
  kind: "criticalAlarm" | "highAlarm" | "assetCritical" | "assetDue";
  /** message/asset key the UI localizes for the object title. */
  objectKey: string;
  /** already-localizable meta payload (numbers only; formatted by the UI). */
  ts?: number;
  dueDays?: number;
  href: string;
}

export interface CommandModel {
  posture: DashboardPosture;
  criticalCount: number;
  highCount: number;
  attention: DerivedAttentionItem[];
  risk: { score: number; trend: "up" | "down" | "flat"; factors: { key: string; weight: number }[] };
  evidence: { supported: number; watch: number; missing: number };
  readiness: "ready" | "guarded" | "hold";
  activeLines: number;
  totalLines: number;
  ts: number;
}

const OPS_HREF = "/dashboard/operations";
const PREDICTIVE_HREF = "/dashboard/predictive";

/**
 * Build the prioritized attention list from real alarm + maintenance data.
 * Only critical/high items surface (decision-relevant); sorted by severity
 * then recency/urgency. Capped so the panel stays scannable.
 */
export function deriveAttention(s: DashboardSnapshot, limit = 6): DerivedAttentionItem[] {
  const items: DerivedAttentionItem[] = [];

  for (const a of s.alarms.recent) {
    if (a.severity === "critical" || a.severity === "high") {
      items.push({
        id: `alarm-${a.id}`,
        severity: a.severity,
        kind: a.severity === "critical" ? "criticalAlarm" : "highAlarm",
        objectKey: a.msgKey,
        ts: a.ts,
        href: OPS_HREF,
      });
    }
  }

  for (const m of s.maintenance) {
    if (m.severity === "critical" || m.severity === "high") {
      items.push({
        id: `asset-${m.id}`,
        severity: m.severity,
        kind: m.severity === "critical" ? "assetCritical" : "assetDue",
        objectKey: m.assetKey,
        dueDays: m.dueDays,
        href: PREDICTIVE_HREF,
      });
    }
  }

  items.sort((a, b) => {
    const bySev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySev !== 0) return bySev;
    // alarms by most-recent, assets by soonest due
    const aUrg = a.ts ?? -(a.dueDays ?? 0);
    const bUrg = b.ts ?? -(b.dueDays ?? 0);
    return bUrg - aUrg;
  });

  return items.slice(0, limit);
}

/**
 * Evidence posture from real snapshot signals — a transparent, deterministic
 * mapping (NOT fabricated): supported = healthy control/IDS + clear alarm
 * classes; watch = active warning-class signals; missing = data-availability
 * gaps (offline devices / degraded IDS).
 */
export function deriveEvidence(s: DashboardSnapshot): { supported: number; watch: number; missing: number } {
  const idsOk = s.network.ids === "ok";
  const idsWarn = s.network.ids === "warning";
  const idsDegraded = s.network.ids === "degraded";
  const offlineDevices = Math.max(0, s.network.devices - s.network.online);
  const offlinePlc = s.plc.filter((p) => p.status !== "online").length;
  const offlineScada = s.scada.servers.filter((sv) => sv.status !== "online").length;

  const supported =
    (idsOk ? 1 : 0) +
    s.plc.filter((p) => p.status === "online").length +
    s.scada.servers.filter((sv) => sv.status === "online").length +
    (s.alarms.counts.critical === 0 ? 1 : 0);

  const watch = s.alarms.counts.high + s.alarms.counts.medium + (idsWarn ? 1 : 0);

  const missing = offlineDevices + offlinePlc + offlineScada + (idsDegraded ? 1 : 0);

  return { supported, watch, missing };
}

/** Safe-action readiness from the real risk score + critical count. */
export function deriveReadiness(riskScore: number, criticalCount: number): "ready" | "guarded" | "hold" {
  if (criticalCount > 0 || riskScore >= 75) return "hold";
  if (riskScore >= 50) return "guarded";
  return "ready";
}

export function buildCommandModel(s: DashboardSnapshot): CommandModel {
  const criticalCount = s.alarms.counts.critical;
  const highCount = s.alarms.counts.high;
  return {
    posture: posture(criticalCount, highCount),
    criticalCount,
    highCount,
    attention: deriveAttention(s),
    risk: s.risk,
    evidence: deriveEvidence(s),
    readiness: deriveReadiness(s.risk.score, criticalCount),
    activeLines: s.overview.activeLines,
    totalLines: s.overview.totalLines,
    ts: s.ts,
  };
}
