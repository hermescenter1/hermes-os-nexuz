import { NextRequest, NextResponse }        from "next/server";
import { requirePlatformAuth }             from "@/lib/api/auth";
import { requireOrgActor }                from "@/lib/org/context";
import { requirePermission }              from "@/lib/org/rbac";
import { calculateRiskScore }             from "@/lib/predictive/risk";
import { recordAuditEvent, PREDICTIVE_AUDIT } from "@/lib/audit/audit-service";
import { meterIndustrialEvent }           from "@/lib/api/meter";
import { listAssets }                     from "@/lib/industrial/assets";

/**
 * GET /api/predictive/risk?assetId=xxx
 *
 * Returns risk score for one asset (assetId param) or all assets in the org.
 * organizationId always from authenticated context — never from payload.
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
  meterIndustrialEvent(ctx.orgId, "risk_score_calculations");

  if (assetId) {
    const result = await calculateRiskScore(ctx.orgId, assetId);
    recordAuditEvent({
      action:     PREDICTIVE_AUDIT.RISK_SCORE_CALCULATED,
      entityType: "asset",
      entityId:   assetId,
      userId:     ctx.userId ?? undefined,
      metadata:   { organizationId: ctx.orgId, assetId, hasData: !("state" in result) },
    });
    return NextResponse.json({ result });
  }

  // All assets
  const assets = await listAssets(ctx.orgId);
  const results = await Promise.all(
    assets.slice(0, 50).map((a) => calculateRiskScore(ctx.orgId, a.id)),
  );

  recordAuditEvent({
    action:     PREDICTIVE_AUDIT.ANALYSIS_RUN,
    entityType: "organization",
    entityId:   ctx.orgId,
    userId:     ctx.userId ?? undefined,
    metadata:   { organizationId: ctx.orgId, assetCount: assets.length },
  });

  return NextResponse.json({ results });
}
