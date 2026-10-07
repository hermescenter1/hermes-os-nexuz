import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getActiveOrganizationContext } from "@/lib/erp/active-organization";
import { getProjectById, updateProject } from "@/lib/erp/operations";
import { ProjectUpdateSchema } from "@/lib/erp/ops-schemas";
import { ErpError, erpFailure } from "@/lib/erp/tenant";
import { requirePermission } from "@/lib/org/rbac";
import { ctxFor, originRefusal, ok, parseWith, readJsonBody } from "@/lib/erp/http";

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
  const scope = active.scope;
  // The tenant identifier comes only from the server-side context.
  const { organizationId } = scope;
  const tenantCtx = ctxFor({ ...scope, organizationId }, req);
  try {
    return ok(await getProjectById(tenantCtx, id));
  } catch (err) {
    return erpFailure(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const refused = originRefusal(req);
  if (refused) return refused;
  const user = await getCurrentUser();
  if (!user) return erpFailure(new ErpError(401, "AUTHENTICATION_REQUIRED"));
  if (!can(user.role, "admin")) return erpFailure(new ErpError(403, "FORBIDDEN"));
  const active = await getActiveOrganizationContext();
  if (!active.ok) return erpFailure(active.error);
  const allowed = requirePermission(active.scope.role, "manage_erp");
  if (!allowed.ok) return erpFailure(new ErpError(403, "FORBIDDEN"));
  const scope = active.scope;
  const body = await readJsonBody(req);
  if (!body.ok) return body.response;
  const input = parseWith(ProjectUpdateSchema, body.value);
  if (!input.ok) return input.response;
  // The tenant identifier comes only from the server-side context.
  const { organizationId } = scope;
  const tenantCtx = ctxFor({ ...scope, organizationId }, req);
  try {
    return ok(await updateProject(tenantCtx, id, input.data));
  } catch (err) {
    return erpFailure(err);
  }
}
