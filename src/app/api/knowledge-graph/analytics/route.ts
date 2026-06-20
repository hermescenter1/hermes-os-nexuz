import { NextResponse } from "next/server";
import { getGraphAnalytics } from "@/lib/services/graph-analytics-service";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { recordAuditEvent, ANALYTICS_AUDIT } from "@/lib/audit/audit-service";

const EMPTY_ANALYTICS = {
  centrality:          [],
  domainHealth:        [],
  projectConnectivity: [],
  health: {
    overallScore: 0, coverageScore: 0,
    connectivityScore: 0, qualityScore: 0,
    insights: [],
  },
};

/** GET /api/knowledge-graph/analytics — graph-level intelligence report. */
export async function GET() {
  const storageMode = getStorageMode();
  try {
    const result = await getGraphAnalytics();
    recordAuditEvent({
      action:     ANALYTICS_AUDIT.ANALYTICS_QUERY,
      entityType: "knowledge_graph",
      metadata:   { queryType: "graph_analytics", storageMode },
    }).catch(() => undefined);
    return NextResponse.json({ storageMode, ...result });
  } catch {
    return NextResponse.json({ storageMode, ...EMPTY_ANALYTICS });
  }
}
