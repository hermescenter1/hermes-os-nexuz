import { NextRequest, NextResponse }   from "next/server";
import { requirePlatformAuth }          from "@/lib/api/auth";
import { requireOrgActor }              from "@/lib/org/context";
import { requirePermission }            from "@/lib/org/rbac";
import { resolveSiteScope }           from "@/lib/digital-twin/scope";
import { listNodesPage, createNode }   from "@/lib/digital-twin/nodes";
import { meterIndustrialEvent }        from "@/lib/api/meter";
import { authorizeTwinSite, requireSessionAuth, twinAuthRefusal, type TwinCtx } from "@/lib/digital-twin/guard";
import { parseJsonBody }               from "@/lib/digital-twin/request";
import { TWIN_LIMITS, createNodeBody, siteIdQuery } from "@/lib/digital-twin/schemas";
import { twinErrorResponse, twinJsonError, twinNotFound } from "@/lib/digital-twin/errors";
import type { DigitalTwinNodeType }    from "@/lib/digital-twin/types";

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
    // Site scope is part of the query: the caller's reachable sites, narrowed (never
    // replaced) by an explicit ?siteId.
    const allowedSiteIds = await resolveSiteScope(ctx.userId, ctx.orgId);
    const { nodes, truncated } = await listNodesPage(ctx.orgId, { siteId, allowedSiteIds });

    meterIndustrialEvent(ctx.orgId, "digital_twin_queries");
    return NextResponse.json({ nodes, truncated });
  } catch (err) {
    return twinErrorResponse(err, "nodes.list");
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

  const body = await parseJsonBody(req, createNodeBody, TWIN_LIMITS.BODY_BYTES);
  if (!body.ok) return body.response;
  const input = body.data;

  const site = await authorizeTwinSite(req, ctx, input.siteId, "manage", twinNotFound.site);
  if (!site.ok) return site.response;

  try {
    const node = await createNode({
      organizationId: ctx.orgId,
      siteId:         input.siteId,
      displayName:    input.displayName,
      nodeType:       input.nodeType as DigitalTwinNodeType,
      assetId:        input.assetId,
      parentNodeId:   input.parentNodeId,
      metadata:       input.metadata,
      actorUserId:    ctx.userId,
    });
    if (!node) {
      const e = twinNotFound.unavailable();
      return twinJsonError(e.status, e.code, e.message);
    }

    meterIndustrialEvent(ctx.orgId, "digital_twin_nodes");
    return NextResponse.json({ node }, { status: 201 });
  } catch (err) {
    return twinErrorResponse(err, "nodes.create");
  }
}
