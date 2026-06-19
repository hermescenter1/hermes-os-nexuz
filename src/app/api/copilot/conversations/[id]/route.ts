import { NextRequest, NextResponse }  from "next/server";
import { requirePlatformAuth }        from "@/lib/api/auth";
import { requireOrgActor }            from "@/lib/org/context";
import { requirePermission }          from "@/lib/org/rbac";
import { getConversation, sendMessage } from "@/lib/copilot/copilot";
import { recordAuditEvent, COPILOT_AUDIT } from "@/lib/audit/audit-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_copilot");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const result = await getConversation(id, ctx.orgId);
  if (!result) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  return NextResponse.json(result);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_copilot");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const body = await req.json().catch(() => ({}));
  const { content, assetId, siteId, locale } = body as Record<string, unknown>;
  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const result = await sendMessage(
    ctx.orgId, id, content,
    typeof assetId === "string" ? assetId : undefined,
    typeof siteId  === "string" ? siteId  : undefined,
    typeof locale  === "string" ? locale  : "en",
  );
  if (!result) return NextResponse.json({ error: "Conversation not found or unavailable" }, { status: 404 });

  recordAuditEvent({
    action:     COPILOT_AUDIT.COPILOT_QUERY,
    entityType: "copilot",
    userId:     ctx.userId ?? undefined,
    entityId:   id,
    metadata:   { organizationId: ctx.orgId, intent: result.response.intent, confidence: result.response.confidence },
  });
  return NextResponse.json(result);
}
