/**
 * GET  /api/platform/keys — List API keys for the authenticated org
 * POST /api/platform/keys — Create a new API key (raw key returned once)
 *
 * Auth: JWT session or API key (with admin scope).
 * RBAC: manage_api_keys (create) / view_api_keys (list).
 * orgId is ALWAYS derived from session/membership — never from request body.
 */

import { NextRequest, NextResponse }       from "next/server";
import { requirePlatformAuth }             from "@/lib/api/auth";
import { authorizePlatformActor }  from "@/lib/api/authorize";
import { listApiKeys, createApiKey }       from "@/lib/api/keys";
import { validateScopes }                  from "@/lib/api/scopes";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  // Key INVENTORY is session-only: an API key is not an organization member and
  // must never be able to enumerate the organization's keys. No apiKeyScope is
  // granted here, so API-key actors are refused explicitly rather than by
  // accident of the membership lookup failing.
  const authz = await authorizePlatformActor(req, ctx, { permission: "view_api_keys" });
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status });

  const keys = await listApiKeys(ctx.orgId);
  return NextResponse.json({ keys });
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  // PHASE 87L.6H.1A — exhaustive fail-closed authorization. The previous
  // positive branching (`if apikey {...}` + `if jwt && userId {...}`) let an
  // unrecognized authMethod fall through BOTH checks into key creation.
  // API-key actors still authorize by the "admin" scope; session actors still
  // authorize by the manage_api_keys organization permission.
  const authz = await authorizePlatformActor(req, ctx, {
    permission:  "manage_api_keys",
    apiKeyScope: "admin",
  });
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const sv = validateScopes(Array.isArray(body.scopes) ? body.scopes : []);
  if (!sv.ok) return NextResponse.json({ error: sv.error }, { status: 400 });

  const expiresAt = body.expiresAt && typeof body.expiresAt === "string"
    ? new Date(body.expiresAt) : undefined;

  const result = await createApiKey({
    organizationId: ctx.orgId,
    name:           body.name,
    scopes:         sv.scopes,
    expiresAt,
    createdById:    ctx.userId ?? undefined,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ key: result.key }, { status: 201 });
}
