import { NextRequest, NextResponse }             from "next/server";
import { requirePlatformAuth }                    from "@/lib/api/auth";
import { requireOrgActor }                        from "@/lib/org/context";
import { requirePermission }                      from "@/lib/org/rbac";
import { listArticles, createArticle }            from "@/lib/knowledge/articles";
import { recordAuditEvent, KNOWLEDGE_AUDIT }      from "@/lib/audit/audit-service";
import { meterIndustrialEvent }                   from "@/lib/api/meter";
import { searchKnowledge }                        from "@/lib/knowledge/search";

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
  const q      = searchParams.get("q");
  const status = searchParams.get("status") ?? undefined;
  const limit  = Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10));

  meterIndustrialEvent(ctx.orgId, "knowledge_queries");

  if (q) {
    const results = await searchKnowledge(ctx.orgId, q, ["article"], limit);
    recordAuditEvent({ action: KNOWLEDGE_AUDIT.KNOWLEDGE_QUERY, entityType: "knowledge", userId: ctx.userId ?? undefined, metadata: { organizationId: ctx.orgId, query: q, type: "article" } });
    return NextResponse.json({ results });
  }

  const articles = await listArticles(ctx.orgId, status, limit);
  return NextResponse.json({ articles });
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
  if (!body?.title || !body?.summary || !body?.content) {
    return NextResponse.json({ error: "title, summary, and content are required" }, { status: 400 });
  }

  meterIndustrialEvent(ctx.orgId, "knowledge_articles");
  const article = await createArticle(ctx.orgId, { ...body, authorId: ctx.userId ?? undefined });
  if (!article) return NextResponse.json({ error: "Failed to create article" }, { status: 500 });

  recordAuditEvent({
    action: KNOWLEDGE_AUDIT.ARTICLE_CREATED, entityType: "article", entityId: article.id,
    userId: ctx.userId ?? undefined,
    metadata: { organizationId: ctx.orgId, title: article.title, version: article.version },
  });
  return NextResponse.json({ article }, { status: 201 });
}
