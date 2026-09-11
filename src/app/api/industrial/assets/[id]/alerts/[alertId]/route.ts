import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAuth }      from "@/lib/api/auth";
import { requireOrgActor }          from "@/lib/org/context";
import { hasScope } from "@/lib/api/scopes";
import { requirePermission }        from "@/lib/org/rbac";
import { dismissAlert }             from "@/lib/industrial/alerts";
import { getAllowedSiteIds }        from "@/lib/site/context";

type Params = { params: Promise<{ id: string; alertId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { alertId } = await params;
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;
  // Phase SECURITY-8 amendment: API-key function-level authorization.
  if (!hasScope(ctx.scopes, "industrial.write")) {
    return NextResponse.json({ error: "Missing required scope: industrial.write" }, { status: 403 });
  }

  let userId: string | undefined;
  if (ctx.authMethod === "jwt") {
    const member = await requireOrgActor(req, ctx.orgId);
    if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
    const perm = requirePermission(member.ctx.role, "manage_industrial");
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
    userId = member.ctx.userId;
  }

  /*
    PHASE 109-C-UI.2-R1 (F-02) — the write path. A member holding a grant for
    site A could dismiss an alert raised on equipment in site B: silencing an
    alarm on a plant they have no access to. `dismissAlert` returns null for an
    out-of-scope alert, which is the same answer as "no such alert", so the 404
    below discloses nothing either way.
  */
  const allowedSiteIds = userId ? await getAllowedSiteIds(userId, ctx.orgId) : undefined;

  const alert = await dismissAlert(alertId, ctx.orgId, userId, { allowedSiteIds });
  if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  return NextResponse.json({ alert });
}
