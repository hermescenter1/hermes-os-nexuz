import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAuth }      from "@/lib/api/auth";
import { requireOrgActor }          from "@/lib/org/context";
import { requirePermission }        from "@/lib/org/rbac";
import { getAsset }                 from "@/lib/industrial/assets";
import { getAssetAlerts }           from "@/lib/industrial/alerts";
import { getAllowedSiteIds }        from "@/lib/site/context";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
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

  const allowedSiteIds = userId ? await getAllowedSiteIds(userId, ctx.orgId) : undefined;

  /*
    PHASE 109-C-UI.2-R1 (F-02). `getAsset` proves the asset belongs to the
    ORGANISATION and nothing else, so an asset in a site the caller holds no
    grant for passed this check and its alerts were returned.

    The site test happens before the 404 so that an out-of-scope asset is
    indistinguishable from one that does not exist. Answering 403 here would
    confirm the asset id is real, which is site enumeration by another name.
  */
  const asset = await getAsset(id, ctx.orgId);
  const inScope =
    asset !== null && (allowedSiteIds === undefined || allowedSiteIds.includes(asset.siteId));
  if (!inScope) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  const includeDismissed = req.nextUrl.searchParams.get("includeDismissed") === "true";
  const alerts = await getAssetAlerts(id, ctx.orgId, { includeDismissed, allowedSiteIds });
  return NextResponse.json({ alerts, total: alerts.length });
}
