/**
 * GET /api/multi-site/knowledge-coverage
 *
 * Returns knowledge coverage per site — computed live from AssetKnowledgeLink.
 * coverageScore = (assetsWithLinks / assetCount) × 100.
 * No snapshot for this endpoint — data is cheap to compute live.
 *
 * Scope (slice D1, MS-04): the viewer's readable ACTIVE sites only, and a case link counts only when the
 * case is visible to the viewer under the canonical engineering-case policy.
 *
 * Phase 42 — Multi-Site Industrial Intelligence.
 */

import { NextRequest, NextResponse }         from "next/server";
import { requirePlatformAuth }                from "@/lib/api/auth";
import { requireOrgActor }                    from "@/lib/org/context";
import { requirePermission }                  from "@/lib/org/rbac";
import { getSiteKnowledgeCoverage }           from "@/lib/multi-site/knowledge";
import { getPrisma }                          from "@/lib/db/prisma";
import { recordAuditEvent, MULTI_SITE_AUDIT } from "@/lib/audit/audit-service";
import { meterIndustrialEvent }               from "@/lib/api/meter";
import { resolveMultiSiteScope }              from "@/lib/multi-site/scope";
import { createGraphViewerScope, hasOrganizationLevelAccess } from "@/lib/knowledge-graph/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SiteModel  = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
type AssetModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_multi_site");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  meterIndustrialEvent(ctx.orgId, "multi_site_queries");

  const prisma = await getPrisma();
  if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const db = prisma as unknown as Record<string, unknown>;

  // The viewer's scope: official allowed sites ∩ ACTIVE sites of THIS organisation (server derived).
  const allowedSiteIds = await resolveMultiSiteScope(member.ctx.userId, ctx.orgId);
  if (allowedSiteIds.length === 0) {
    return NextResponse.json({ sites: [] });
  }
  // Organisation-level (no site, no asset) cases are visible only to OWNER/ADMIN — the canonical policy.
  const scope = createGraphViewerScope(ctx.orgId, allowedSiteIds, hasOrganizationLevelAccess(member.ctx.role));

  const siteRows = await (db.industrialSite as unknown as SiteModel).findMany({
    where:   { organizationId: ctx.orgId, status: "ACTIVE", id: { in: allowedSiteIds } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select:  { id: true, name: true },
  });

  const siteMap    = new Map(siteRows.map(r => [r.id as string, r.name as string]));
  const siteIds    = [...siteMap.keys()];

  const assetRows = await (db.industrialAsset as unknown as AssetModel).findMany({
    where:  { organizationId: ctx.orgId, siteId: { in: siteIds } },
    select: { id: true, siteId: true },
  });

  const siteAssetMap = new Map<string, string[]>();
  for (const sid of siteIds) siteAssetMap.set(sid, []);
  for (const a of assetRows) {
    const sid = a.siteId as string;
    siteAssetMap.get(sid)?.push(a.id as string);
  }

  const coverage = await getSiteKnowledgeCoverage(scope, siteMap, siteAssetMap);

  recordAuditEvent({
    userId:     ctx.userId ?? undefined,
    action:     MULTI_SITE_AUDIT.KNOWLEDGE_COVERAGE_QUERIED,
    entityType: "multi_site",
    entityId:   ctx.orgId,
    metadata:   { organizationId: ctx.orgId, siteCount: coverage.length },
  }).catch(() => undefined);

  return NextResponse.json({ sites: coverage });
}
