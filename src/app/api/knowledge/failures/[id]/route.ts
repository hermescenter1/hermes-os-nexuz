import { NextRequest, NextResponse }            from "next/server";
import { requirePlatformAuth }                   from "@/lib/api/auth";
import { requireOrgActor }                       from "@/lib/org/context";
import { requirePermission }                     from "@/lib/org/rbac";
import { getFailureMode, updateFailureMode }     from "@/lib/knowledge/failures";
import { getRootCauseCandidates, resolveAuthorizedAsset } from "@/lib/knowledge/rootcauses";
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

  const { searchParams } = new URL(req.url);
  const assetId = searchParams.get("assetId");

  const failureMode = await getFailureMode(ctx.orgId, id);
  if (!failureMode) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (assetId === null) return NextResponse.json({ failureMode, rootCauseCandidates: [] });

  // Slice C (IR-04): the asset is authorised BEFORE any of its indicators is read — it must be this
  // organisation's and stand on one of the caller's readable ACTIVE sites. A hidden, inactive, foreign,
  // missing or malformed asset id gets the SAME 404 as a missing failure mode.
  const scope = await resolveGraphViewerScope(member.ctx.userId, ctx.orgId, member.ctx.role);
  const asset = await resolveAuthorizedAsset(ctx.orgId, assetId, scope.allowedSiteIds);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const candidates = await getRootCauseCandidates(ctx.orgId, asset, { failureModeId: failureMode.id });
  return NextResponse.json({ failureMode, rootCauseCandidates: candidates });
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

  const body = await req.json().catch(() => ({}));
  const failureMode = await updateFailureMode(ctx.orgId, id, body);
  if (!failureMode) return NextResponse.json({ error: "Not found or update failed" }, { status: 404 });
  return NextResponse.json({ failureMode });
}
