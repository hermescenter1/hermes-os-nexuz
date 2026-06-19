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
import { requireOrgActor }                 from "@/lib/org/context";
import { requirePermission }               from "@/lib/org/rbac";
import { listApiKeys, createApiKey }       from "@/lib/api/keys";
import { validateScopes }                  from "@/lib/api/scopes";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  // Verify org-level RBAC
  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });

  const perm = requirePermission(member.ctx.role, "view_api_keys");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const keys = await listApiKeys(ctx.orgId);
  return NextResponse.json({ keys });
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  // For API-key auth: require admin scope to create more keys
  if (ctx.authMethod === "apikey") {
    const { requireScope } = await import("@/lib/api/scopes");
    const sc = requireScope(ctx.scopes, "admin");
    if (!sc.ok) return NextResponse.json({ error: sc.error }, { status: sc.status });
  }

  // Verify org-level RBAC (JWT session)
  if (ctx.authMethod === "jwt" && ctx.userId) {
    const member = await requireOrgActor(req, ctx.orgId);
    if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
    const perm = requirePermission(member.ctx.role, "manage_api_keys");
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
  }

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
