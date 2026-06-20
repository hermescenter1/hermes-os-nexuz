/**
 * GET /api/multi-site/summary
 *
 * Returns the enterprise industrial summary for the authenticated org.
 * Reads from the latest SUCCESS MultiSiteBenchmark snapshot + KG staleness.
 * Does NOT trigger a new benchmark — use POST /api/multi-site/benchmarks for that.
 *
 * Phase 42 — Multi-Site Industrial Intelligence.
 */

import { NextRequest, NextResponse }           from "next/server";
import { requirePlatformAuth }                  from "@/lib/api/auth";
import { requireOrgActor }                      from "@/lib/org/context";
import { requirePermission }                    from "@/lib/org/rbac";
import { getEnterpriseIndustrialSummary }       from "@/lib/multi-site/summary";
import { recordAuditEvent, MULTI_SITE_AUDIT }   from "@/lib/audit/audit-service";
import { meterIndustrialEvent }                 from "@/lib/api/meter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_multi_site");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  meterIndustrialEvent(ctx.orgId, "enterprise_summary_queries");

  const summary = await getEnterpriseIndustrialSummary(ctx.orgId);

  recordAuditEvent({
    userId:     ctx.userId ?? undefined,
    action:     MULTI_SITE_AUDIT.ENTERPRISE_SUMMARY_VIEWED,
    entityType: "multi_site",
    entityId:   ctx.orgId,
    metadata:   { organizationId: ctx.orgId, siteCount: summary.siteCount },
  }).catch(() => undefined);

  return NextResponse.json(summary);
}
