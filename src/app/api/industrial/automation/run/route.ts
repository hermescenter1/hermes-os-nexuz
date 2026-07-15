import { NextRequest, NextResponse }      from "next/server";
import { requirePlatformAuth }           from "@/lib/api/auth";
import { requireOrgActor }               from "@/lib/org/context";
import { hasScope } from "@/lib/api/scopes";
import { requirePermission }             from "@/lib/org/rbac";
import { runIntelligenceAutomation }     from "@/lib/industrial/automation";

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;
  // Phase SECURITY-8 amendment: API-key function-level authorization.
  if (!hasScope(ctx.scopes, "industrial.write")) {
    return NextResponse.json({ error: "Missing required scope: industrial.write" }, { status: 403 });
  }

  if (ctx.authMethod === "jwt") {
    const member = await requireOrgActor(req, ctx.orgId);
    if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
    const perm = requirePermission(member.ctx.role, "manage_industrial");
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
  }

  const result = await runIntelligenceAutomation(ctx.orgId);
  return NextResponse.json({ result });
}
