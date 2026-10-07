import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getActiveOrganizationContext } from "@/lib/erp/active-organization";
import { addTeamMember, listTeamMembers } from "@/lib/erp/db";
import { TeamMemberAddSchema } from "@/lib/erp/schemas";
import { ChildListQuerySchema } from "@/lib/erp/pagination";
import { erpFailure, ErpError } from "@/lib/erp/tenant";
import { requirePermission } from "@/lib/org/rbac";
import { ctxFor, idempotencyKeyOf, originRefusal, outcomeResponse, ok, parseWith, readJsonBody } from "@/lib/erp/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    return ok(await listTeamMembers(ctxFor({ ...active.scope, organizationId }, req), id, query.data));
  } catch (err) {
    return erpFailure(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const input = parseWith(TeamMemberAddSchema, body.value);
  if (!input.ok) return input.response;
  // The tenant identifier comes only from the server-side context.
  const { organizationId } = scope;
  const tenantCtx = ctxFor({ ...scope, organizationId }, req, idempotencyKeyOf(req));
  try {
    const outcome = await addTeamMember(tenantCtx, id, input.data);
    return outcomeResponse(outcome, member => member);
  } catch (err) {
    return erpFailure(err);
  }
}
