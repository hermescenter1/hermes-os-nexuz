import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAuth }      from "@/lib/api/auth";
import { requireOrgActor }          from "@/lib/org/context";
import { requirePermission }        from "@/lib/org/rbac";
import { getAsset }                 from "@/lib/industrial/assets";
import { getPrisma }                from "@/lib/db/prisma";

type Params = { params: Promise<{ id: string }> };

type FM = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

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
  if (!db) return NextResponse.json({ snapshots: [], riskHistory: [], healthHistory: [] });

  const r = db as unknown as Record<string, FM>;

  const [snapshots, riskHistory, healthHistory] = await Promise.all([
    r.assetIntelligenceSnapshot.findMany({
      where:   { assetId: id, organizationId: ctx.orgId },
      orderBy: { createdAt: "desc" },
      take:    30,
    }),
    r.assetRiskScore.findMany({
      where:   { assetId: id, organizationId: ctx.orgId },
      orderBy: { createdAt: "desc" },
      take:    30,
      select:  { riskScore: true, riskLevel: true, createdAt: true } as unknown as undefined,
    }),
    r.assetHealthHistory.findMany({
      where:   { assetId: id, organizationId: ctx.orgId },
      orderBy: { createdAt: "desc" },
      take:    30,
      select:  { healthScore: true, healthStatus: true, createdAt: true } as unknown as undefined,
    }),
  ]);

  return NextResponse.json({
    snapshots:     snapshots.map(normSnapshot),
    riskHistory:   riskHistory.map(normRisk),
    healthHistory: healthHistory.map(normHealth),
  });
}

function normSnapshot(r: Record<string, unknown>) {
  return {
    id:             r.id,
    riskScore:      r.riskScore,
    riskLevel:      r.riskLevel,
    healthScore:    r.healthScore,
    healthStatus:   r.healthStatus,
    healthTrend:    r.healthTrend,
    tagCount:       r.tagCount,
    knowledgeTotal: r.knowledgeTotal,
    deltaRiskScore: r.deltaRiskScore,
    deltaHealth:    r.deltaHealth,
    createdAt:      new Date(r.createdAt as string).toISOString(),
  };
}

function normRisk(r: Record<string, unknown>) {
  return {
    riskScore: r.riskScore,
    riskLevel: r.riskLevel,
    createdAt: new Date(r.createdAt as string).toISOString(),
  };
}

function normHealth(r: Record<string, unknown>) {
  return {
    healthScore:  r.healthScore,
    healthStatus: r.healthStatus,
    createdAt:    new Date(r.createdAt as string).toISOString(),
  };
}
