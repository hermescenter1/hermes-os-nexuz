import { NextRequest, NextResponse }  from "next/server";
import { requirePlatformAuth }          from "@/lib/api/auth";
import { requireOrgActor }              from "@/lib/org/context";
import { requirePermission }            from "@/lib/org/rbac";
import { resolveSiteScope }          from "@/lib/digital-twin/scope";
import { getAsset }                   from "@/lib/industrial/assets";
import { listTagsPage, createTag } from "@/lib/digital-twin/tags";
import { authorizeTwinSite, requireSessionAuth, twinAuthRefusal, type TwinCtx } from "@/lib/digital-twin/guard";
import { parseJsonBody }              from "@/lib/digital-twin/request";
import { TWIN_LIMITS, createTagBody, idSchema } from "@/lib/digital-twin/schemas";
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

  const rawAsset = req.nextUrl.searchParams.get("assetId");
  if (!rawAsset) return twinJsonError(400, "VALIDATION_FAILED", "assetId is required");
  const parsed = idSchema.safeParse(rawAsset);
  if (!parsed.success) return twinJsonError(400, "VALIDATION_FAILED", "assetId is invalid");

  try {
    // The asset's site must be one the caller may reach; otherwise the answer is the
    // empty list an unknown asset also gives.
    const allowedSiteIds = await resolveSiteScope(ctx.userId, ctx.orgId);
    const { tags, truncated } = await listTagsPage(parsed.data, ctx.orgId, { allowedSiteIds });
    return NextResponse.json({ tags, truncated });
  } catch (err) {
    return twinErrorResponse(err, "tags.list");
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

  const body = await parseJsonBody(req, createTagBody, TWIN_LIMITS.BODY_BYTES);
  if (!body.ok) return body.response;
  const input = body.data;

  try {
    const asset = await getAsset(input.assetId, ctx.orgId);
    if (!asset) {
      const e = twinNotFound.asset();
      return twinJsonError(e.status, e.code, e.message);
    }
    const site = await authorizeTwinSite(req, ctx, asset.siteId, "manage", twinNotFound.asset);
    if (!site.ok) return site.response;

    const tag = await createTag({
      organizationId: ctx.orgId,
      assetId:        input.assetId,
      siteId:         asset.siteId,
      tagName:        input.tagName,
      tagPath:        input.tagPath,
      unit:           input.unit,
      dataType:       input.dataType,
      description:    input.description,
      metadata:       input.metadata,
      actorUserId:    ctx.userId,
    });
    if (!tag) {
      const e = twinNotFound.unavailable();
      return twinJsonError(e.status, e.code, e.message);
    }
    return NextResponse.json({ tag }, { status: 201 });
  } catch (err) {
    return twinErrorResponse(err, "tags.create");
  }
}
