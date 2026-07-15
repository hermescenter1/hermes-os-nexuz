import { NextRequest, NextResponse }    from "next/server";
import { requirePlatformAuth }          from "@/lib/api/auth";
import { requireOrgActor }              from "@/lib/org/context";
import { hasScope } from "@/lib/api/scopes";
import { requirePermission }            from "@/lib/org/rbac";
import { listAssets, createAsset }      from "@/lib/industrial/assets";
import { recordAuditEvent, INDUSTRIAL_AUDIT } from "@/lib/audit/audit-service";
import { getAllowedSiteIds }              from "@/lib/site/context";

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

  const siteId    = req.nextUrl.searchParams.get("siteId")    ?? undefined;
  const gatewayId = req.nextUrl.searchParams.get("gatewayId") ?? undefined;

  // Phase 43: scope assets to user's accessible sites (unless a specific siteId is given)
  const allowedSiteIds = userId ? await getAllowedSiteIds(userId, ctx.orgId) : undefined;
  const assets = await listAssets(ctx.orgId, { siteId, gatewayId, allowedSiteIds });
  return NextResponse.json({ assets });
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;
  // Phase SECURITY-8 amendment: function-level authorization for the API-key
  // path (JWT sessions carry the "admin" scope and pass; an under-scoped org
  // key is now rejected instead of silently allowed).
  if (!hasScope(ctx.scopes, "industrial.write")) {
    return NextResponse.json({ error: "Missing required scope: industrial.write" }, { status: 403 });
  }

  if (ctx.authMethod === "jwt") {
    const member = await requireOrgActor(req, ctx.orgId);
    if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
    const perm = requirePermission(member.ctx.role, "manage_industrial");
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
  }

  const body = await req.json().catch(() => ({}));
  const { siteId, name } = body as Record<string, string>;
  if (!siteId || !name) return NextResponse.json({ error: "siteId and name are required" }, { status: 400 });

  const asset = await createAsset({ ...body, organizationId: ctx.orgId });
  if (!asset) return NextResponse.json({ error: "Failed to create asset" }, { status: 503 });

  recordAuditEvent({
    action:   INDUSTRIAL_AUDIT.ASSET_CREATED,
    entityType: "industrial",
    userId:  ctx.userId ?? undefined,
    entityId: asset.id,
    metadata:  { name, siteId, organizationId: ctx.orgId },
  });
  return NextResponse.json({ asset }, { status: 201 });
}
