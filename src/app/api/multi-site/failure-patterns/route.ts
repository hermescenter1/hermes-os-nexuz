/**
 * GET /api/multi-site/failure-patterns
 *
 * Returns cross-site failure patterns from the latest SUCCESS benchmark.
 * A pattern exists when the same IndustrialFailureMode.id appears in
 * IndustrialEngineeringCase rows across 2+ distinct siteId values.
 * Deterministic: same DB state → same results.
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_multi_site");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  meterIndustrialEvent(ctx.orgId, "cross_site_failure_queries");

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

  const rows = await (db.crossSiteFailurePattern as unknown as PatModel).findMany({
    where: { benchmarkId: bm.id },
  });

  recordAuditEvent({
    userId:     ctx.userId ?? undefined,
    action:     MULTI_SITE_AUDIT.CROSS_SITE_FAILURE_PATTERN_QUERIED,
    entityType: "multi_site",
    entityId:   ctx.orgId,
    metadata:   { organizationId: ctx.orgId, patternCount: rows.length },
  }).catch(() => undefined);

  return NextResponse.json({
    benchmarkId:   bm.id,
    computedAt:    bm.computedAt,
    stale:         bm.stale,
    stalenessWarning: bm.stalenessWarning,
    matchingCriterion: "Same IndustrialFailureMode.id in IndustrialEngineeringCase rows across 2+ distinct siteIds. Deterministic — no fuzzy matching.",
    patterns:      rows,
  });
}
