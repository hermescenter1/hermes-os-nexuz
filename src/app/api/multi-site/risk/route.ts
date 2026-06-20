/**
 * GET /api/multi-site/risk
 *
 * Returns site risk ranking from the latest SUCCESS benchmark snapshot.
 * Sites are ordered highest avgRiskScore first (most dangerous site first).
 * insufficientData sites appear at the end of the list.
 * Each site includes confidence, lastDataTimestamp, and riskDistribution.
 *
 * Phase 42 — Multi-Site Industrial Intelligence.
 */

import { NextRequest, NextResponse }         from "next/server";
import { requirePlatformAuth }                from "@/lib/api/auth";
import { requireOrgActor }                    from "@/lib/org/context";
import { requirePermission }                  from "@/lib/org/rbac";
import { getLatestBenchmark }                 from "@/lib/multi-site/benchmarks";
import { getPrisma }                          from "@/lib/db/prisma";
import { recordAuditEvent, MULTI_SITE_AUDIT } from "@/lib/audit/audit-service";
import { meterIndustrialEvent }               from "@/lib/api/meter";
import { getAllowedSiteIds }                   from "@/lib/site/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RiskModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_multi_site");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  meterIndustrialEvent(ctx.orgId, "multi_site_queries");

  const allowedSiteIds = member.ctx.userId
    ? await getAllowedSiteIds(member.ctx.userId, ctx.orgId)
    : undefined;

  if (allowedSiteIds !== undefined && allowedSiteIds.length === 0) {
    return NextResponse.json({ sites: [], reason: "No accessible sites." });
  }

  const bm = await getLatestBenchmark(ctx.orgId);
  if (!bm) {
    return NextResponse.json(
      { data: null, reason: "No benchmark computed yet. POST /api/multi-site/benchmarks to generate." },
      { status: 404 },
    );
  }

  const prisma = await getPrisma();
  if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const db = prisma as unknown as Record<string, unknown>;

  const siteFilter = allowedSiteIds ? { siteId: { in: allowedSiteIds } } : {};
  const rows = await (db.siteRiskSnapshot as unknown as RiskModel).findMany({
    where: { benchmarkId: bm.id, ...siteFilter },
  });

  recordAuditEvent({
    userId:     ctx.userId ?? undefined,
    action:     MULTI_SITE_AUDIT.SITE_RISK_RANKING_QUERIED,
    entityType: "multi_site",
    entityId:   ctx.orgId,
    metadata:   { organizationId: ctx.orgId, siteCount: rows.length },
  }).catch(() => undefined);

  return NextResponse.json({
    benchmarkId:   bm.id,
    computedAt:    bm.computedAt,
    stale:         bm.stale,
    stalenessWarning: bm.stalenessWarning,
    sites:         rows,
  });
}
