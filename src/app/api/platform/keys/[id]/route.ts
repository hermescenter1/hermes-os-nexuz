/**
 * DELETE /api/platform/keys/[id] — Revoke an API key
 *
 * Auth: JWT session or API key (admin scope required for API-key auth).
 * RBAC: manage_api_keys.
 * orgId always derived from session — the key is verified to belong to that org.
 */

import { NextRequest, NextResponse }  from "next/server";
import { requirePlatformAuth }        from "@/lib/api/auth";
import { authorizePlatformActor }  from "@/lib/api/authorize";
import { revokeApiKey }               from "@/lib/api/keys";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
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

  const result = await revokeApiKey({
    keyId:          id,
    organizationId: ctx.orgId,
    revokedById:    ctx.userId ?? undefined,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ ok: true });
}
