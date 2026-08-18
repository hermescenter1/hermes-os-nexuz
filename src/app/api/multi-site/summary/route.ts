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
import { emptyEnterpriseSummary }               from "@/lib/multi-site/summary-contract";
import type { EnterpriseSummaryResponse }        from "@/lib/multi-site/summary-contract";
import { recordAuditEvent, MULTI_SITE_AUDIT }   from "@/lib/audit/audit-service";
import { meterIndustrialEvent }                 from "@/lib/api/meter";
import { getAllowedSiteIds }                     from "@/lib/site/context";

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

  // Phase 43: scope summary to user's accessible sites
  const allowedSiteIds = member.ctx.userId
    ? await getAllowedSiteIds(member.ctx.userId, ctx.orgId)
    : undefined;

  // ZERO ACCESSIBLE SITES — a controlled EMPTY result, not a second response
  // shape. This branch used to answer `{ data: null, reason, siteCount: 0 }`,
  // which the dashboard typed as an EnterpriseSummary and dereferenced, so a
  // fully-authorized user whose organization had no ACTIVE site crashed the
  // page. It now returns the SAME contract as every other 200, with every
  // metric honestly empty (counts 0, measurements null, no benchmark claimed)
  // and `noAccessibleSites: true` so the client can render its empty state.
  if (allowedSiteIds !== undefined && allowedSiteIds.length === 0) {
    return NextResponse.json(emptyEnterpriseSummary(ctx.orgId) satisfies EnterpriseSummaryResponse);
  }

  const summary = await getEnterpriseIndustrialSummary(ctx.orgId);

  recordAuditEvent({
    userId:     ctx.userId ?? undefined,
    action:     MULTI_SITE_AUDIT.ENTERPRISE_SUMMARY_VIEWED,
    entityType: "multi_site",
    entityId:   ctx.orgId,
    metadata:   { organizationId: ctx.orgId, siteCount: summary.siteCount },
  }).catch(() => undefined);

  // One stable contract: the long-standing success payload plus the explicit
  // emptiness flag, so the client never has to infer "no data" from the values.
  const body: EnterpriseSummaryResponse = { ...summary, noAccessibleSites: false };
  return NextResponse.json(body);
}
