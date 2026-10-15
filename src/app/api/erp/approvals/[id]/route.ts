import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getActiveOrganizationContext } from "@/lib/erp/active-organization";
import { decideApproval } from "@/lib/erp/operations";
import { ApprovalDecisionSchema } from "@/lib/erp/ops-schemas";
import { ErpError, erpFailure } from "@/lib/erp/tenant";
import { requirePermission } from "@/lib/org/rbac";
import { ctxFor, idempotencyKeyOf, originRefusal, parseWith, readJsonBody } from "@/lib/erp/http";
import { securityError } from "@/lib/security/request-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

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
  const input = parseWith(ApprovalDecisionSchema, body.value);
  if (!input.ok) return input.response;
  // The tenant identifier comes only from the server-side context.
  const { organizationId } = scope;
  // A decision requires an Idempotency-Key: a retry replays the stored result.
  const tenantCtx = ctxFor({ ...scope, organizationId }, req, idempotencyKeyOf(req));
  try {
    const outcome = await decideApproval(tenantCtx, id, input.data);
    if (outcome.value === null) return erpFailure(new ErpError(404, "NOT_FOUND"));
    // A decision is an update, so it answers 200 for both first write and replay.
    return securityError(outcome.value as unknown as Record<string, unknown>, 200, outcome.kind === "replayed" ? { "Idempotent-Replayed": "true" } : undefined);
  } catch (err) {
    return erpFailure(err);
  }
}
