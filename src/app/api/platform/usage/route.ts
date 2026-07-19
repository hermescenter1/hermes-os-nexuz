/**
 * GET /api/platform/usage — API call usage statistics for the authenticated org.
 *
 * Returns per-day counts for the last 30 days (API-key-metered calls only).
 * Auth: JWT session or API key (billing.read scope).
 */

import { NextRequest, NextResponse }  from "next/server";
import { requirePlatformAuth }        from "@/lib/api/auth";
import { authorizePlatformActor }     from "@/lib/api/authorize";
import { getApiUsageSummary }         from "@/lib/api/meter";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  // PHASE 87L.6H.1A — exhaustive fail-closed authorization. Aggregate usage is
  // readable by an API key holding "billing.read", or by a session actor
  // holding view_api_usage. Any unrecognized authMethod is denied by the
  // helper's default branch rather than implicitly treated as a session.
  const authz = await authorizePlatformActor(req, ctx, {
    permission:  "view_api_usage",
    apiKeyScope: "billing.read",
  });
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status });

  const daysParam = req.nextUrl.searchParams.get("days");
  const days = Math.min(90, Math.max(1, parseInt(daysParam ?? "30", 10) || 30));

  const summary = await getApiUsageSummary(ctx.orgId, days);
  return NextResponse.json({ orgId: ctx.orgId, days, summary });
}
