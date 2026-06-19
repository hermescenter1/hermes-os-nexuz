import { NextRequest, NextResponse }       from "next/server";
import { requirePlatformAuth }             from "@/lib/api/auth";
import { requireOrgActor }                 from "@/lib/org/context";
import { requirePermission }               from "@/lib/org/rbac";
import { getArticle, updateArticle }       from "@/lib/knowledge/articles";
import { recordAuditEvent, KNOWLEDGE_AUDIT } from "@/lib/audit/audit-service";

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

  const article = await getArticle(ctx.orgId, id);
  if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ article });
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

  const current = await getArticle(ctx.orgId, id);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const article = await updateArticle(ctx.orgId, id, body, current.version);
  if (!article) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  recordAuditEvent({
    action: KNOWLEDGE_AUDIT.ARTICLE_UPDATED, entityType: "article", entityId: article.id,
    userId: ctx.userId ?? undefined,
    metadata: { organizationId: ctx.orgId, previousVersion: current.version, nextVersion: article.version },
  });
  return NextResponse.json({ article });
}
