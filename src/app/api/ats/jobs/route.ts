import type { NextRequest } from "next/server";
import { atsCan, requireAtsActor } from "@/lib/ats/rbac";
import { createPosition, listPositions } from "@/lib/ats/positions/service";
import { POSITION_STATUSES } from "@/lib/ats/positions/contract";
import { correlationOf, mutationPreconditions, mutationResponse, readJsonBody, readResponse, refusal } from "@/lib/ats/positions/http";

/**
 * ATS-M1 — the position collection of the caller's organization.
 *
 * PHASE 104-B1 made this a management surface; M1 moves it onto the ATS
 * capability model. It used to be gated by the platform `authoring`
 * capability, which the `engineer` role holds — an engineer could list and
 * create recruitment positions. Now:
 *
 *   GET  — ATS_VIEW. The caller's organization only (from the authenticated
 *          membership, never a parameter), bounded pages, no soft-deleted rows,
 *          and per row the actions THIS actor may attempt.
 *   POST — ATS_MANAGE + an allowed Origin (CSRF) + the tenant precondition
 *          header + an Idempotency-Key. Creates a private DRAFT only; the body
 *          is strict, so `status`, `isPublic`, `publishedAt` or an
 *          `organizationId` are a 400, never applied.
 */
export async function GET(req: NextRequest) {
  const actor = await requireAtsActor(req, "ATS_VIEW");
  if (!actor.ok) return actor.response;
  const correlationId = correlationOf(req);

  const params = new URL(req.url).searchParams;
  const statusParam = params.get("status")?.toUpperCase() ?? undefined;
  if (statusParam && !(POSITION_STATUSES as readonly string[]).includes(statusParam)) {
    return refusal("INVALID_INPUT", correlationId);
  }
  const takeParam = Number(params.get("take") ?? "50");
  const cursor = params.get("cursor") ?? undefined;

  const page = await listPositions(actor.ctx.orgId, actor.ctx.role, {
    status: statusParam,
    take: Number.isFinite(takeParam) ? takeParam : 50,
    cursor: cursor && cursor.length <= 64 ? cursor : undefined,
  });
  if (!page) return refusal("STORE_UNAVAILABLE", correlationId);
  return readResponse(
    {
      positions: page.items,
      nextCursor: page.nextCursor,
      viewer: {
        role: actor.ctx.role,
        canManage: atsCan(actor.ctx.role, "ATS_MANAGE"),
        canAdmin: atsCan(actor.ctx.role, "ATS_ADMIN"),
      },
    },
    correlationId,
  );
}

export async function POST(req: NextRequest) {
  // Authorize BEFORE reading the body (Phase 86C4B2B1D-SECURITY-8 ordering).
  const actor = await requireAtsActor(req, "ATS_MANAGE");
  if (!actor.ok) return actor.response;
  const pre = mutationPreconditions(req);
  if (!pre.ok) return pre.response;

  const body = await readJsonBody(req);
  if (!body.ok) return refusal("INVALID_INPUT", pre.correlationId);

  const result = await createPosition(body.body, {
    organizationId: actor.ctx.orgId,
    actor: { userId: actor.ctx.userId, role: actor.ctx.role },
    correlationId: pre.correlationId,
    idempotencyKey: pre.idempotencyKey,
  });
  // 201 only after the transaction committed; a replay answers 200.
  return mutationResponse(result, pre.correlationId, 201);
}
