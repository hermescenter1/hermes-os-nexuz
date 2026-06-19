/**
 * Deterministic recommendation engine — Phase 38.
 *
 * Maps insight types and context signals to structured recommendations.
 * Every recommendation carries evidence referencing real record IDs.
 * No hallucination: if there is no supporting evidence, no recommendation is made.
 *
 * READ-ONLY: No control commands, no PLC writes.
 */

import type { CopilotInsightRecord, CopilotRecommendation, CopilotEvidence } from "./types";

type RecommendationRule = {
  insightType:  string;
  priority:     "HIGH" | "MEDIUM" | "LOW";
  buildTitle:   (insight: CopilotInsightRecord) => string;
  buildDesc:    (insight: CopilotInsightRecord) => string;
};

const RULES: RecommendationRule[] = [
  {
    insightType: "repeated_fault",
    priority:    "HIGH",
    buildTitle:  (i) => `Inspect asset: ${i.metadata.assetId ?? i.assetId ?? ""}`,
    buildDesc:   (i) => `Asset has repeated faults (${i.metadata.faultCount ?? "?"} consecutive BAD/STALE records). Physical inspection and gateway communication check recommended.`,
  },
  {
    insightType: "declining_health",
    priority:    "HIGH",
    buildTitle:  (i) => `Schedule inspection: health declining`,
    buildDesc:   (i) => `Health score dropped by ${Number(i.metadata.drop ?? 0).toFixed(0)} points. Preventive maintenance review recommended before critical failure.`,
  },
  {
    insightType: "frequent_alarms",
    priority:    "MEDIUM",
    buildTitle:  (i) => `Review alarm configuration`,
    buildDesc:   (i) => `Alarm rate ${(Number(i.metadata.alarmRate ?? 0) * 100).toFixed(1)}% exceeds threshold. Review setpoints, signal quality, and filter logic.`,
  },
  {
    insightType: "stale_telemetry",
    priority:    "MEDIUM",
    buildTitle:  (i) => `Check communications`,
    buildDesc:   (i) => `Telemetry is stale for ${i.metadata.ageMinutes ?? "?"} minutes. Check gateway connection, network link, and data pipeline.`,
  },
  {
    insightType: "missing_telemetry",
    priority:    "MEDIUM",
    buildTitle:  (i) => `Verify gateway status`,
    buildDesc:   (i) => `No telemetry received. Confirm gateway is online and correctly configured for this asset.`,
  },
  {
    insightType: "abnormal_kpi",
    priority:    "MEDIUM",
    buildTitle:  (i) => `Maintenance review: low availability`,
    buildDesc:   (i) => `Availability ${Number(i.metadata.availability ?? 0).toFixed(1)}% is below threshold. Review maintenance history and operational schedule.`,
  },
  {
    insightType: "disconnected_asset",
    priority:    "LOW",
    buildTitle:  (i) => `Update digital twin topology`,
    buildDesc:   (i) => `Asset node is disconnected in the Digital Twin graph. Add appropriate PART_OF or CONNECTED_TO relations to reflect physical topology.`,
  },
];

export function generateRecommendations(insights: CopilotInsightRecord[]): CopilotRecommendation[] {
  const recommendations: CopilotRecommendation[] = [];
  const seen = new Set<string>();

  for (const insight of insights) {
    const rule = RULES.find((r) => r.insightType === insight.insightType);
    if (!rule) continue;

    const dedupKey = `${insight.insightType}_${insight.assetId ?? insight.siteId ?? "org"}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const evidence: CopilotEvidence[] = [{
      type:        "insight",
      recordId:    insight.id,
      assetId:     insight.assetId ?? undefined,
      description: insight.description,
      timeframe:   "last 24 hours",
    }];

    recommendations.push({
      id:          `${insight.insightType}_${insight.assetId ?? insight.organizationId}_${Date.now()}`,
      title:       rule.buildTitle(insight),
      description: rule.buildDesc(insight),
      priority:    rule.priority,
      evidence,
    });
  }

  // Sort: HIGH → MEDIUM → LOW
  const ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return recommendations.sort((a, b) => ORDER[a.priority] - ORDER[b.priority]);
}
