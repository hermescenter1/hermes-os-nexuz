import { NextRequest, NextResponse }  from "next/server";
import { requirePlatformAuth }          from "@/lib/api/auth";
import { requireOrgActor }              from "@/lib/org/context";
import { requirePermission }            from "@/lib/org/rbac";
import { getAssetGraph }              from "@/lib/digital-twin/graph";
import { meterIndustrialEvent }       from "@/lib/api/meter";
import { authorizeTwinSite, requireSessionAuth, twinAuthRefusal, type TwinCtx } from "@/lib/digital-twin/guard";
import { siteIdQuery }                from "@/lib/digital-twin/schemas";
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

  const rawSite = req.nextUrl.searchParams.get("siteId");
  if (!rawSite) return twinJsonError(400, "VALIDATION_FAILED", "siteId is required");
  const parsed = siteIdQuery.safeParse(rawSite);
  if (!parsed.success) return twinJsonError(400, "VALIDATION_FAILED", "siteId is invalid");
  const siteId = parsed.data;

  try {
    // An unreachable site is indistinguishable from one that does not exist. Inside the
    // try (Slice D2) so a guard failure gets the normalised error answer, not a raw 500.
    const site = await authorizeTwinSite(req, ctx, siteId, "view", twinNotFound.site);
    if (!site.ok) return site.response;

    // The guard above proved this one site; it is the whole scope of this read.
    const graph = await getAssetGraph(ctx.orgId, siteId, [siteId]);
    if (!graph) {
      const e = twinNotFound.unavailable();
      return twinJsonError(e.status, e.code, e.message);
    }

    meterIndustrialEvent(ctx.orgId, "digital_twin_queries");

    // Serialize Map to plain object for JSON response
    const nodes = Object.fromEntries(graph.nodes);
    return NextResponse.json({
      siteId: graph.siteId,
      nodes,
      relations: graph.relations,
      truncated: graph.truncated ?? false,
    });
  } catch (err) {
    return twinErrorResponse(err, "graph.get");
  }
}
