import { NextRequest, NextResponse }  from "next/server";
import { requirePlatformAuth }          from "@/lib/api/auth";
import { requireOrgActor }              from "@/lib/org/context";
import { requirePermission }            from "@/lib/org/rbac";
import { resolveSiteScope }          from "@/lib/digital-twin/scope";
import { listRelationsPage, createRelation } from "@/lib/digital-twin/relations";
import { getNode }                    from "@/lib/digital-twin/nodes";
import { meterIndustrialEvent }       from "@/lib/api/meter";
import { authorizeTwinSite, requireSessionAuth, twinAuthRefusal, type TwinCtx } from "@/lib/digital-twin/guard";
import { parseJsonBody }              from "@/lib/digital-twin/request";
import { TWIN_LIMITS, createRelationBody, idSchema } from "@/lib/digital-twin/schemas";
import { twinErrorResponse, twinJsonError, twinNotFound, type TwinDomainError } from "@/lib/digital-twin/errors";
import type { DigitalTwinRelationType } from "@/lib/digital-twin/types";

/**
 * One endpoint of a new relation: it must exist in this organisation AND sit at a
 * site the caller may manage. Every way of failing the first two is `notFound()`.
 */
async function authorizeEndpoint(
  req: NextRequest,
  ctx: TwinCtx,
  nodeId: string,
  notFound: () => TwinDomainError,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const node = await getNode(nodeId, ctx.orgId);
  if (!node) {
    const e = notFound();
    return { ok: false, response: twinJsonError(e.status, e.code, e.message) };
  }
  return authorizeTwinSite(req, ctx, node.siteId, "manage", notFound);
}

function optionalId(req: NextRequest, name: string): { ok: true; value?: string } | { ok: false } {
  const raw = req.nextUrl.searchParams.get(name);
  if (raw === null) return { ok: true };
  const parsed = idSchema.safeParse(raw);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false };
}

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

  const source = optionalId(req, "sourceNodeId");
  const target = optionalId(req, "targetNodeId");
  if (!source.ok) return twinJsonError(400, "VALIDATION_FAILED", "sourceNodeId is invalid");
  if (!target.ok) return twinJsonError(400, "VALIDATION_FAILED", "targetNodeId is invalid");

  try {
    const allowedSiteIds = await resolveSiteScope(ctx.userId, ctx.orgId);
    const { relations, truncated } = await listRelationsPage(ctx.orgId, {
      sourceNodeId: source.value,
      targetNodeId: target.value,
      allowedSiteIds,
    });

    meterIndustrialEvent(ctx.orgId, "digital_twin_queries");
    return NextResponse.json({ relations, truncated });
  } catch (err) {
    return twinErrorResponse(err, "relations.list");
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

  const body = await parseJsonBody(req, createRelationBody, TWIN_LIMITS.BODY_BYTES);
  if (!body.ok) return body.response;
  const input = body.data;

  try {
    // Resolve and authorise each endpoint on its own, in a fixed order (source, then
    // target), and refuse with that endpoint's own error. "Does not exist", "belongs
    // to another organisation" and "sits at a site the caller cannot reach" must be
    // the SAME answer — and, per endpoint, the same answer as each other. Refusing
    // with a generic NODE_NOT_FOUND for the unreachable case (as an earlier version
    // did) told a caller which of their ids were real nodes at sites they may not see.
    const source = await authorizeEndpoint(req, ctx, input.sourceNodeId, twinNotFound.source);
    if (!source.ok) return source.response;
    const target = await authorizeEndpoint(req, ctx, input.targetNodeId, twinNotFound.target);
    if (!target.ok) return target.response;

    const relation = await createRelation({
      organizationId: ctx.orgId,
      sourceNodeId:   input.sourceNodeId,
      targetNodeId:   input.targetNodeId,
      relationType:   input.relationType as DigitalTwinRelationType,
      metadata:       input.metadata,
      actorUserId:    ctx.userId,
    });
    if (!relation) {
      const e = twinNotFound.unavailable();
      return twinJsonError(e.status, e.code, e.message);
    }

    meterIndustrialEvent(ctx.orgId, "digital_twin_relations");
    return NextResponse.json({ relation }, { status: 201 });
  } catch (err) {
    return twinErrorResponse(err, "relations.create");
  }
}
