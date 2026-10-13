/**
 * /api/tenant/customers/[id]/projects — the organization's projects for this
 * customer, and their recorded cost per currency.
 *
 *   GET  needs view_customers AND view_erp — project data is ERP data.
 *   PUT  link or unlink one project; needs manage_customers AND manage_erp.
 *
 * Only projects of the active organization can be linked; the composite foreign
 * key makes any other link impossible to store.
 */
import type { NextRequest } from "next/server";
import { getActiveOrganizationContext } from "@/lib/erp/active-organization";
import { erpFailure } from "@/lib/erp/tenant";
import { originRefusal, ok, readJsonBody } from "@/lib/erp/http";
import { requirePermission } from "@/lib/org/rbac";
import { ProjectLinkSchema } from "@/lib/customers/schemas";
import { linkedProjects, setProjectLink } from "@/lib/customers/service";
import { customerCtx, customerFailure, forbidden, parseFields } from "@/lib/customers/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const active = await getActiveOrganizationContext();
  if (!active.ok) return erpFailure(active.error);
  if (!requirePermission(active.scope.role, "view_customers").ok) return forbidden();
  if (!requirePermission(active.scope.role, "view_erp").ok) return forbidden();
  try {
    return ok(await linkedProjects(customerCtx({ organizationId: active.scope.organizationId, userId: active.scope.userId }), id));
  } catch (err) {
    return customerFailure(err);
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const refused = originRefusal(req);
  if (refused) return refused;
  const { id } = await params;
  const active = await getActiveOrganizationContext();
  if (!active.ok) return erpFailure(active.error);
  if (!requirePermission(active.scope.role, "manage_customers").ok) return forbidden();
  if (!requirePermission(active.scope.role, "manage_erp").ok) return forbidden();
  const body = await readJsonBody(req);
  if (!body.ok) return body.response;
  const input = parseFields(ProjectLinkSchema, body.value);
  if (!input.ok) return input.response;
  try {
    return ok(await setProjectLink(customerCtx({ organizationId: active.scope.organizationId, userId: active.scope.userId }), id, input.data));
  } catch (err) {
    return customerFailure(err);
  }
}
