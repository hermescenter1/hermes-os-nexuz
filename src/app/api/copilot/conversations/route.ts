import { NextRequest, NextResponse }       from "next/server";
import { requirePlatformAuth }            from "@/lib/api/auth";
import { requireOrgActor }               from "@/lib/org/context";
import { requirePermission }             from "@/lib/org/rbac";
import { createConversation, listConversations } from "@/lib/copilot/copilot";
import { recordAuditEvent, COPILOT_AUDIT } from "@/lib/audit/audit-service";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_copilot");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const limit       = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 20), 50);
  const conversations = await listConversations(ctx.orgId, limit);
  return NextResponse.json({ conversations });
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_copilot");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const body  = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "New conversation";

  const conversation = await createConversation(ctx.orgId, ctx.userId ?? null, title);
  if (!conversation) return NextResponse.json({ error: "Failed to create conversation" }, { status: 503 });

  recordAuditEvent({
    action:     COPILOT_AUDIT.COPILOT_CONVERSATION_CREATED,
    entityType: "copilot",
    userId:     ctx.userId ?? undefined,
    entityId:   conversation.id,
    metadata:   { organizationId: ctx.orgId, title },
  });
  return NextResponse.json({ conversation }, { status: 201 });
}
