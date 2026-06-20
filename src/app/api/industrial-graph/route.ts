/**
 * GET /api/industrial-graph
 *
 * Returns the full industrial knowledge graph for the org (all nodes + edges)
 * with staleness information. Always returns results even when graph is stale.
 *
 * Phase 41 — Industrial Knowledge Graph.
 * Distinct from Phase 21A /api/knowledge-graph (brain analytics graph).
 */

import { NextRequest, NextResponse }           from "next/server";
import { requirePlatformAuth }                  from "@/lib/api/auth";
import { requireOrgActor }                      from "@/lib/org/context";
import { requirePermission }                    from "@/lib/org/rbac";
import { getKnowledgeGraph }                    from "@/lib/knowledge-graph/query";
import { recordAuditEvent, KNOWLEDGE_GRAPH_AUDIT } from "@/lib/audit/audit-service";
import { meterIndustrialEvent }                 from "@/lib/api/meter";
import { getAllowedSiteIds }                     from "@/lib/site/context";
import { getPrisma }                             from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_knowledge_graph");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  meterIndustrialEvent(ctx.orgId, "knowledge_graph_queries");

  // Phase 43: resolve allowed sites, then filter ASSET nodes to prevent cross-site leaks
  const allowedSiteIds = await getAllowedSiteIds(member.ctx.userId, ctx.orgId);
  let allowedAssetIds: Set<string> | undefined;

  if (allowedSiteIds.length > 0) {
    const db = await getPrisma();
    if (db) {
      type AssetM = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
      const rows = await (db as unknown as Record<string, unknown>).industrialAsset as unknown as AssetM;
      const assets = await rows.findMany({
        where:  { organizationId: ctx.orgId, siteId: { in: allowedSiteIds } },
        select: { id: true },
      });
      allowedAssetIds = new Set(assets.map(a => String(a.id)));
    }
  } else {
    // No accessible sites → empty asset set → ASSET nodes removed from graph
    allowedAssetIds = new Set<string>();
  }

  const result = await getKnowledgeGraph(ctx.orgId, allowedAssetIds);

  recordAuditEvent({
    userId:     ctx.userId ?? undefined,
    action:     KNOWLEDGE_GRAPH_AUDIT.GRAPH_QUERY,
    entityType: "knowledge_graph",
    entityId:   ctx.orgId,
    metadata:   { organizationId: ctx.orgId, nodeCount: result.nodeCount, edgeCount: result.edgeCount, stale: result.staleness.stale },
  });

  return NextResponse.json(result);
}
