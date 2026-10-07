import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getActiveOrganizationContext } from "@/lib/erp/active-organization";
import { removeTeamMember } from "@/lib/erp/db";
import { erpFailure, ErpError } from "@/lib/erp/tenant";
import { requirePermission } from "@/lib/org/rbac";
import { ctxFor, noContent, originRefusal } from "@/lib/erp/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE carries no Idempotency-Key. A member that is already gone is a 204 as well:
 * the team is proven to belong to the caller's organization first (404 otherwise).
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const refused = originRefusal(req);
  if (refused) return refused;
  const { id, userId: memberUserId } = await params;
  const user = await getCurrentUser();
  if (!user) return erpFailure(new ErpError(401, "AUTHENTICATION_REQUIRED"));
  if (!can(user.role, "admin")) return erpFailure(new ErpError(403, "FORBIDDEN"));
  const active = await getActiveOrganizationContext();
  if (!active.ok) return erpFailure(active.error);
  const allowed = requirePermission(active.scope.role, "manage_erp");
  if (!allowed.ok) return erpFailure(new ErpError(403, "FORBIDDEN"));
  const scope = active.scope;
  // The tenant identifier comes only from the server-side context.
  const { organizationId } = scope;
  const tenantCtx = ctxFor({ ...scope, organizationId }, req);
  try {
    await removeTeamMember(tenantCtx, id, memberUserId);
    return noContent();
  } catch (err) {
    return erpFailure(err);
  }
}
