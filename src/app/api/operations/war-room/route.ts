/**
 * GET /api/operations/war-room
 * Phase 57 — Executive War Room incident feed.
 *
 * Returns documented incidents (critical alarm → case → root cause → resolution)
 * sorted by impact score. All data from the engineering knowledge base — no AI.
 */
import { NextResponse }  from "next/server";
import { buildEngGraph } from "@/lib/eng-graph/builder";
import type { WarRoomData, WarRoomIncident, AlertSeverity } from "@/lib/operations/types";

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

    const incidents: WarRoomIncident[] = [];

    // For each ALARM node, build a complete incident chain
    const alarmNodes = nodes.filter(n => n.type === "ALARM");

    for (const alarm of alarmNodes) {
      const category = String(alarm.properties.category ?? "");
      const sev      = alarmSeverity(category);

      // ALARM → TRIGGERS → CASE
      const triggerEdge = edges.find(e => e.source === alarm.id && e.type === "TRIGGERS");
      if (!triggerEdge) continue;

      const caseNode = nodes.find(n => n.id === triggerEdge.target && n.type === "CASE");
      if (!caseNode) continue;

      // CASE → CAUSED_BY → ROOT_CAUSE
      const rcEdge   = edges.find(e => e.source === caseNode.id && e.type === "CAUSED_BY");
      const rcNode   = rcEdge ? nodes.find(n => n.id === rcEdge.target) : null;

      // ROOT_CAUSE → RESOLVED_BY → RESOLUTION
      const resEdge  = rcNode ? edges.find(e => e.source === rcNode.id && e.type === "RESOLVED_BY") : null;
      const resNode  = resEdge ? nodes.find(n => n.id === resEdge.target) : null;

      // Device that generates the alarm
      const genEdge    = edges.find(e => e.target === alarm.id && e.type === "GENERATES");
      const deviceNode = genEdge ? nodes.find(n => n.id === genEdge.source) : null;
      const vendorId   = deviceNode ? String(deviceNode.properties.vendor ?? "") : "";
      const vendorNode = vendorId ? nodes.find(n => n.id === `vendor-${vendorId}`) : null;

      incidents.push({
        id:          `incident-${alarm.id}`,
        caseId:      caseNode.id,
        title:       caseNode.label,
        severity:    sev,
        vendor:      vendorId,
        vendorName:  vendorNode?.label ?? vendorId,
        category,
        symptoms:    caseNode.label,
        rootCause:   rcNode?.label  ?? "Root cause under investigation",
        resolution:  resNode?.label ?? "Resolution in progress",
        alarmId:     alarm.id,
        alarmLabel:  alarm.label,
        impactScore: alarm.impactScore,
      });
    }

    // Sort: critical first, then by impact score desc
    const SEV_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
    incidents.sort((a, b) => {
      const sd = SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
      return sd !== 0 ? sd : b.impactScore - a.impactScore;
    });

    // System state summary
    const vendorNodes = nodes.filter(n => n.type === "VENDOR");
    let onlineCount    = 0;
    let warningCount   = 0;
    let criticalCount  = 0;
    let simulatedCount = 0;

    for (const v of vendorNodes) {
      // Get alarms for this vendor
      const productIds = edges.filter(e => e.source === v.id && e.type === "USES").map(e => e.target);
      const deviceIds: string[] = [];
      productIds.forEach(pid =>
        edges.filter(e => e.source === pid && e.type === "USES").forEach(e => deviceIds.push(e.target)),
      );
      const hasAlarm = deviceIds.some(did =>
        edges.some(e => e.source === did && e.type === "GENERATES"),
      );
      const hasCritical = incidents.some(i => i.vendor === String(v.properties.vendorId) && i.severity === "critical");

      if (hasCritical) criticalCount++;
      else if (hasAlarm) warningCount++;
      else onlineCount++;
    }
    simulatedCount = 2; // phase2 + simulated from PLATFORM_COMPONENTS

    const criticalVendors = incidents
      .filter(i => i.severity === "critical")
      .map(i => i.vendorName)
      .filter((v, idx, arr) => arr.indexOf(v) === idx);

    const data: WarRoomData = {
      incidents,
      systemState: {
        online:    onlineCount,
        warning:   warningCount,
        critical:  criticalCount,
        simulated: simulatedCount,
      },
      criticalVendors,
      builtAt: new Date().toISOString(),
    };

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "war_room_unavailable" }, { status: 500 });
  }
}
