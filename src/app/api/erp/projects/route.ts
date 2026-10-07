import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getActiveOrganizationContext } from "@/lib/erp/active-organization";
import { createProject, listProjects } from "@/lib/erp/operations";
import { ProjectCreateSchema, ProjectListQuerySchema } from "@/lib/erp/ops-schemas";
import { ErpError, erpFailure } from "@/lib/erp/tenant";
import { requirePermission } from "@/lib/org/rbac";
import { ctxFor, idempotencyKeyOf, originRefusal, outcomeResponse, ok, parseWith, readJsonBody } from "@/lib/erp/http";
import { onProjectCreated } from "@/lib/erp/triggers";

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
  const query = parseWith(ProjectListQuerySchema, Object.fromEntries(new URL(req.url).searchParams));
  if (!query.ok) return query.response;
  try {
    return ok(await listProjects(ctxFor(scope, req), query.data));
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
  const input = parseWith(ProjectCreateSchema, body.value);
  if (!input.ok) return input.response;
  try {
    const outcome = await createProject(ctxFor(scope, req, idempotencyKeyOf(req)), input.data);
    if (outcome.kind === "created") onProjectCreated(outcome.value.id, outcome.value.name);
    return outcomeResponse(outcome, project => project);
  } catch (err) {
    return erpFailure(err);
  }
}
