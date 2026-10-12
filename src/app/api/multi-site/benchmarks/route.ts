/**
 * GET  /api/multi-site/benchmarks — Return the latest SUCCESS benchmark, projected for the caller.
 * POST /api/multi-site/benchmarks — Trigger a new benchmark computation.
 *
 * GET: The stored benchmark and its child rows are ORGANISATION-wide. The caller receives a viewer-safe
 *      projection (see lib/multi-site/projection.ts): only rows of the sites the caller may read (ACTIVE
 *      sites of the organisation they hold a grant for), rankings and summary recomputed from those rows,
 *      and failure patterns rebuilt from live, policy-eligible cases that span two or more of their sites.
 *      Nothing from the stored summary or patterns is forwarded.
 *      With fewer than two readable sites there is no cross-site comparison to show.
 *      If no benchmark exists: 404 with instructions to POST.
 *      Includes stale: true if computedAt > SNAPSHOT_STALE_HOURS old.
 *
 * POST: Triggers a full benchmark run (RUNNING → SUCCESS | FAILED).
 *       Returns 409 if a run is already in flight for this org.
 *       Computation aggregates pre-computed Phase 37/39/40 data — no raw telemetry scan.
 *
 * Phase 42 — Multi-Site Industrial Intelligence.
 */

import { NextRequest, NextResponse }           from "next/server";
import { requirePlatformAuth }                  from "@/lib/api/auth";
import { requireOrgActor }                      from "@/lib/org/context";
import { requirePermission }                    from "@/lib/org/rbac";
import { getLatestBenchmark, runBenchmark, isBenchmarkInFlight } from "@/lib/multi-site/benchmarks";
import { MIN_SITES_FOR_COMPARISON }             from "@/lib/multi-site/types";
import { projectBenchmark, projectPersistedPatterns } from "@/lib/multi-site/projection";
import { resolveMultiSiteScope }                from "@/lib/multi-site/scope";
import { getPrisma }                            from "@/lib/db/prisma";
import { recordAuditEvent, MULTI_SITE_AUDIT }   from "@/lib/audit/audit-service";
import { meterIndustrialEvent }                 from "@/lib/api/meter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RowModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_multi_site");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  meterIndustrialEvent(ctx.orgId, "site_benchmark_queries");

  // The viewer's scope: official allowed sites ∩ ACTIVE sites of THIS organisation (server derived).
  const siteIds = await resolveMultiSiteScope(member.ctx.userId, ctx.orgId);

  if (siteIds.length === 0) {
    return NextResponse.json({ data: null, reason: "No accessible sites." });
  }
  // Decided from the caller's OWN scope, before any benchmark is read: no hint whether one exists.
  if (siteIds.length < MIN_SITES_FOR_COMPARISON) {
    return NextResponse.json({ data: null, reason: "Insufficient accessible sites for a cross-site benchmark." });
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

  // Child rows are read with the site predicate inside the query; the pattern rows are organisation-wide
  // cache and are only ever handed to the projection, never to the response.
  const [riskRows, kpiRows, patternRows] = await Promise.all([
    (db.siteRiskSnapshot as unknown as RowModel).findMany({ where: { benchmarkId: bm.id, organizationId: ctx.orgId, siteId: { in: siteIds } } }),
    (db.siteKPIComparison as unknown as RowModel).findMany({ where: { benchmarkId: bm.id, organizationId: ctx.orgId, siteId: { in: siteIds } } }),
    (db.crossSiteFailurePattern as unknown as RowModel).findMany({ where: { benchmarkId: bm.id, organizationId: ctx.orgId } }),
  ]);
  const patterns = await projectPersistedPatterns(db, ctx.orgId, siteIds, patternRows);
  const projected = projectBenchmark(bm, riskRows, kpiRows, patterns, siteIds);
  if (!projected) {
    return NextResponse.json({ data: null, reason: "Insufficient accessible sites for a cross-site benchmark." });
  }

  return NextResponse.json({
    benchmark:       projected.benchmark,
    riskRanking:     projected.riskRanking,
    kpiComparison:   projected.kpiComparison,
    failurePatterns: projected.failurePatterns,
    computing:       isBenchmarkInFlight(ctx.orgId),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_multi_site");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  if (isBenchmarkInFlight(ctx.orgId)) {
    return NextResponse.json(
      { error: "A benchmark is already in progress for this organization. Try again shortly." },
      { status: 409 },
    );
  }

  meterIndustrialEvent(ctx.orgId, "site_benchmark_runs");

  // Phase 43: scope benchmark run to the caller's accessible (ACTIVE) sites
  const allowedSiteIds = await resolveMultiSiteScope(member.ctx.userId, ctx.orgId);

  try {
    const result = await runBenchmark(ctx.orgId, allowedSiteIds);

    recordAuditEvent({
      userId:     ctx.userId ?? undefined,
      action:     MULTI_SITE_AUDIT.BENCHMARK_RUN,
      entityType: "multi_site",
      entityId:   ctx.orgId,
      metadata:   {
        organizationId: ctx.orgId,
        benchmarkId:    result.id,
        siteCount:      result.siteCount,
        status:         result.status,
      },
    }).catch(() => undefined);

    return NextResponse.json({ success: true, benchmark: result });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "BENCHMARK_IN_FLIGHT") {
      return NextResponse.json({ error: "Benchmark already in progress." }, { status: 409 });
    }
    return NextResponse.json({ error: "Benchmark failed. Check server logs." }, { status: 500 });
  }
}
