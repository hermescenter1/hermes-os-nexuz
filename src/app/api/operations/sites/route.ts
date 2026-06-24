/**
 * GET /api/operations/sites
 * Phase 57 — Vendor Technology Zone status.
 *
 * Each industrial vendor = one monitored technology zone.
 * Derives health scores, alarm counts, and risk scores from the eng-graph.
 * Deterministic. No database. No AI.
 */
import { NextResponse }  from "next/server";
import { buildEngGraph } from "@/lib/eng-graph/builder";
import type { VendorZone, OperationalStatus, AlertSeverity } from "@/lib/operations/types";

export const dynamic = "force-dynamic";

const CRITICAL_CATEGORIES = new Set(["Safety", "CPU", "Power", "Thermal"]);
const WARNING_CATEGORIES  = new Set([
  "Communication", "Network", "Motor", "I/O",
  "Measurement", "Feedback", "Serial", "IoT Network",
]);

function alarmSeverity(category: string): AlertSeverity {
  if (CRITICAL_CATEGORIES.has(category)) return "critical";
  if (WARNING_CATEGORIES.has(category))  return "warning";
  return "info";
}

export async function GET() {
  try {
    const { nodes, edges } = await buildEngGraph();

    const vendorNodes = nodes.filter(n => n.type === "VENDOR");
    const zones: VendorZone[] = [];

    for (const vendor of vendorNodes) {
      const vendorId = String(vendor.properties.vendorId ?? vendor.id.replace("vendor-", ""));

      // Product IDs from vendor → USES → PRODUCT
      const productIds = edges
        .filter(e => e.source === vendor.id && e.type === "USES")
        .map(e => e.target);

      // Device IDs from PRODUCT → USES → DEVICE
      const deviceIds: string[] = [];
      for (const pid of productIds) {
        edges
          .filter(e => e.source === pid && e.type === "USES")
          .forEach(e => deviceIds.push(e.target));
      }

      // Alarm IDs from DEVICE → GENERATES → ALARM
      const alarmIds: string[] = [];
      for (const did of deviceIds) {
        edges
          .filter(e => e.source === did && e.type === "GENERATES")
          .forEach(e => alarmIds.push(e.target));
      }

      const alarmNodes = nodes.filter(n => alarmIds.includes(n.id) && n.type === "ALARM");
      let criticalAlarms = 0;
      let warningAlarms  = 0;

      for (const a of alarmNodes) {
        const sev = alarmSeverity(String(a.properties.category ?? ""));
        if (sev === "critical") criticalAlarms++;
        else if (sev === "warning") warningAlarms++;
      }

      // Protocol IDs from DEVICE → COMMUNICATES_WITH → PROTOCOL
      const protoIds = new Set<string>();
      for (const did of deviceIds) {
        edges
          .filter(e => e.source === did && e.type === "COMMUNICATES_WITH")
          .forEach(e => protoIds.add(e.target));
      }
      const protocolNodes = nodes.filter(n => protoIds.has(n.id) && n.type === "PROTOCOL");

      // Case count: VENDOR → REFERENCES → CASE
      const caseCount = edges.filter(e => e.source === vendor.id && e.type === "REFERENCES").length;

      // Derived scores
      const healthScore = Math.max(20, Math.round(
        100 - criticalAlarms * 20 - warningAlarms * 8,
      ));
      const riskScore = Math.min(95, Math.round(
        criticalAlarms * 22 + warningAlarms * 8,
      ));

      const status: OperationalStatus =
        criticalAlarms > 0 ? "critical" :
        warningAlarms  > 0 ? "warning"  :
        "online";

      zones.push({
        id:             vendor.id,
        vendor:         vendorId,
        name:           vendor.label,
        status,
        assetCount:     deviceIds.length,
        alarmCount:     alarmNodes.length,
        criticalAlarms,
        warningAlarms,
        healthScore,
        riskScore,
        protocols:      protocolNodes.map(p => p.label),
        caseCount,
      });
    }

    // Sort: critical first, then warning, then online; alphabetically within tier
    zones.sort((a, b) => {
      const tier = { critical: 0, warning: 1, online: 2, simulated: 3 };
      const td = (tier[a.status] ?? 4) - (tier[b.status] ?? 4);
      return td !== 0 ? td : a.name.localeCompare(b.name);
    });

    return NextResponse.json({ zones, builtAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: "sites_unavailable" }, { status: 500 });
  }
}
