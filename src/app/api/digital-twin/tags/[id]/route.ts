import { NextRequest, NextResponse }  from "next/server";
import { requirePlatformAuth }          from "@/lib/api/auth";
import { requireOrgActor }              from "@/lib/org/context";
import { requirePermission }            from "@/lib/org/rbac";
import { getAsset }                   from "@/lib/industrial/assets";
import { getTag, updateTag }          from "@/lib/digital-twin/tags";
import { authorizeTwinSite, requireSessionAuth, twinAuthRefusal, type TwinCtx, type TwinSiteAccess } from "@/lib/digital-twin/guard";
import { parseJsonBody }              from "@/lib/digital-twin/request";
import { TWIN_LIMITS, idSchema, patchTagBody } from "@/lib/digital-twin/schemas";
import { twinErrorResponse, twinJsonError, twinNotFound } from "@/lib/digital-twin/errors";
import type { AssetTagRecord }        from "@/lib/digital-twin/types";

type Params = { params: Promise<{ id: string }> };

const notFound = () => {
  const e = twinNotFound.tag();
  return twinJsonError(e.status, e.code, e.message);
};

/** The tag, if it exists in this organisation AND its asset's site is reachable. */
async function loadAuthorizedTag(
  req: NextRequest,
  ctx: TwinCtx,
  rawId: string,
  access: TwinSiteAccess,
): Promise<{ ok: true; tag: AssetTagRecord } | { ok: false; response: NextResponse }> {
  const idParsed = idSchema.safeParse(rawId);
  if (!idParsed.success) return { ok: false, response: notFound() };

  const tag = await getTag(idParsed.data, ctx.orgId);
  if (!tag) return { ok: false, response: notFound() };

  const asset = await getAsset(tag.assetId, ctx.orgId);
  if (!asset) return { ok: false, response: notFound() };

  const site = await authorizeTwinSite(req, ctx, asset.siteId, access, twinNotFound.tag);
  if (!site.ok) return { ok: false, response: site.response };
  return { ok: true, tag };
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return twinAuthRefusal(auth);
  const sessionRefusal = requireSessionAuth(auth.ctx);
  if (sessionRefusal) return sessionRefusal;

  const member = await requireOrgActor(req, auth.ctx.orgId);
  if ("error" in member) return twinAuthRefusal(member);
  const perm = requirePermission(member.ctx.role, "view_digital_twin");
  if (!perm.ok) return twinAuthRefusal(perm);
  const ctx: TwinCtx = { orgId: auth.ctx.orgId, userId: member.ctx.userId };

  try {
    const r = await loadAuthorizedTag(req, ctx, id, "view");
    if (!r.ok) return r.response;
    return NextResponse.json({ tag: r.tag });
  } catch (err) {
    return twinErrorResponse(err, "tags.get");
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return twinAuthRefusal(auth);
  const sessionRefusal = requireSessionAuth(auth.ctx);
  if (sessionRefusal) return sessionRefusal;

  const member = await requireOrgActor(req, auth.ctx.orgId);
  if ("error" in member) return twinAuthRefusal(member);
  const perm = requirePermission(member.ctx.role, "manage_digital_twin");
  if (!perm.ok) return twinAuthRefusal(perm);
  const ctx: TwinCtx = { orgId: auth.ctx.orgId, userId: member.ctx.userId };

  // Phase SECURITY-8 amendment (kept): explicit field allow-list — `assetId`,
  // `tagPath` and `organizationId` are not patchable and are dropped by the schema.
  const body = await parseJsonBody(req, patchTagBody, TWIN_LIMITS.BODY_BYTES);
  if (!body.ok) return body.response;
  const input = body.data;
  const patch = {
    tagName:     input.tagName,
    unit:        input.unit,
    dataType:    input.dataType,
    description: input.description,
    metadata:    input.metadata,
  };

  try {
    const r = await loadAuthorizedTag(req, ctx, id, "manage");
    if (!r.ok) return r.response;

    const tag = await updateTag(r.tag.id, ctx.orgId, patch, ctx.userId);
    if (!tag) {
      const e = twinNotFound.unavailable();
      return twinJsonError(e.status, e.code, e.message);
    }
    return NextResponse.json({ tag });
  } catch (err) {
    return twinErrorResponse(err, "tags.update");
  }
}
