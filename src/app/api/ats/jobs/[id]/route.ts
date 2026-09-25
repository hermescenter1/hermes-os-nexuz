import type { NextRequest } from "next/server";
import { requireAtsActor } from "@/lib/ats/rbac";
import { getPositionDetail, updatePosition } from "@/lib/ats/positions/service";
import { correlationOf, mutationPreconditions, mutationResponse, readJsonBody, readResponse, refusal } from "@/lib/ats/positions/http";

/**
 * ATS-M1 — one position of the caller's organization.
 *
 *   GET   — ATS_VIEW. Full management view: every field, the three locales,
 *           the criteria, the publish-readiness checklist, the linked record
 *           counts and the actions this actor may attempt. A position of
 *           another organization is the same 404 as one that does not exist.
 *   PATCH — ATS_MANAGE + Origin + tenant precondition + Idempotency-Key, and
 *           the `expectedVersion` the editor loaded (a stale edit is a 409).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAtsActor(req, "ATS_VIEW");
  if (!actor.ok) return actor.response;
  const correlationId = correlationOf(req);
  const { id } = await params;

  const detail = await getPositionDetail(actor.ctx.orgId, actor.ctx.role, id);
  if (detail === null) return refusal("STORE_UNAVAILABLE", correlationId);
  if (detail === "NOT_FOUND") return refusal("NOT_FOUND", correlationId);
  return readResponse({ position: detail }, correlationId);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAtsActor(req, "ATS_MANAGE");
  if (!actor.ok) return actor.response;
  const pre = mutationPreconditions(req);
  if (!pre.ok) return pre.response;
  const { id } = await params;

  const body = await readJsonBody(req);
  if (!body.ok) return refusal("INVALID_INPUT", pre.correlationId);

  const result = await updatePosition(id, body.body, {
    organizationId: actor.ctx.orgId,
    actor: { userId: actor.ctx.userId, role: actor.ctx.role },
    correlationId: pre.correlationId,
    idempotencyKey: pre.idempotencyKey,
  });
  return mutationResponse(result, pre.correlationId);
}
