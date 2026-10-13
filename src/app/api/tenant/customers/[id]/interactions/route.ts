/**
 * /api/tenant/customers/[id]/interactions — the customer's contact log.
 *
 *   GET  newest first, cursor-paged.                      needs view_customers
 *   POST record one contact (append-only; there is no edit or delete).
 *                                                         needs manage_customers
 */
import type { NextRequest } from "next/server";
import { getActiveOrganizationContext } from "@/lib/erp/active-organization";
import { erpFailure } from "@/lib/erp/tenant";
import { originRefusal, ok, readJsonBody } from "@/lib/erp/http";
import { requirePermission } from "@/lib/org/rbac";
import { InteractionCreateSchema, InteractionListQuerySchema } from "@/lib/customers/schemas";
import { addInteraction, listInteractions } from "@/lib/customers/service";
import { customerCtx, customerFailure, forbidden, parseFields } from "@/lib/customers/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const active = await getActiveOrganizationContext();
  if (!active.ok) return erpFailure(active.error);
  if (!requirePermission(active.scope.role, "view_customers").ok) return forbidden();
  const query = parseFields(InteractionListQuerySchema, Object.fromEntries(new URL(req.url).searchParams));
  if (!query.ok) return query.response;
  try {
    return ok(await listInteractions(customerCtx({ organizationId: active.scope.organizationId, userId: active.scope.userId }), id, query.data));
  } catch (err) {
    return customerFailure(err);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const refused = originRefusal(req);
  if (refused) return refused;
  const { id } = await params;
  const active = await getActiveOrganizationContext();
  if (!active.ok) return erpFailure(active.error);
  if (!requirePermission(active.scope.role, "manage_customers").ok) return forbidden();
  const body = await readJsonBody(req);
  if (!body.ok) return body.response;
  const input = parseFields(InteractionCreateSchema, body.value);
  if (!input.ok) return input.response;
  try {
    return ok(await addInteraction(customerCtx({ organizationId: active.scope.organizationId, userId: active.scope.userId }), id, input.data), 201);
  } catch (err) {
    return customerFailure(err);
  }
}
