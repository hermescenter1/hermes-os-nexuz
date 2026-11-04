import { NextRequest, NextResponse }  from "next/server";
import { requirePlatformAuth }          from "@/lib/api/auth";
import { requireOrgActor }              from "@/lib/org/context";
import { requirePermission }            from "@/lib/org/rbac";
import { getRelationWithSites, updateRelation } from "@/lib/digital-twin/relations";
import { authorizeTwinSites, requireSessionAuth, twinAuthRefusal, type TwinCtx } from "@/lib/digital-twin/guard";
import { parseJsonBody }              from "@/lib/digital-twin/request";
import { TWIN_LIMITS, idSchema, patchRelationBody } from "@/lib/digital-twin/schemas";
import { twinErrorResponse, twinJsonError, twinNotFound } from "@/lib/digital-twin/errors";

type Params = { params: Promise<{ id: string }> };

const notFound = () => {
  const e = twinNotFound.relation();
  return twinJsonError(e.status, e.code, e.message);
};

export async function GET(req: NextRequest, { params }: Params) {
  const { id: rawId } = await params;
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return twinAuthRefusal(auth);
  const sessionRefusal = requireSessionAuth(auth.ctx);
  if (sessionRefusal) return sessionRefusal;

  const member = await requireOrgActor(req, auth.ctx.orgId);
  if ("error" in member) return twinAuthRefusal(member);
  const perm = requirePermission(member.ctx.role, "view_digital_twin");
  if (!perm.ok) return twinAuthRefusal(perm);
  const ctx: TwinCtx = { orgId: auth.ctx.orgId, userId: member.ctx.userId };

  const idParsed = idSchema.safeParse(rawId);
  if (!idParsed.success) return notFound();

  try {
    const found = await getRelationWithSites(idParsed.data, ctx.orgId);
    if (!found) return notFound();

    // The relation is visible only if the caller can reach BOTH endpoint sites.
    const sites = await authorizeTwinSites(req, ctx, found.siteIds, "view", twinNotFound.relation);
    if (!sites.ok) return sites.response;
    return NextResponse.json({ relation: found.relation });
  } catch (err) {
    return twinErrorResponse(err, "relations.get");
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: rawId } = await params;
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return twinAuthRefusal(auth);
  const sessionRefusal = requireSessionAuth(auth.ctx);
  if (sessionRefusal) return sessionRefusal;

  const member = await requireOrgActor(req, auth.ctx.orgId);
  if ("error" in member) return twinAuthRefusal(member);
  const perm = requirePermission(member.ctx.role, "manage_digital_twin");
  if (!perm.ok) return twinAuthRefusal(perm);
  const ctx: TwinCtx = { orgId: auth.ctx.orgId, userId: member.ctx.userId };

  const idParsed = idSchema.safeParse(rawId);
  if (!idParsed.success) return notFound();

  const body = await parseJsonBody(req, patchRelationBody, TWIN_LIMITS.BODY_BYTES);
  if (!body.ok) return body.response;

  try {
    const found = await getRelationWithSites(idParsed.data, ctx.orgId);
    if (!found) return notFound();

    const sites = await authorizeTwinSites(req, ctx, found.siteIds, "manage", twinNotFound.relation);
    if (!sites.ok) return sites.response;

    const relation = await updateRelation(idParsed.data, ctx.orgId, { metadata: body.data.metadata }, ctx.userId);
    if (!relation) {
      const e = twinNotFound.unavailable();
      return twinJsonError(e.status, e.code, e.message);
    }
    return NextResponse.json({ relation });
  } catch (err) {
    return twinErrorResponse(err, "relations.update");
  }
}
