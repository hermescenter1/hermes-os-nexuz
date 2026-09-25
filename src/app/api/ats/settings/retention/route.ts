import type { NextRequest } from "next/server";
import { requireAtsActor } from "@/lib/ats/rbac";
import { updateRetention } from "@/lib/ats/settings/service";
import { mutationPreconditions, mutationResponse, readJsonBody, refusal } from "@/lib/ats/positions/http";

/**
 * ATS-M1 — select, create or edit the organization's RECRUITMENT_CANDIDATE
 * retention policy. ATS_ADMIN only, reason required.
 *
 * The action is ALWAYS ANONYMISE — the body has no field for it. Execution
 * stays governed by the Phase 97 compliance registry (a policy created here is
 * dry-run until cleared there) and by legal holds; intake refuses until the
 * selected policy is APPROVED, enabled and effective.
 */
export async function PUT(req: NextRequest) {
  const actor = await requireAtsActor(req, "ATS_ADMIN");
  if (!actor.ok) return actor.response;
  const pre = mutationPreconditions(req);
  if (!pre.ok) return pre.response;

  const body = await readJsonBody(req);
  if (!body.ok) return refusal("INVALID_INPUT", pre.correlationId);

  const result = await updateRetention(body.body, {
    organizationId: actor.ctx.orgId,
    actor: { userId: actor.ctx.userId, role: actor.ctx.role },
    correlationId: pre.correlationId,
    idempotencyKey: pre.idempotencyKey,
  });
  return mutationResponse(result, pre.correlationId);
}
