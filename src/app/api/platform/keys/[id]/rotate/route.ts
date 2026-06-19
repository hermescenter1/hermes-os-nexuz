/**
 * POST /api/platform/keys/[id]/rotate
 *
 * Creates a replacement key (same name + scopes), revokes the old key.
 * The new raw key is returned once — it cannot be recovered.
 * Audit event: API_KEY_ROTATED.
 */

import { NextRequest, NextResponse }  from "next/server";
import { requirePlatformAuth }        from "@/lib/api/auth";
import { requireOrgActor }            from "@/lib/org/context";
import { requirePermission }          from "@/lib/org/rbac";
import { rotateApiKey }               from "@/lib/api/keys";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  if (ctx.authMethod === "apikey") {
    const { requireScope } = await import("@/lib/api/scopes");
    const sc = requireScope(ctx.scopes, "admin");
    if (!sc.ok) return NextResponse.json({ error: sc.error }, { status: sc.status });
  }

  if (ctx.authMethod === "jwt" && ctx.userId) {
    const member = await requireOrgActor(req, ctx.orgId);
    if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
    const perm = requirePermission(member.ctx.role, "manage_api_keys");
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
  }

  const result = await rotateApiKey({
    keyId:          id,
    organizationId: ctx.orgId,
    actorUserId:    ctx.userId ?? undefined,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({
    key:           result.key,
    revokedKeyId:  result.revokedKeyId,
  }, { status: 201 });
}
