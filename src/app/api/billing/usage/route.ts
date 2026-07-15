/**
 * Billing usage API (Phase 31).
 *
 * GET  /api/billing/usage          — usage summary for current 30-day window
 * POST /api/billing/usage          — record a usage event
 */

import { NextRequest, NextResponse }    from "next/server";
import { requireOrgContext }             from "@/lib/billing/context";
import { requirePermission }             from "@/lib/org/rbac";
import { recordUsage }                   from "@/lib/billing/usage";
import { getPlanLimitReport }            from "@/lib/billing/limit-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await requireOrgContext(req);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { ctx } = result;
  const report  = await getPlanLimitReport(ctx.orgId);
  return NextResponse.json({
    organizationId: ctx.orgId,
    summary:        report.usage,
    limits:         report.limits,
    statuses:       report.statuses,
    access:         report.access,
    planName:       report.planName,
  });
}

export async function POST(req: NextRequest) {
  const result = await requireOrgContext(req);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { ctx } = result;
  const perm = requirePermission(ctx.role, "manage_billing");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const { metric, value } = body as { metric?: string; value?: number };

  if (!metric || typeof metric !== "string") {
    return NextResponse.json({ error: "metric is required" }, { status: 400 });
  }
  if (typeof value !== "number" || value < 0) {
    return NextResponse.json({ error: "value must be a non-negative number" }, { status: 400 });
  }

  const ok = await recordUsage(ctx.orgId, metric, value);
  if (!ok) return NextResponse.json({ error: "Failed to record usage" }, { status: 503 });
  return NextResponse.json({ ok: true });
}
