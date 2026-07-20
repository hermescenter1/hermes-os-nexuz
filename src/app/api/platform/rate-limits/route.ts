/**
 * GET /api/platform/rate-limits — Current rate-limit counters for the org.
 *
 * Returns both windows (minute + day) without incrementing counters.
 * Auth: JWT session or API key (billing.read scope).
 */

import { NextRequest, NextResponse }  from "next/server";
import { requirePlatformAuth }        from "@/lib/api/auth";
import { authorizePlatformActor }     from "@/lib/api/authorize";
import { getRateLimitStatus }         from "@/lib/api/rate-limit";

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

  const state = await getRateLimitStatus(ctx.orgId);
  return NextResponse.json({ orgId: ctx.orgId, rateLimit: state });
}
