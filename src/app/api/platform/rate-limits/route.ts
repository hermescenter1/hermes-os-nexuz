/**
 * GET /api/platform/rate-limits — Current rate-limit counters for the org.
 *
 * Returns both windows (minute + day) without incrementing counters.
 * Auth: JWT session or API key (billing.read scope).
 */

import { NextRequest, NextResponse }  from "next/server";
import { requirePlatformAuth }        from "@/lib/api/auth";
import { getRateLimitStatus }         from "@/lib/api/rate-limit";
import { hasScope }                   from "@/lib/api/scopes";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  if (ctx.authMethod === "apikey" && !hasScope(ctx.scopes, "billing.read")) {
    return NextResponse.json({ error: "Missing required scope: billing.read" }, { status: 403 });
  }

  const state = await getRateLimitStatus(ctx.orgId);
  return NextResponse.json({ orgId: ctx.orgId, rateLimit: state });
}
