import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAuth }      from "@/lib/api/auth";
import { requireOrgActor }          from "@/lib/org/context";
import { requirePermission }        from "@/lib/org/rbac";
import { getOrgAlerts }             from "@/lib/industrial/alerts";
import type { AlertType }           from "@/lib/industrial/alerts";
import { getAllowedSiteIds }        from "@/lib/site/context";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  let userId: string | undefined;
  if (ctx.authMethod === "jwt") {
    const member = await requireOrgActor(req, ctx.orgId);
    if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
    const perm = requirePermission(member.ctx.role, "view_industrial");
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
    userId = member.ctx.userId;
  }

  const sp = req.nextUrl.searchParams;
  const includeDismissed = sp.get("includeDismissed") === "true";
  const alertType = sp.get("alertType") as AlertType | null;
  const siteId = sp.get("siteId") ?? undefined;

  /*
    PHASE 109-C-UI.2-R1 (F-02). This route returned every alert in the
    organisation to any member with `view_industrial`, regardless of which sites
    they hold a UserSite grant for — and `total` counted them all.

    Site scope is resolved exactly as `api/industrial/assets` has since Phase 43:
    for a USER, always an array (empty means no accessible site, and the library
    returns nothing); for an organisation-level API key there is no user and
    therefore no UserSite rows, so the credential keeps its organisation scope —
    the same contract every sibling industrial route already has. That asymmetry
    is deliberate and is recorded in the phase report, not hidden here.
  */
  const allowedSiteIds = userId ? await getAllowedSiteIds(userId, ctx.orgId) : undefined;

  const alerts = await getOrgAlerts(ctx.orgId, {
    includeDismissed,
    alertType: alertType ?? undefined,
    siteId,
    allowedSiteIds,
  });

  // `total` is derived from the SAME site-scoped rows. A count is a disclosure:
  // an organisation-wide number beside a site-scoped list tells the reader
  // exactly how much they are not being shown.
  return NextResponse.json({ alerts, total: alerts.length });
}
