import { NextRequest, NextResponse }       from "next/server";
import { requirePlatformAuth }            from "@/lib/api/auth";
import { requireOrgActor }               from "@/lib/org/context";
import { requirePermission }             from "@/lib/org/rbac";
import { generateResponse }              from "@/lib/copilot/copilot";
import { authorizeCopilotSelectors, COPILOT_SCOPE_NOT_FOUND } from "@/lib/copilot/scope";
import { recordAuditEvent, COPILOT_AUDIT } from "@/lib/audit/audit-service";
import { meterIndustrialEvent }          from "@/lib/api/meter";

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_copilot");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const body = await req.json().catch(() => ({}));
  const { query, assetId, siteId, locale } = body as Record<string, unknown>;

  if (!query || typeof query !== "string" || !query.trim()) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  // Slice C (IR-03): the selectors are authorised against the actor's readable ACTIVE sites BEFORE the engine
  // reads anything; a hidden, inactive, foreign or missing site/asset is one 404. Without a selector the
  // engine works across the actor's sites only.
  const authorized = await authorizeCopilotSelectors(member.ctx.userId, ctx.orgId, { siteId, assetId });
  if (!authorized.ok) return NextResponse.json(COPILOT_SCOPE_NOT_FOUND.body, { status: COPILOT_SCOPE_NOT_FOUND.status });

  const response = await generateResponse(
    authorized.scope,
    query as string,
    typeof locale  === "string" ? locale  : "en",
  );

  meterIndustrialEvent(ctx.orgId, "copilot_queries");
  recordAuditEvent({
    action:     COPILOT_AUDIT.COPILOT_QUERY,
    entityType: "copilot",
    userId:     ctx.userId ?? undefined,
    metadata:   { organizationId: ctx.orgId, intent: response.intent, confidence: response.confidence, blocked: !!response.blockedReason },
  });

  return NextResponse.json({ response });
}
