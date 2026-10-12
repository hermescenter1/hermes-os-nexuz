/**
 * GET /api/multi-site/failure-patterns
 *
 * Returns the cross-site failure patterns of the latest SUCCESS benchmark, PROJECTED for the caller.
 * A pattern exists when the same IndustrialFailureMode.id appears in eligible IndustrialEngineeringCase
 * rows on 2+ distinct sites; a case is eligible only when its site and (if it claims one) its asset
 * agree and belong to the organisation (lib/multi-site/projection.ts, same policy as RV-01).
 * Deterministic: same DB state → same results.
 *
 * The stored pattern rows are ORGANISATION-wide. The caller receives a pattern only if at least TWO of
 * the sites they may read each contribute valid evidence, and every field of it — sites, case ids, asset
 * ids, per-site evidence, counts, asset types — is rebuilt from that evidence alone. A pattern that would
 * keep a single readable site is omitted entirely, so nothing hints that another site took part.
 *
 * Phase 42 — Multi-Site Industrial Intelligence.
 */

import { NextRequest, NextResponse }         from "next/server";
import { requirePlatformAuth }                from "@/lib/api/auth";
import { requireOrgActor }                    from "@/lib/org/context";
import { requirePermission }                  from "@/lib/org/rbac";
import { getLatestBenchmark }                 from "@/lib/multi-site/benchmarks";
import { MIN_SITES_FOR_PATTERN }              from "@/lib/multi-site/types";
import { projectPersistedPatterns }           from "@/lib/multi-site/projection";
import { resolveMultiSiteScope }              from "@/lib/multi-site/scope";
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

  // The viewer's scope: official allowed sites ∩ ACTIVE sites of THIS organisation (server derived).
  const siteIds = await resolveMultiSiteScope(member.ctx.userId, ctx.orgId);

  if (siteIds.length === 0) {
    return NextResponse.json({ patterns: [], reason: "No accessible sites." });
  }
  // A cross-site pattern needs two readable sites; decided from the caller's own scope, before any
  // benchmark is read, so the answer cannot hint at hidden data.
  if (siteIds.length < MIN_SITES_FOR_PATTERN) {
    return NextResponse.json({ patterns: [], reason: "Insufficient accessible sites for cross-site patterns." });
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

  const rows = await (db.crossSiteFailurePattern as unknown as PatModel).findMany({
    where: { benchmarkId: bm.id, organizationId: ctx.orgId },
  });

  // Projection, not filtering: the stored rows are used only as lookup keys.
  const patterns = await projectPersistedPatterns(db, ctx.orgId, siteIds, rows);

  recordAuditEvent({
    userId:     ctx.userId ?? undefined,
    action:     MULTI_SITE_AUDIT.CROSS_SITE_FAILURE_PATTERN_QUERIED,
    entityType: "multi_site",
    entityId:   ctx.orgId,
    metadata:   { organizationId: ctx.orgId, patternCount: patterns.length },
  }).catch(() => undefined);

  return NextResponse.json({
    benchmarkId:   bm.id,
    computedAt:    bm.computedAt,
    stale:         bm.stale,
    stalenessWarning: bm.stalenessWarning,
    matchingCriterion: "Same IndustrialFailureMode.id in eligible IndustrialEngineeringCase rows across 2+ distinct readable sites (case and asset must agree on the site). Deterministic — no fuzzy matching.",
    patterns,
  });
}
