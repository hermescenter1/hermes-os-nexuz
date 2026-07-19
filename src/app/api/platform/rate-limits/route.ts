/**
 * GET /api/platform/rate-limits — Current rate-limit counters for the org.
 *
 * Returns both windows (minute + day) without incrementing counters.
 * Auth: JWT session or API key (billing.read scope).
 */

import { NextRequest, NextResponse }  from "next/server";
import { requirePlatformAuth }        from "@/lib/api/auth";
import { requireOrgActor }            from "@/lib/org/context";
import { requirePermission }          from "@/lib/org/rbac";
import { getRateLimitStatus }         from "@/lib/api/rate-limit";
import { hasScope }                   from "@/lib/api/scopes";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  if (ctx.authMethod === "apikey" && !hasScope(ctx.scopes, "billing.read")) {
    return NextResponse.json({ error: "Missing required scope: billing.read" }, { status: 403 });
  }

  // PHASE 87L.6G — the API-key path was scope-gated but the SESSION path had no
  // org-permission check, so any authenticated member could read the org's
  // platform counters. Mirror the sibling keys route: "view_api_keys".
  if (ctx.authMethod !== "apikey") {
    const member = await requireOrgActor(req, ctx.orgId);
    if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
    const perm = requirePermission(member.ctx.role, "view_api_keys");
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
  }

  const state = await getRateLimitStatus(ctx.orgId);
  return NextResponse.json({ orgId: ctx.orgId, rateLimit: state });
}
