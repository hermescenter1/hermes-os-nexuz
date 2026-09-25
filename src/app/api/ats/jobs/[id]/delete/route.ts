import type { NextRequest } from "next/server";
import { requireAtsActor } from "@/lib/ats/rbac";
import { softDeletePosition } from "@/lib/ats/positions/service";
import { mutationPreconditions, mutationResponse, readJsonBody, refusal } from "@/lib/ats/positions/http";

/**
 * ATS-M1 — the SAFE delete of a position. ATS_ADMIN only.
 *
 * There is no hard delete behind this route, and none anywhere in the ATS
 * service: the position is soft-deleted (deletedAt set, ARCHIVED, private) and
 * every application, candidate, review, interview and audit record stays
 * exactly as it was. The body must carry the written reason and the linked-
 * application count the operator was shown; if the count changed since, the
 * request is refused so the operator confirms against the real number.
 *
 * POST rather than DELETE: the request carries a body (reason, confirmation)
 * and is not a removal of the resource.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAtsActor(req, "ATS_ADMIN");
  if (!actor.ok) return actor.response;
  const pre = mutationPreconditions(req);
  if (!pre.ok) return pre.response;
  const { id } = await params;

  const body = await readJsonBody(req);
  if (!body.ok) return refusal("INVALID_INPUT", pre.correlationId);

  const result = await softDeletePosition(id, body.body, {
    organizationId: actor.ctx.orgId,
    actor: { userId: actor.ctx.userId, role: actor.ctx.role },
    correlationId: pre.correlationId,
    idempotencyKey: pre.idempotencyKey,
  });
  return mutationResponse(result, pre.correlationId);
}
