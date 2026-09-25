import type { NextRequest } from "next/server";
import { requireAtsActor } from "@/lib/ats/rbac";
import { createInitialDrafts, INITIAL_POSITIONS } from "@/lib/ats/positions/service";
import { correlationOf, mutationPreconditions, mutationResponse, readJsonBody, readResponse, refusal } from "@/lib/ats/positions/http";

/**
 * ATS-M1 — the admin workflow that creates the five initial positions as
 * private DRAFTs (ATS_ADMIN, reason required, idempotent twice over: the
 * request key, and a stable requisition key per position so a second run
 * skips what exists). Nothing is published; the publish gate refuses each one
 * until its hiring owner, location and public description are completed.
 *
 *   GET  — the catalogue of what WOULD be created (titles and role codes only).
 *   POST — create the missing ones.
 */
export async function GET(req: NextRequest) {
  const actor = await requireAtsActor(req, "ATS_ADMIN");
  if (!actor.ok) return actor.response;
  return readResponse(
    { positions: INITIAL_POSITIONS.map((p) => ({ roleCode: p.roleCode, requisitionKey: p.requisitionKey, title: p.title })) },
    correlationOf(req),
  );
}

export async function POST(req: NextRequest) {
  const actor = await requireAtsActor(req, "ATS_ADMIN");
  if (!actor.ok) return actor.response;
  const pre = mutationPreconditions(req);
  if (!pre.ok) return pre.response;

  const body = await readJsonBody(req);
  if (!body.ok) return refusal("INVALID_INPUT", pre.correlationId);

  const result = await createInitialDrafts(body.body, {
    organizationId: actor.ctx.orgId,
    actor: { userId: actor.ctx.userId, role: actor.ctx.role },
    correlationId: pre.correlationId,
    idempotencyKey: pre.idempotencyKey,
  });
  return mutationResponse(result, pre.correlationId, 201);
}
