/**
 * GET /api/platform/usage — API call usage statistics for the authenticated org.
 *
 * Returns per-day counts for the last 30 days (API-key-metered calls only).
 * Auth: JWT session or API key (billing.read scope).
 */

import { NextRequest, NextResponse }  from "next/server";
import { requirePlatformAuth }        from "@/lib/api/auth";
import { getApiUsageSummary }         from "@/lib/api/meter";
import { hasScope }                   from "@/lib/api/scopes";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  if (ctx.authMethod === "apikey" && !hasScope(ctx.scopes, "billing.read")) {
    return NextResponse.json({ error: "Missing required scope: billing.read" }, { status: 403 });
  }

  const daysParam = req.nextUrl.searchParams.get("days");
  const days = Math.min(90, Math.max(1, parseInt(daysParam ?? "30", 10) || 30));

  const summary = await getApiUsageSummary(ctx.orgId, days);
  return NextResponse.json({ orgId: ctx.orgId, days, summary });
}
