import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAuth }      from "@/lib/api/auth";
import { requireOrgActor }          from "@/lib/org/context";
import { hasScope } from "@/lib/api/scopes";
import { requirePermission }        from "@/lib/org/rbac";
import { getAsset }                 from "@/lib/industrial/assets";
import { getPrisma }                from "@/lib/db/prisma";

type Params = { params: Promise<{ id: string }> };

type FM = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
type FF = { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };
type FU = { update:   (a: unknown) => Promise<Record<string, unknown>> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  if (ctx.authMethod === "jwt") {
    const member = await requireOrgActor(req, ctx.orgId);
    if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
    const perm = requirePermission(member.ctx.role, "view_industrial");
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
  }

  const asset = await getAsset(id, ctx.orgId);
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  const db = await getPrisma();
  if (!db) return NextResponse.json({ recommendations: [] });

  const r = db as unknown as Record<string, FM>;
  const includeDismissed = req.nextUrl.searchParams.get("includeDismissed") === "true";
  const where: Record<string, unknown> = { assetId: id, organizationId: ctx.orgId };
  if (!includeDismissed) where.dismissed = false;

  const recs = await r.maintenanceRecommendation.findMany({
    where,
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ recommendations: recs.map(normRec) });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;
  // Phase SECURITY-8 amendment: API-key function-level authorization.
  if (!hasScope(ctx.scopes, "industrial.write")) {
    return NextResponse.json({ error: "Missing required scope: industrial.write" }, { status: 403 });
  }

  if (ctx.authMethod === "jwt") {
    const member = await requireOrgActor(req, ctx.orgId);
    if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
    const perm = requirePermission(member.ctx.role, "manage_industrial");
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
  }

  const body = await req.json().catch(() => ({})) as { recId?: string };
  if (!body.recId) return NextResponse.json({ error: "recId required" }, { status: 400 });

  const db = await getPrisma();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const r = db as unknown as Record<string, FF & FU>;
  const existing = await r.maintenanceRecommendation.findFirst({
    where: { id: body.recId, assetId: id, organizationId: ctx.orgId },
  });
  if (!existing) return NextResponse.json({ error: "Recommendation not found" }, { status: 404 });

  const updated = await r.maintenanceRecommendation.update({
    where: { id: body.recId },
    data:  { dismissed: true },
  });
  return NextResponse.json({ recommendation: normRec(updated) });
}

function normRec(r: Record<string, unknown>) {
  return {
    id:                 r.id,
    assetId:            r.assetId,
    recommendationType: r.recommendationType,
    priority:           r.priority,
    title:              r.title,
    description:        r.description,
    confidence:         r.confidence,
    dismissed:          r.dismissed,
    createdAt:          new Date(r.createdAt as string).toISOString(),
    updatedAt:          new Date(r.updatedAt as string).toISOString(),
  };
}
