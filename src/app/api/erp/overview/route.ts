import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getActiveOrganizationContext } from "@/lib/erp/active-organization";
import { getErpOverview } from "@/lib/erp/operations";
import { ErpError, erpFailure } from "@/lib/erp/tenant";
import { requirePermission } from "@/lib/org/rbac";
import { ctxFor, ok } from "@/lib/erp/http";

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
  try {
    const overview = await getErpOverview(ctxFor(scope, req));
    // No operational rows for this organization: an explicit empty marker, never invented numbers.
    return ok(overview ?? { empty: true });
  } catch (err) {
    return erpFailure(err);
  }
}
