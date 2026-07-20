/**
 * POST /api/platform/keys/[id]/rotate
 *
 * Creates a replacement key (same name + scopes), revokes the old key.
 * The new raw key is returned once — it cannot be recovered.
 * Audit event: API_KEY_ROTATED.
 */

import { NextRequest, NextResponse }  from "next/server";
import { requirePlatformAuth }        from "@/lib/api/auth";
import { authorizePlatformActor }  from "@/lib/api/authorize";
import { rotateApiKey }               from "@/lib/api/keys";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  // PHASE 87L.6H.1A — exhaustive fail-closed authorization. The previous
  // positive branching (`if apikey {...}` + `if jwt && userId {...}`) let an
  // unrecognized authMethod fall through BOTH checks into the handler body.
  const authz = await authorizePlatformActor(req, ctx, {
    permission:  "manage_api_keys",
    apiKeyScope: "admin",
  });
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status });

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
