import type { NextRequest } from "next/server";
import { requireAtsActor } from "@/lib/ats/rbac";
import { transitionPosition } from "@/lib/ats/positions/service";
import { mutationPreconditions, mutationResponse, readJsonBody, refusal } from "@/lib/ats/positions/http";

/**
 * ATS-M1 — a lifecycle move: PUBLISH | PAUSE | RESUME | CLOSE | REOPEN | ARCHIVE.
 *
 * The route admits ATS_MANAGE; the service then requires the capability of the
 * specific move (REOPEN and ARCHIVE are ATS_ADMIN), the written reason where
 * the move needs one (CLOSE, REOPEN, ARCHIVE), the publish gate for every move
 * that opens a position, and the `expectedVersion`. Closing or archiving never
 * touches an application — no candidate is rejected or advanced by it.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAtsActor(req, "ATS_MANAGE");
  if (!actor.ok) return actor.response;
  const pre = mutationPreconditions(req);
  if (!pre.ok) return pre.response;
  const { id } = await params;

  const body = await readJsonBody(req);
  if (!body.ok) return refusal("INVALID_INPUT", pre.correlationId);

  const result = await transitionPosition(id, body.body, {
    organizationId: actor.ctx.orgId,
    actor: { userId: actor.ctx.userId, role: actor.ctx.role },
    correlationId: pre.correlationId,
    idempotencyKey: pre.idempotencyKey,
  });
  return mutationResponse(result, pre.correlationId);
}
