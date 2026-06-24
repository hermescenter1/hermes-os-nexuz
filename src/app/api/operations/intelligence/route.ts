/**
 * GET /api/operations/intelligence
 * Phase 57 — Industrial Intelligence Wall aggregate.
 *
 * Combines eng-graph stats, vendor breakdown, and platform facts.
 * Deterministic. No AI.
 */
import { NextResponse }        from "next/server";
import { buildEngGraph }       from "@/lib/eng-graph/builder";
import { PLATFORM_FACTS }      from "@/lib/industrial/platform-facts";
import { PLATFORM_COMPONENTS } from "@/lib/industrial/platform-facts";
import type { IntelligenceStats, AlertSeverity } from "@/lib/operations/types";

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
    const { nodes, edges, stats } = await buildEngGraph();

    // Vendor breakdown
    const vendorNodes = nodes.filter(n => n.type === "VENDOR");
    const vendorBreakdown = vendorNodes.map(v => {
      const vendorId = String(v.properties.vendorId ?? v.id.replace("vendor-", ""));

      // Assets: PRODUCT → USES → DEVICE (count devices)
      const productIds = edges
        .filter(e => e.source === v.id && e.type === "USES")
        .map(e => e.target);
      const assetCount = productIds.reduce((sum, pid) =>
        sum + edges.filter(e => e.source === pid && e.type === "USES").length, 0);

      // Cases: VENDOR → REFERENCES → CASE
      const caseCount = edges.filter(e => e.source === v.id && e.type === "REFERENCES").length;

      // Protocols: via devices
      const deviceIds: string[] = [];
      productIds.forEach(pid =>
        edges.filter(e => e.source === pid && e.type === "USES").forEach(e => deviceIds.push(e.target)),
      );
      const protoCount = new Set(
        deviceIds.flatMap(did =>
          edges.filter(e => e.source === did && e.type === "COMMUNICATES_WITH").map(e => e.target),
        ),
      ).size;

      // Alarms: DEVICE → GENERATES → ALARM
      const alarmCount = deviceIds.reduce((sum, did) =>
        sum + edges.filter(e => e.source === did && e.type === "GENERATES").length, 0);

      return {
        vendor:    vendorId,
        name:      v.label,
        cases:     caseCount,
        assets:    assetCount,
        protocols: protoCount,
        alarms:    alarmCount,
      };
    }).sort((a, b) => b.cases - a.cases);

    // Alarm category histogram
    const alarmNodes = nodes.filter(n => n.type === "ALARM");
    const catMap = new Map<string, { count: number; severity: AlertSeverity }>();
    for (const a of alarmNodes) {
      const cat = String(a.properties.category ?? "Other");
      const sev = alarmSeverity(cat);
      if (!catMap.has(cat)) catMap.set(cat, { count: 0, severity: sev });
      catMap.get(cat)!.count++;
    }
    const alarmsByCategory = Array.from(catMap.entries())
      .map(([category, v]) => ({ category, count: v.count, severity: v.severity }))
      .sort((a, b) => b.count - a.count);

    // Serialize Partial<Record<GraphNodeType, number>> → plain Record<string, number>
    const nodesByType: Record<string, number> = {};
    for (const [k, v] of Object.entries(stats.nodesByType)) {
      if (v !== undefined) nodesByType[k] = v;
    }
    const edgesByType: Record<string, number> = {};
    for (const [k, v] of Object.entries(stats.edgesByType)) {
      if (v !== undefined) edgesByType[k] = v;
    }

    const intelligence: IntelligenceStats = {
      graphNodes:      stats.totalNodes,
      graphEdges:      stats.totalEdges,
      graphDensity:    stats.graphDensity,
      vendors:         stats.vendors,
      protocols:       stats.protocols,
      assets:          stats.assets,
      cases:           stats.cases,
      knowledgeLinks:  stats.knowledgeLinks,
      vendorBreakdown,
      alarmsByCategory,
      nodesByType,
      edgesByType,
      platformFacts:   {
        knowledgeLibraries: PLATFORM_FACTS.knowledgeLibraries,
        engineeringCases:   PLATFORM_FACTS.engineeringCases,
        supportedVendors:   PLATFORM_FACTS.supportedVendors,
      },
      componentStates: PLATFORM_COMPONENTS.map(c => ({ key: c.key, state: c.state })),
    };

    return NextResponse.json(intelligence);
  } catch {
    return NextResponse.json({ error: "intelligence_unavailable" }, { status: 500 });
  }
}
