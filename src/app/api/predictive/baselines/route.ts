import { NextRequest, NextResponse }        from "next/server";
import { requirePlatformAuth }             from "@/lib/api/auth";
import { requireOrgActor }                from "@/lib/org/context";
import { requirePermission }              from "@/lib/org/rbac";
import { buildBaseline, getBaseline }     from "@/lib/predictive/baseline";
import { recordAuditEvent, PREDICTIVE_AUDIT } from "@/lib/audit/audit-service";
import { meterIndustrialEvent }           from "@/lib/api/meter";

/**
 * GET /api/predictive/baselines?assetId=xxx&windowDays=90
 *   Returns the most recent baseline for the asset (or builds one if absent).
 *
 * POST /api/predictive/baselines
 *   Body: { assetId, windowDays? }
 *   Triggers a fresh baseline computation and returns it.
 *
 * organizationId always from authenticated context.
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
  const assetId    = searchParams.get("assetId");
  const windowRaw  = searchParams.get("windowDays");
  const windowDays = windowRaw ? parseInt(windowRaw, 10) : 90;

  if (!assetId) return NextResponse.json({ error: "assetId is required" }, { status: 400 });
  if (![30, 90, 180].includes(windowDays)) {
    return NextResponse.json({ error: "windowDays must be 30, 90, or 180" }, { status: 400 });
  }

  meterIndustrialEvent(ctx.orgId, "predictive_queries");

  const baseline = await getBaseline(ctx.orgId, assetId, windowDays as 30 | 90 | 180);
  return NextResponse.json({ baseline: baseline ?? null });
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_predictive");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const body = await req.json().catch(() => ({}));
  const { assetId, windowDays = 90 } = body as Record<string, unknown>;

  if (!assetId || typeof assetId !== "string") {
    return NextResponse.json({ error: "assetId is required" }, { status: 400 });
  }
  if (![30, 90, 180].includes(Number(windowDays))) {
    return NextResponse.json({ error: "windowDays must be 30, 90, or 180" }, { status: 400 });
  }

  meterIndustrialEvent(ctx.orgId, "predictive_queries");

  const baseline = await buildBaseline(ctx.orgId, assetId, Number(windowDays) as 30 | 90 | 180);

  recordAuditEvent({
    action:     PREDICTIVE_AUDIT.ANALYSIS_RUN,
    entityType: "asset",
    entityId:   assetId,
    userId:     ctx.userId ?? undefined,
    metadata:   { organizationId: ctx.orgId, assetId, windowDays, type: "baseline" },
  });

  return NextResponse.json({ baseline });
}
