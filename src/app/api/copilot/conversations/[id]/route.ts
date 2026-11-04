import { NextRequest, NextResponse }  from "next/server";
import { requirePlatformAuth }        from "@/lib/api/auth";
import { requireOrgActor }            from "@/lib/org/context";
import { requirePermission }          from "@/lib/org/rbac";
import { getConversation, sendMessage } from "@/lib/copilot/copilot";
import { authorizeCopilotSelectors, resolveCopilotSiteIds, COPILOT_SCOPE_NOT_FOUND } from "@/lib/copilot/scope";
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

  // Slice C (IR-03): the actor's own conversation only; every stored answer is re-authorised against the
  // actor's CURRENT readable sites (an answer built from a site that is no longer readable is withheld).
  const siteIds = await resolveCopilotSiteIds(member.ctx.userId, ctx.orgId);
  const result = await getConversation(id, { organizationId: ctx.orgId, userId: member.ctx.userId, siteIds });
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

  // Slice C (IR-03): the selectors are re-authorised on EVERY continuation, against the actor's current
  // readable ACTIVE sites, before anything is read or written.
  const authorized = await authorizeCopilotSelectors(member.ctx.userId, ctx.orgId, { siteId, assetId });
  if (!authorized.ok) return NextResponse.json(COPILOT_SCOPE_NOT_FOUND.body, { status: COPILOT_SCOPE_NOT_FOUND.status });

  const result = await sendMessage(
    authorized.scope, id, content,
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
