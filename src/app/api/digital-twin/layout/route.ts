import { NextRequest, NextResponse }  from "next/server";
import { requirePlatformAuth }          from "@/lib/api/auth";
import { requireOrgActor }              from "@/lib/org/context";
import { requirePermission }            from "@/lib/org/rbac";
import { getAllowedSiteIds }          from "@/lib/site/context";
import { listLayoutsPage, createLayout }  from "@/lib/digital-twin/layout";
import { authorizeTwinSite, requireSessionAuth, twinAuthRefusal, type TwinCtx } from "@/lib/digital-twin/guard";
import { parseJsonBody }              from "@/lib/digital-twin/request";
import { TWIN_LIMITS, createLayoutBody, siteIdQuery } from "@/lib/digital-twin/schemas";
import { twinErrorResponse, twinJsonError, twinNotFound } from "@/lib/digital-twin/errors";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return twinAuthRefusal(auth);
  const sessionRefusal = requireSessionAuth(auth.ctx);
  if (sessionRefusal) return sessionRefusal;

  const member = await requireOrgActor(req, auth.ctx.orgId);
  if ("error" in member) return twinAuthRefusal(member);
  const perm = requirePermission(member.ctx.role, "view_digital_twin");
  if (!perm.ok) return twinAuthRefusal(perm);
  const ctx: TwinCtx = { orgId: auth.ctx.orgId, userId: member.ctx.userId };

  let siteId: string | undefined;
  const rawSite = req.nextUrl.searchParams.get("siteId");
  if (rawSite !== null) {
    const parsed = siteIdQuery.safeParse(rawSite);
    if (!parsed.success) return twinJsonError(400, "VALIDATION_FAILED", "siteId is invalid");
    siteId = parsed.data;
  }

  try {
    const allowedSiteIds = await getAllowedSiteIds(ctx.userId, ctx.orgId);
    const { layouts, truncated } = await listLayoutsPage(ctx.orgId, siteId, allowedSiteIds);
    return NextResponse.json({ layouts, truncated });
  } catch (err) {
    return twinErrorResponse(err, "layout.list");
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return twinAuthRefusal(auth);
  const sessionRefusal = requireSessionAuth(auth.ctx);
  if (sessionRefusal) return sessionRefusal;

  const member = await requireOrgActor(req, auth.ctx.orgId);
  if ("error" in member) return twinAuthRefusal(member);
  const perm = requirePermission(member.ctx.role, "manage_digital_twin");
  if (!perm.ok) return twinAuthRefusal(perm);
  const ctx: TwinCtx = { orgId: auth.ctx.orgId, userId: member.ctx.userId };

  const body = await parseJsonBody(req, createLayoutBody, TWIN_LIMITS.LAYOUT_BODY_BYTES);
  if (!body.ok) return body.response;
  const input = body.data;

  const site = await authorizeTwinSite(req, ctx, input.siteId, "manage", twinNotFound.site);
  if (!site.ok) return site.response;

  try {
    const layout = await createLayout({
      organizationId: ctx.orgId,
      siteId:         input.siteId,
      name:           input.name,
      layoutData:     input.layoutData,
      actorUserId:    ctx.userId,
    });
    if (!layout) {
      const e = twinNotFound.unavailable();
      return twinJsonError(e.status, e.code, e.message);
    }
    return NextResponse.json({ layout }, { status: 201 });
  } catch (err) {
    return twinErrorResponse(err, "layout.create");
  }
}
