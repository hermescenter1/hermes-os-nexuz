import { NextRequest, NextResponse }  from "next/server";
import { requirePlatformAuth }        from "@/lib/api/auth";
import { requireOrgActor }            from "@/lib/org/context";
import { requirePermission }          from "@/lib/org/rbac";
import { requireSiteActor }           from "@/lib/site/context";
import { requireSitePermission }      from "@/lib/site/rbac";
import { getAsset }                   from "@/lib/industrial/assets";
import { getAssetIntelligence }       from "@/lib/industrial/intelligence";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  if (ctx.authMethod === "jwt") {
    const member = await requireOrgActor(req, ctx.orgId);
    if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
    const perm = requirePermission(member.ctx.role, "view_industrial");
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
  }

  const asset = await getAsset(id, ctx.orgId);
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  if (ctx.authMethod === "jwt") {
    const siteAuth = await requireSiteActor(req, ctx.orgId, asset.siteId);
    if ("error" in siteAuth) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    const sitePerm = requireSitePermission(siteAuth.ctx.role, "view_assets");
    if (!sitePerm.ok) return NextResponse.json({ error: sitePerm.error }, { status: sitePerm.status });
  }

  const intelligence = await getAssetIntelligence(id, ctx.orgId);
  if (!intelligence) {
    return NextResponse.json({ intelligence: null, note: "Database unavailable or no intelligence data yet" });
  }

  return NextResponse.json({ intelligence });
}
