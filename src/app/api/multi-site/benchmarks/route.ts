/**
 * GET  /api/multi-site/benchmarks — Return latest SUCCESS benchmark snapshot.
 * POST /api/multi-site/benchmarks — Trigger a new benchmark computation.
 *
 * GET: Returns the latest SUCCESS MultiSiteBenchmark with all child snapshots.
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
import { getPrisma }                            from "@/lib/db/prisma";
import { recordAuditEvent, MULTI_SITE_AUDIT }   from "@/lib/audit/audit-service";
import { meterIndustrialEvent }                 from "@/lib/api/meter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RiskModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
type KPIModel  = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
type PatModel  = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_multi_site");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  meterIndustrialEvent(ctx.orgId, "site_benchmark_queries");

  const bm = await getLatestBenchmark(ctx.orgId);
  if (!bm) {
    return NextResponse.json(
      { data: null, reason: "No benchmark computed yet. POST /api/multi-site/benchmarks to generate." },
      { status: 404 },
    );
  }

  // Load child snapshots for the benchmark
  const prisma = await getPrisma();
  const db     = prisma as unknown as Record<string, unknown> | null;

  const [riskSnaps, kpiSnaps, patterns] = db ? await Promise.all([
    (db.siteRiskSnapshot as unknown as RiskModel).findMany({
      where: { benchmarkId: bm.id }, orderBy: [{ avgRiskScore: "desc" as unknown as undefined }],
    }),
    (db.siteKPIComparison as unknown as KPIModel).findMany({
      where: { benchmarkId: bm.id }, orderBy: [{ avgAvailability: "desc" as unknown as undefined }],
    }),
    (db.crossSiteFailurePattern as unknown as PatModel).findMany({
      where: { benchmarkId: bm.id }, orderBy: [{ siteCount: "desc" as unknown as undefined }],
    }),
  ]) : [[], [], []];

  return NextResponse.json({
    benchmark:    bm,
    riskRanking:  riskSnaps,
    kpiComparison: kpiSnaps,
    failurePatterns: patterns,
    computing:    isBenchmarkInFlight(ctx.orgId),
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

  try {
    const result = await runBenchmark(ctx.orgId);

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
