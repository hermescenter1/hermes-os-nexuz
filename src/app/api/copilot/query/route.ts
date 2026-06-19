import { NextRequest, NextResponse }       from "next/server";
import { requirePlatformAuth }            from "@/lib/api/auth";
import { requireOrgActor }               from "@/lib/org/context";
import { requirePermission }             from "@/lib/org/rbac";
import { generateResponse }              from "@/lib/copilot/copilot";
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

  const response = await generateResponse(
    ctx.orgId,
    query as string,
    typeof assetId === "string" ? assetId : undefined,
    typeof siteId  === "string" ? siteId  : undefined,
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
