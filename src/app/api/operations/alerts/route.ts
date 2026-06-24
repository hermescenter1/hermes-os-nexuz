/**
 * GET /api/operations/alerts?severity=critical|warning|info
 * Phase 57 — Enterprise Alert Command Center feed.
 *
 * Returns all ALARM nodes from the engineering graph, enriched with
 * vendor and device context, sorted by severity then label.
 * Deterministic. No AI.
 */
import { NextResponse }  from "next/server";
import { buildEngGraph } from "@/lib/eng-graph/builder";
import type { OperationsAlert, AlertSeverity } from "@/lib/operations/types";

export const dynamic = "force-dynamic";

const CRITICAL_CATEGORIES = new Set(["Safety", "CPU", "Power", "Thermal"]);
const WARNING_CATEGORIES  = new Set([
  "Communication", "Network", "Motor", "I/O",
  "Measurement", "Feedback", "Serial", "IoT Network",
]);

function severity(category: string): AlertSeverity {
  if (CRITICAL_CATEGORIES.has(category)) return "critical";
  if (WARNING_CATEGORIES.has(category))  return "warning";
  return "info";
}

const SEV_ORDER: Record<AlertSeverity, number> = {
  critical: 0, warning: 1, info: 2,
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const filterSev = searchParams.get("severity") as AlertSeverity | null;

  try {
    const { nodes, edges } = await buildEngGraph();

    const alarmNodes = nodes.filter(n => n.type === "ALARM");
    const alerts: OperationsAlert[] = [];

    for (const alarm of alarmNodes) {
      const category = String(alarm.properties.category ?? "");
      const sev      = severity(category);
      if (filterSev && sev !== filterSev) continue;

      // Find device that GENERATES this alarm
      const genEdge   = edges.find(e => e.target === alarm.id && e.type === "GENERATES");
      const deviceNode = genEdge ? nodes.find(n => n.id === genEdge.source) : null;

      // Find vendor of that device
      let vendorNode   = null;
      let vendorId     = "";
      let vendorName   = "";

      if (deviceNode) {
        // Device → USES (reverse) → PRODUCT → USES (reverse) → VENDOR is complex
        // Simpler: read vendorId from device properties
        vendorId = String(deviceNode.properties.vendor ?? "");
        vendorNode = nodes.find(n => n.id === `vendor-${vendorId}`);
        vendorName = vendorNode?.label ?? vendorId;
      }

      // Find linked case via alarm → TRIGGERS → case
      const triggerEdge = edges.find(e => e.source === alarm.id && e.type === "TRIGGERS");
      const caseId      = triggerEdge?.target ?? "";

      alerts.push({
        id:          alarm.id,
        label:       alarm.label,
        category,
        severity:    sev,
        vendor:      vendorId,
        vendorName,
        deviceId:    deviceNode?.id  ?? "",
        deviceLabel: deviceNode?.label ?? "",
        caseId,
        status:      "active",
      });
    }

    // Sort: severity order, then label alphabetically
    alerts.sort((a, b) => {
      const sd = SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
      return sd !== 0 ? sd : a.label.localeCompare(b.label);
    });

    // Category histogram
    const histogram = new Map<string, { count: number; severity: AlertSeverity }>();
    for (const a of alerts) {
      if (!histogram.has(a.category)) {
        histogram.set(a.category, { count: 0, severity: a.severity });
      }
      histogram.get(a.category)!.count++;
    }
    const byCategory = Array.from(histogram.entries()).map(([cat, val]) => ({
      category: cat,
      count:    val.count,
      severity: val.severity,
    })).sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);

    return NextResponse.json({
      alerts,
      byCategory,
      counts: {
        total:    alerts.length,
        critical: alerts.filter(a => a.severity === "critical").length,
        warning:  alerts.filter(a => a.severity === "warning").length,
        info:     alerts.filter(a => a.severity === "info").length,
      },
      builtAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "alerts_unavailable" }, { status: 500 });
  }
}
