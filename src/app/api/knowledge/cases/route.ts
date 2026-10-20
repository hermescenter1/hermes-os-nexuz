import { NextRequest, NextResponse }        from "next/server";
import { requirePlatformAuth }              from "@/lib/api/auth";
import { requireOrgActor }                  from "@/lib/org/context";
import { requirePermission }               from "@/lib/org/rbac";
import { listCases, createCase, searchCases } from "@/lib/knowledge/cases";
import { CaseScopeError, caseScopeHttp }    from "@/lib/knowledge/case-visibility";
import { resolveGraphViewerScope }          from "@/lib/knowledge-graph/visibility";
import { recordAuditEvent, KNOWLEDGE_AUDIT } from "@/lib/audit/audit-service";
import { meterIndustrialEvent }             from "@/lib/api/meter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_knowledge");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const { searchParams } = new URL(req.url);
  const q       = searchParams.get("q");
  const status  = searchParams.get("status") ?? undefined;
  const assetId = searchParams.get("assetId") ?? undefined;
  const parsed  = parseInt(searchParams.get("limit") ?? "50", 10);
  const limit   = Number.isFinite(parsed) && parsed > 0 ? Math.min(100, parsed) : 50;

  meterIndustrialEvent(ctx.orgId, "engineering_case_queries");

  // RV-01: server-built scope (role from requireOrgActor); no client value can widen it.
  const scope = await resolveGraphViewerScope(member.ctx.userId, ctx.orgId, member.ctx.role);

  if (q) {
    const cases = await searchCases(scope, q, limit);
    recordAuditEvent({ action: KNOWLEDGE_AUDIT.KNOWLEDGE_QUERY, entityType: "case", userId: ctx.userId ?? undefined, metadata: { organizationId: ctx.orgId, query: q } });
    return NextResponse.json({ cases });
  }

  const cases = await listCases(scope, status, assetId, limit);
  return NextResponse.json({ cases });
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "manage_knowledge");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const body = await req.json().catch(() => null);
  if (!body?.title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const scope = await resolveGraphViewerScope(member.ctx.userId, ctx.orgId, member.ctx.role);
  let engineeringCase;
  try {
    engineeringCase = await createCase(scope, body, ctx.userId ?? undefined);
  } catch (err) {
    if (err instanceof CaseScopeError) {
      const { status, error } = caseScopeHttp(err.code);
      return NextResponse.json({ error }, { status });
    }
    throw err;
  }
  if (!engineeringCase) return NextResponse.json({ error: "Failed to create case" }, { status: 500 });

  return NextResponse.json({ case: engineeringCase }, { status: 201 });
}
