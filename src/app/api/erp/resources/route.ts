import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getActiveOrganizationContext } from "@/lib/erp/active-organization";
import { createResource, listResources } from "@/lib/erp/db";
import { ListQuerySchema, ResourceCreateSchema } from "@/lib/erp/schemas";
import { erpFailure, ErpError } from "@/lib/erp/tenant";
import { requirePermission } from "@/lib/org/rbac";
import { ctxFor, idempotencyKeyOf, originRefusal, outcomeResponse, ok, parseWith, readJsonBody } from "@/lib/erp/http";

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
  const query = parseWith(ListQuerySchema, Object.fromEntries(new URL(req.url).searchParams));
  if (!query.ok) return query.response;
  try {
    return ok(await listResources(ctxFor(scope, req), query.data));
  } catch (err) {
    return erpFailure(err);
  }
}

export async function POST(req: NextRequest) {
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
  const input = parseWith(ResourceCreateSchema, body.value);
  if (!input.ok) return input.response;
  try {
    const outcome = await createResource(ctxFor(scope, req, idempotencyKeyOf(req)), input.data);
    return outcomeResponse(outcome, resource => resource);
  } catch (err) {
    return erpFailure(err);
  }
}
