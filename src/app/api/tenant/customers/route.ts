/**
 * /api/tenant/customers — the active organization's customers.
 *
 *   GET  list: search (q), status, owner ("me" or a member id), follow-up state,
 *        archived; cursor-paged, at most 100 rows.        needs view_customers
 *   POST create one customer.                              needs manage_customers
 *
 * The organization is ALWAYS the session's server-side active organization;
 * no request field names one. A cross-site POST is refused before the session
 * is read.
 */
import type { NextRequest } from "next/server";
import { getActiveOrganizationContext } from "@/lib/erp/active-organization";
import { erpFailure } from "@/lib/erp/tenant";
import { originRefusal, ok, readJsonBody } from "@/lib/erp/http";
import { requirePermission } from "@/lib/org/rbac";
import { CustomerCreateSchema, CustomerListQuerySchema } from "@/lib/customers/schemas";
import { createCustomer, listCustomers } from "@/lib/customers/service";
import { customerCtx, customerFailure, forbidden, parseFields } from "@/lib/customers/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const active = await getActiveOrganizationContext();
  if (!active.ok) return erpFailure(active.error);
  if (!requirePermission(active.scope.role, "view_customers").ok) return forbidden();
  const query = parseFields(CustomerListQuerySchema, Object.fromEntries(new URL(req.url).searchParams));
  if (!query.ok) return query.response;
  try {
    return ok(await listCustomers(customerCtx({ organizationId: active.scope.organizationId, userId: active.scope.userId }), query.data));
  } catch (err) {
    return customerFailure(err);
  }
}

export async function POST(req: NextRequest) {
  const refused = originRefusal(req);
  if (refused) return refused;
  const active = await getActiveOrganizationContext();
  if (!active.ok) return erpFailure(active.error);
  if (!requirePermission(active.scope.role, "manage_customers").ok) return forbidden();
  const body = await readJsonBody(req);
  if (!body.ok) return body.response;
  const input = parseFields(CustomerCreateSchema, body.value);
  if (!input.ok) return input.response;
  try {
    return ok(await createCustomer(customerCtx({ organizationId: active.scope.organizationId, userId: active.scope.userId }), input.data), 201);
  } catch (err) {
    return customerFailure(err);
  }
}
