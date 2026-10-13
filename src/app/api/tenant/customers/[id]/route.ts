/**
 * /api/tenant/customers/[id] — one customer of the active organization.
 *
 *   GET   read.                                           needs view_customers
 *   PATCH partial update, archive or restore; carries the version it read
 *         (409 when stale).                               needs manage_customers
 *
 * Another organization's customer answers 404 — the same as one that does not
 * exist — so the route is not an existence oracle.
 */
import type { NextRequest } from "next/server";
import { getActiveOrganizationContext } from "@/lib/erp/active-organization";
import { erpFailure } from "@/lib/erp/tenant";
import { originRefusal, ok, readJsonBody } from "@/lib/erp/http";
import { requirePermission } from "@/lib/org/rbac";
import { CustomerUpdateSchema } from "@/lib/customers/schemas";
import { getCustomer, updateCustomer } from "@/lib/customers/service";
import { customerCtx, customerFailure, forbidden, parseFields } from "@/lib/customers/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const active = await getActiveOrganizationContext();
  if (!active.ok) return erpFailure(active.error);
  if (!requirePermission(active.scope.role, "view_customers").ok) return forbidden();
  try {
    return ok(await getCustomer(customerCtx({ organizationId: active.scope.organizationId, userId: active.scope.userId }), id));
  } catch (err) {
    return customerFailure(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const refused = originRefusal(req);
  if (refused) return refused;
  const { id } = await params;
  const active = await getActiveOrganizationContext();
  if (!active.ok) return erpFailure(active.error);
  if (!requirePermission(active.scope.role, "manage_customers").ok) return forbidden();
  const body = await readJsonBody(req);
  if (!body.ok) return body.response;
  const input = parseFields(CustomerUpdateSchema, body.value);
  if (!input.ok) return input.response;
  try {
    return ok(await updateCustomer(customerCtx({ organizationId: active.scope.organizationId, userId: active.scope.userId }), id, input.data));
  } catch (err) {
    return customerFailure(err);
  }
}
