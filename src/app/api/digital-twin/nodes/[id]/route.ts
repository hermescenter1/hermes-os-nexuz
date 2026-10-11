import { NextRequest, NextResponse }  from "next/server";
import { requirePlatformAuth }          from "@/lib/api/auth";
import { requireOrgActor }              from "@/lib/org/context";
import { requirePermission }            from "@/lib/org/rbac";
import { getAllowedSiteIds }          from "@/lib/site/context";
import { getNode, updateNode }        from "@/lib/digital-twin/nodes";
import { getNodeRelations }           from "@/lib/digital-twin/graph";
import { meterIndustrialEvent }       from "@/lib/api/meter";
import { authorizeTwinSite, requireSessionAuth, twinAuthRefusal, type TwinCtx } from "@/lib/digital-twin/guard";
import { parseJsonBody }              from "@/lib/digital-twin/request";
import { TWIN_LIMITS, idSchema, patchNodeBody } from "@/lib/digital-twin/schemas";
import { twinErrorResponse, twinJsonError, twinNotFound } from "@/lib/digital-twin/errors";
import type { DigitalTwinNodeType }   from "@/lib/digital-twin/types";

type Params = { params: Promise<{ id: string }> };

const notFound = () => {
  const e = twinNotFound.node();
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

  // A malformed id is answered exactly like an absent one.
  const idParsed = idSchema.safeParse(rawId);
  if (!idParsed.success) return notFound();
  const id = idParsed.data;

  try {
    const node = await getNode(id, ctx.orgId);
    if (!node) return notFound();

    // An unreachable site is NOT FOUND, the same answer as a missing node.
    const site = await authorizeTwinSite(req, ctx, node.siteId, "view", twinNotFound.node);
    if (!site.ok) return site.response;

    const allowedSiteIds = await getAllowedSiteIds(ctx.userId, ctx.orgId);
    const relations = await getNodeRelations(id, ctx.orgId, { allowedSiteIds });
    meterIndustrialEvent(ctx.orgId, "digital_twin_queries");
    return NextResponse.json({ node, relations });
  } catch (err) {
    return twinErrorResponse(err, "nodes.get");
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
  const id = idParsed.data;

  // Phase SECURITY-8 amendment (kept): explicit field allow-list. The parsed body
  // below contains ONLY the schema's fields, so an injected organizationId / id /
  // siteId is dropped before it can reach Prisma `data`.
  const body = await parseJsonBody(req, patchNodeBody, TWIN_LIMITS.BODY_BYTES);
  if (!body.ok) return body.response;
  const input = body.data;
  const patch = {
    displayName:  input.displayName,
    nodeType:     input.nodeType as DigitalTwinNodeType | undefined,
    assetId:      input.assetId,
    parentNodeId: input.parentNodeId,
    metadata:     input.metadata,
  };

  try {
    const current = await getNode(id, ctx.orgId);
    if (!current) return notFound();

    const site = await authorizeTwinSite(req, ctx, current.siteId, "manage", twinNotFound.node);
    if (!site.ok) return site.response;

    const node = await updateNode(id, ctx.orgId, patch, ctx.userId);
    if (!node) {
      const e = twinNotFound.unavailable();
      return twinJsonError(e.status, e.code, e.message);
    }
    return NextResponse.json({ node });
  } catch (err) {
    return twinErrorResponse(err, "nodes.update");
  }
}
