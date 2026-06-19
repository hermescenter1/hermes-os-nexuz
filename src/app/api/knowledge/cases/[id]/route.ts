import { NextRequest, NextResponse }         from "next/server";
import { requirePlatformAuth }               from "@/lib/api/auth";
import { requireOrgActor }                   from "@/lib/org/context";
import { requirePermission }                 from "@/lib/org/rbac";
import { getCase, updateCase, getRelatedCases } from "@/lib/knowledge/cases";

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

  const engineeringCase = await getCase(ctx.orgId, id);
  if (!engineeringCase) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const relatedCases = await getRelatedCases(ctx.orgId, id);
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

  const body = await req.json().catch(() => ({}));
  const engineeringCase = await updateCase(ctx.orgId, id, body, ctx.userId ?? undefined);
  if (!engineeringCase) return NextResponse.json({ error: "Not found or update failed" }, { status: 404 });
  return NextResponse.json({ case: engineeringCase });
}
