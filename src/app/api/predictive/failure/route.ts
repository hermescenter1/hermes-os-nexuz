import { NextRequest, NextResponse }         from "next/server";
import { requirePlatformAuth }              from "@/lib/api/auth";
import { requireOrgActor }                 from "@/lib/org/context";
import { requirePermission }               from "@/lib/org/rbac";
import { calculateFailureProbability }     from "@/lib/predictive/failure";
import { recordAuditEvent, PREDICTIVE_AUDIT } from "@/lib/audit/audit-service";
import { meterIndustrialEvent }            from "@/lib/api/meter";
import { listAssets, getAsset }            from "@/lib/industrial/assets";
import { getAllowedSiteIds }               from "@/lib/site/context";

/**
 * GET /api/predictive/failure?assetId=xxx
 *
 * Returns failure probability for one asset or all accessible assets.
 * organizationId from authenticated context only.
 * Phase 46: site isolation applied — respects allowedSiteIds for all access paths.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_predictive");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const { searchParams } = new URL(req.url);
  const assetId = searchParams.get("assetId");

  meterIndustrialEvent(ctx.orgId, "predictive_queries");

  const allowedSiteIds = await getAllowedSiteIds(member.ctx.userId, ctx.orgId);

  if (assetId) {
    const asset = await getAsset(assetId, ctx.orgId);
    if (!asset || !allowedSiteIds.includes(asset.siteId)) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }
    const result = await calculateFailureProbability(ctx.orgId, assetId);
    recordAuditEvent({
      action:     PREDICTIVE_AUDIT.RISK_SCORE_CALCULATED,
      entityType: "asset",
      entityId:   assetId,
      userId:     ctx.userId ?? undefined,
      metadata:   { organizationId: ctx.orgId, assetId, type: "failure_probability" },
    });
    return NextResponse.json({ result });
  }

  if (allowedSiteIds.length === 0) return NextResponse.json({ results: [] });

  const assets  = await listAssets(ctx.orgId, { allowedSiteIds });
  const results = await Promise.all(
    assets.slice(0, 50).map((a) => calculateFailureProbability(ctx.orgId, a.id)),
  );

  recordAuditEvent({
    action:     PREDICTIVE_AUDIT.ANALYSIS_RUN,
    entityType: "organization",
    entityId:   ctx.orgId,
    userId:     ctx.userId ?? undefined,
    metadata:   { organizationId: ctx.orgId, type: "failure_probability_batch" },
  });

  return NextResponse.json({ results });
}
