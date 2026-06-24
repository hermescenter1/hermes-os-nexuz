import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAuth }      from "@/lib/api/auth";
import { requireOrgActor }          from "@/lib/org/context";
import { requirePermission }        from "@/lib/org/rbac";
import { getOrgAlerts }             from "@/lib/industrial/alerts";
import type { AlertType }           from "@/lib/industrial/alerts";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  if (ctx.authMethod === "jwt") {
    const member = await requireOrgActor(req, ctx.orgId);
    if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
    const perm = requirePermission(member.ctx.role, "view_industrial");
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
  }

  const sp = req.nextUrl.searchParams;
  const includeDismissed = sp.get("includeDismissed") === "true";
  const alertType = sp.get("alertType") as AlertType | null;

  const alerts = await getOrgAlerts(ctx.orgId, {
    includeDismissed,
    alertType: alertType ?? undefined,
  });

  return NextResponse.json({ alerts, total: alerts.length });
}
