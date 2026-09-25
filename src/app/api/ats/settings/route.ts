import type { NextRequest } from "next/server";
import { requireAtsActor } from "@/lib/ats/rbac";
import { getSettingsView, updateSettings } from "@/lib/ats/settings/service";
import { correlationOf, mutationPreconditions, mutationResponse, readJsonBody, readResponse, refusal } from "@/lib/ats/positions/http";

/**
 * ATS-M1 — the organization's ATS settings.
 *
 *   GET   — ATS_MANAGE. Values, the locked platform invariants, the AI review
 *           versions and the organization's recruitment retention policies.
 *           The security section (configured / missing — never a value) is
 *           included for ATS_ADMIN only.
 *   PATCH — one section per request. The route admits ATS_MANAGE; the service
 *           requires ATS_ADMIN for humanApproval, ai and publicCareers, and a
 *           written reason for each of those. Origin, tenant precondition,
 *           Idempotency-Key and `expectedVersion` as for every M1 write.
 */
export async function GET(req: NextRequest) {
  const actor = await requireAtsActor(req, "ATS_MANAGE");
  if (!actor.ok) return actor.response;
  const correlationId = correlationOf(req);
  const view = await getSettingsView(actor.ctx.orgId, actor.ctx.role);
  if (!view) return refusal("STORE_UNAVAILABLE", correlationId);
  return readResponse({ view }, correlationId);
}

export async function PATCH(req: NextRequest) {
  const actor = await requireAtsActor(req, "ATS_MANAGE");
  if (!actor.ok) return actor.response;
  const pre = mutationPreconditions(req);
  if (!pre.ok) return pre.response;

  const body = await readJsonBody(req);
  if (!body.ok) return refusal("INVALID_INPUT", pre.correlationId);

  const result = await updateSettings(body.body, {
    organizationId: actor.ctx.orgId,
    actor: { userId: actor.ctx.userId, role: actor.ctx.role },
    correlationId: pre.correlationId,
    idempotencyKey: pre.idempotencyKey,
  });
  return mutationResponse(result, pre.correlationId);
}
