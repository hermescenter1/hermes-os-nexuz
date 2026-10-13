import { NextRequest, NextResponse }         from "next/server";
import { requirePlatformAuth }               from "@/lib/api/auth";
import { requireOrgActor }                   from "@/lib/org/context";
import { requirePermission }                 from "@/lib/org/rbac";
import { getCase, updateCase, getRelatedCases } from "@/lib/knowledge/cases";
import { CaseScopeError, caseScopeHttp }         from "@/lib/knowledge/case-visibility";
import { resolveGraphViewerScope }               from "@/lib/knowledge-graph/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_knowledge");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  // RV-01: a hidden, foreign, inactive-site and nonexistent id all answer with the same 404.
  const scope = await resolveGraphViewerScope(member.ctx.userId, ctx.orgId, member.ctx.role);
  const engineeringCase = await getCase(scope, id);
  if (!engineeringCase) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const relatedCases = await getRelatedCases(scope, id);
  return NextResponse.json({ case: engineeringCase, relatedCases });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "manage_knowledge");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  // The patch must be a JSON object. `null`, an array, a scalar or unparsable JSON is a controlled 400
  // (it used to reach the service as `null` and fail with a 500). Shape only — no case is looked up yet.
  const body: unknown = await req.json().catch(() => undefined);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }
  const scope = await resolveGraphViewerScope(member.ctx.userId, ctx.orgId, member.ctx.role);
  let engineeringCase;
  try {
    engineeringCase = await updateCase(scope, id, body as Parameters<typeof updateCase>[2], ctx.userId ?? undefined);
  } catch (err) {
    if (err instanceof CaseScopeError) {
      const { status, error } = caseScopeHttp(err.code);
      return NextResponse.json({ error }, { status });
    }
    throw err;
  }
  if (!engineeringCase) return NextResponse.json({ error: "Not found or update failed" }, { status: 404 });
  return NextResponse.json({ case: engineeringCase });
}
