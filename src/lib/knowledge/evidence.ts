/**
 * Knowledge evidence assembly — Phase 40.
 *
 * assembleKnowledgeEvidence() gathers real evidence from:
 *   - Phase 39 PM records (AssetRiskScore, FailureIndicator, RULSnapshot)
 *   - Phase 36 Digital Twin (connected/downstream assets)
 *   - Phase 35 telemetry (recent quality summary)
 *   - Phase 40 AssetKnowledgeLink (linked articles, procedures, cases)
 *
 * READ-ONLY: No writes to any table. Evidence only.
 */

import { getPrisma }            from "@/lib/db/prisma";
import { getConnectedAssets }   from "@/lib/digital-twin/graph";
import type { AuthorizedAsset } from "./rootcauses";
import type { KnowledgeEvidence } from "./types";

/**
 * Slice D2: evidence is assembled only for an {@link AuthorizedAsset} — an asset proven to be the
 * organisation's and to stand on one of the caller's readable ACTIVE sites — and the Digital Twin
 * neighbour count is limited to `allowedSiteIds`. A client-supplied asset id never reaches these reads.
 */
export async function assembleKnowledgeEvidence(
  organizationId: string,
  asset:          AuthorizedAsset,
  allowedSiteIds: readonly string[],
): Promise<KnowledgeEvidence[]> {
  const assetId = asset.id;
  const evidence: KnowledgeEvidence[] = [];
  const db = await getPrisma();
  if (!db) return evidence;
  const d = db as unknown as Record<string, unknown>;

  // Phase 39: most recent risk score
  try {
    type RSModel = { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };
    const rs = await (d.assetRiskScore as unknown as RSModel).findFirst({
      where: { organizationId, assetId }, orderBy: { createdAt: "desc" },
    });
    if (rs) {
      evidence.push({
        type:      "predictive",
        recordId:  rs.id as string,
        assetId,
        description: `Risk score: ${(rs.riskScore as number).toFixed(0)}/100 (${rs.confidence}) — Phase 39`,
      });
    }
  } catch { /* best-effort */ }

  // Phase 39: failure indicator
  try {
    type FIModel = { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };
    const fi = await (d.failureIndicator as unknown as FIModel).findFirst({
      where: { organizationId, assetId }, orderBy: { createdAt: "desc" },
    });
    if (fi) {
      evidence.push({
        type:      "predictive",
        recordId:  fi.id as string,
        assetId,
        description: `Failure probability: ${fi.probability} (${fi.degradationClass}) — Phase 39`,
      });
    }
  } catch { /* best-effort */ }

  // Phase 39: RUL snapshot
  try {
    type RULModel = { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };
    const rul = await (d.rULSnapshot as unknown as RULModel).findFirst({
      where: { organizationId, assetId }, orderBy: { createdAt: "desc" },
    });
    if (rul) {
      const desc = rul.state === "estimated"
        ? `RUL: ${rul.minDays}–${rul.maxDays} days estimated — Phase 39`
        : `RUL state: ${rul.state} — Phase 39`;
      evidence.push({ type: "predictive", recordId: rul.id as string, assetId, description: desc });
    }
  } catch { /* best-effort */ }

  // Phase 36: connected assets (informational — not a dependency list)
  // getConnectedAssets takes nodeId (DigitalTwinNode.id), so look up the node first.
  try {
    type NodeModel = { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };
    const node = await (d.digitalTwinNode as unknown as NodeModel).findFirst({
      where:   { organizationId, assetId, siteId: { in: [...allowedSiteIds] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (node) {
      const nodeId = node.id as string;
      const connected = await getConnectedAssets(nodeId, organizationId, allowedSiteIds)
        .catch(() => ({ nodes: [], truncated: false }));
      if (connected.nodes.length > 0) {
        evidence.push({
          type:      "asset",
          assetId,
          description: `${connected.nodes.length}${connected.truncated ? "+" : ""} connected asset(s) in Digital Twin — Phase 36`,
        });
      }
    }
  } catch { /* best-effort */ }

  // Phase 35: recent telemetry quality (last 24 hours)
  try {
    const since = new Date(Date.now() - 86_400_000);
    type TelModel = { count: (a: unknown) => Promise<number> };
    const [good, total] = await Promise.all([
      (d.telemetryRecord as unknown as TelModel).count({
        where: { organizationId, assetId, quality: "GOOD", receivedAt: { gte: since } },
      }),
      (d.telemetryRecord as unknown as TelModel).count({
        where: { organizationId, assetId, receivedAt: { gte: since } },
      }),
    ]);
    if (total > 0) {
      const pct = ((good / total) * 100).toFixed(0);
      evidence.push({
        type:      "telemetry",
        assetId,
        description: `Telemetry quality (24h): ${pct}% GOOD (${good}/${total} records)`,
      });
    }
  } catch { /* best-effort */ }

  return evidence;
}
