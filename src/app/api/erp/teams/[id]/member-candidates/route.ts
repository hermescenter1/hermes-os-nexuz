import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getActiveOrganizationContext } from "@/lib/erp/active-organization";
import { listMemberCandidates } from "@/lib/erp/db";
import { MemberCandidateQuerySchema } from "@/lib/erp/ops-schemas";
import { ErpError, erpFailure } from "@/lib/erp/tenant";
import { requirePermission } from "@/lib/org/rbac";
import { ctxFor, ok, parseWith } from "@/lib/erp/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Picker for adding a member: active members of the active organization who are not yet in the team. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return erpFailure(new ErpError(401, "AUTHENTICATION_REQUIRED"));
  if (!can(user.role, "admin")) return erpFailure(new ErpError(403, "FORBIDDEN"));
  const active = await getActiveOrganizationContext();
  if (!active.ok) return erpFailure(active.error);
  const allowed = requirePermission(active.scope.role, "manage_erp");
  if (!allowed.ok) return erpFailure(new ErpError(403, "FORBIDDEN"));
  const query = parseWith(MemberCandidateQuerySchema, Object.fromEntries(new URL(req.url).searchParams));
  if (!query.ok) return query.response;
  // The tenant identifier comes only from the server-side context.
  const { organizationId } = active.scope;
  try {
    return ok(await listMemberCandidates(ctxFor({ ...active.scope, organizationId }, req), id, query.data));
  } catch (err) {
    return erpFailure(err);
  }
}
