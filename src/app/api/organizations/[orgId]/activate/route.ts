import type { NextRequest } from "next/server";
import { requireOrgActor } from "@/lib/org/context";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { activateOrganization, readSessionIdentity } from "@/lib/erp/active-organization";
import { ErpError, erpFailure } from "@/lib/erp/tenant";
import { originRefusal, ok } from "@/lib/erp/http";
import { resolveRequestId } from "@/lib/logger/correlation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/organizations/[orgId]/activate
 *
 * Records the caller's active organization for THIS server session. Trusted
 * Origin, a live session (signed token + session row), and an ACTIVE membership
 * are all required. A foreign, deleted or inactive organization answers 404 and
 * writes nothing. The selection is server state, bound to the session row id.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const refused = originRefusal(req);
  if (refused) return refused;
  const { orgId } = await params;

  const identity = await readSessionIdentity(req.cookies.get(ACCESS_TOKEN_COOKIE)?.value);
  if (!identity) return erpFailure(new ErpError(401, "AUTHENTICATION_REQUIRED"));
  // A legacy token without a session id cannot own a server-side selection.
  if (!identity.sessionId) return erpFailure(new ErpError(401, "SESSION_REQUIRED"));

  const gate = await requireOrgActor(req, orgId);
  if ("error" in gate) {
    if (gate.status === 401) return erpFailure(new ErpError(401, "AUTHENTICATION_REQUIRED"));
    return erpFailure(new ErpError(404, "NOT_FOUND"));
  }

  const outcome = await activateOrganization({
    userId: identity.userId,
    sessionId: identity.sessionId,
    organizationId: gate.ctx.orgId,
    correlationId: resolveRequestId(req),
  });
  if (!outcome.ok) return erpFailure(outcome.error);
  return ok({ organizationId: outcome.scope.organizationId }, 200);
}
