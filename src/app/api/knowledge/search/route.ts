import { NextRequest, NextResponse }        from "next/server";
import { requirePlatformAuth }              from "@/lib/api/auth";
import { requireOrgActor }                  from "@/lib/org/context";
import { requirePermission }               from "@/lib/org/rbac";
import { searchKnowledge }                 from "@/lib/knowledge/search";
import { recordAuditEvent, KNOWLEDGE_AUDIT } from "@/lib/audit/audit-service";
import { meterIndustrialEvent }            from "@/lib/api/meter";
import type { KnowledgeItemType }          from "@/lib/knowledge/types";

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
  const q     = searchParams.get("q");
  if (!q?.trim()) return NextResponse.json({ error: "q (query) is required" }, { status: 400 });

  const typesRaw = searchParams.getAll("type") as KnowledgeItemType[];
  const valid: KnowledgeItemType[] = ["article", "failureMode", "procedure", "case"];
  const types = typesRaw.length > 0
    ? typesRaw.filter((t) => valid.includes(t))
    : undefined;
  const limit = Math.min(50, parseInt(searchParams.get("limit") ?? "20", 10));

  meterIndustrialEvent(ctx.orgId, "knowledge_queries");

  const results = await searchKnowledge(ctx.orgId, q, types, limit);

  recordAuditEvent({
    action:     KNOWLEDGE_AUDIT.KNOWLEDGE_QUERY,
    entityType: "knowledge",
    userId:     ctx.userId ?? undefined,
    metadata:   { organizationId: ctx.orgId, query: q, resultCount: results.length, types: types ?? "all" },
  });

  return NextResponse.json({ query: q, results, total: results.length });
}
