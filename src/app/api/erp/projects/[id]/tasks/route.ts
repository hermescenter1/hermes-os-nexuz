import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getActiveOrganizationContext } from "@/lib/erp/active-organization";
import { listProjectTasks } from "@/lib/erp/operations";
import { ChildListQuerySchema } from "@/lib/erp/pagination";
import { ErpError, erpFailure } from "@/lib/erp/tenant";
import { requirePermission } from "@/lib/org/rbac";
import { ctxFor, ok, parseWith } from "@/lib/erp/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return erpFailure(new ErpError(401, "AUTHENTICATION_REQUIRED"));
  if (!can(user.role, "admin")) return erpFailure(new ErpError(403, "FORBIDDEN"));
  const active = await getActiveOrganizationContext();
  if (!active.ok) return erpFailure(active.error);
  const allowed = requirePermission(active.scope.role, "view_erp");
  if (!allowed.ok) return erpFailure(new ErpError(403, "FORBIDDEN"));
  const query = parseWith(ChildListQuerySchema, Object.fromEntries(new URL(req.url).searchParams));
  if (!query.ok) return query.response;
  // The tenant identifier comes only from the server-side context.
  const { organizationId } = active.scope;
  try {
    return ok(await listProjectTasks(ctxFor({ ...active.scope, organizationId }, req), id, query.data));
  } catch (err) {
    return erpFailure(err);
  }
}
