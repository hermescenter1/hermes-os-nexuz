import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getActiveOrganizationContext } from "@/lib/erp/active-organization";
import { listApprovals } from "@/lib/erp/operations";
import { ApprovalListQuerySchema } from "@/lib/erp/ops-schemas";
import { ErpError, erpFailure } from "@/lib/erp/tenant";
import { requirePermission } from "@/lib/org/rbac";
import { ctxFor, ok, parseWith } from "@/lib/erp/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return erpFailure(new ErpError(401, "AUTHENTICATION_REQUIRED"));
  if (!can(user.role, "admin")) return erpFailure(new ErpError(403, "FORBIDDEN"));
  const active = await getActiveOrganizationContext();
  if (!active.ok) return erpFailure(active.error);
  const allowed = requirePermission(active.scope.role, "view_erp");
  if (!allowed.ok) return erpFailure(new ErpError(403, "FORBIDDEN"));
  const scope = active.scope;
  const query = parseWith(ApprovalListQuerySchema, Object.fromEntries(new URL(req.url).searchParams));
  if (!query.ok) return query.response;
  try {
    return ok(await listApprovals(ctxFor(scope, req), query.data));
  } catch (err) {
    return erpFailure(err);
  }
}
