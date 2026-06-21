/**
 * GET /api/industrial-graph/assets/[assetId]
 *
 * Returns the knowledge subgraph rooted at an ASSET node,
 * plus the deterministic asset risk explanation.
 *
 * Phase 41 — Industrial Knowledge Graph.
 * Phase 44 — Site-level isolation: assetId must belong to an accessible site.
 */

import { NextRequest, NextResponse }             from "next/server";
import { requirePlatformAuth }                    from "@/lib/api/auth";
import { requireOrgActor }                        from "@/lib/org/context";
import { requirePermission }                      from "@/lib/org/rbac";
import { getAllowedSiteIds }                       from "@/lib/site/context";
import { getAsset }                               from "@/lib/industrial/assets";
import { getAssetKnowledgeGraph }                 from "@/lib/knowledge-graph/query";
import { explainAssetRisk }                       from "@/lib/knowledge-graph/reasoning";
import { recordAuditEvent, KNOWLEDGE_GRAPH_AUDIT } from "@/lib/audit/audit-service";
import { meterIndustrialEvent }                   from "@/lib/api/meter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req:     NextRequest,
  context: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await context.params;

  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_knowledge_graph");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  // Verify the asset belongs to a site accessible to this user
  const allowedSiteIds = await getAllowedSiteIds(member.ctx.userId, ctx.orgId);
  const asset = await getAsset(assetId, ctx.orgId);
  if (!asset || !allowedSiteIds.includes(asset.siteId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  meterIndustrialEvent(ctx.orgId, "knowledge_graph_queries");

  const [subgraph, explanation] = await Promise.all([
    getAssetKnowledgeGraph(ctx.orgId, assetId),
    explainAssetRisk(ctx.orgId, assetId),
  ]);

  recordAuditEvent({
    userId:     ctx.userId ?? undefined,
    action:     KNOWLEDGE_GRAPH_AUDIT.REASONING_QUERY,
    entityType: "knowledge_graph",
    entityId:   assetId,
    metadata:   { organizationId: ctx.orgId, assetId, queryType: "asset_graph", stale: subgraph.staleness.stale },
  });

  meterIndustrialEvent(ctx.orgId, "knowledge_graph_reasoning_queries");

  return NextResponse.json({ assetId, subgraph, explanation });
}
