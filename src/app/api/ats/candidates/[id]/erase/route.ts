import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAtsActor } from "@/lib/ats/rbac";
import { mutationPreconditions, readJsonBody, refusal } from "@/lib/ats/positions/http";
import { REQUEST_ID_HEADER } from "@/lib/logger/correlation";
import { eraseCandidate, type EraseCandidateCode } from "@/lib/ats/candidate-erasure";

/**
 * ATS go-live — audited candidate erasure. ATS_ADMIN only.
 *
 * Behind the usual ATS write chain (tenant actor, trusted Origin, idempotency
 * key), the operator must send the written reason and type the exact
 * confirmation phrase. The work runs in `eraseCandidate`, which anonymises this
 * organization's applications and clears the candidate's identifying fields in
 * one transaction. There is no hard delete.
 *
 * POST (not DELETE): the request carries a body and does not remove a resource
 * from the URL space; the candidate row survives, erased.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

/** The exact phrase the operator types to confirm — never translated. */
const CONFIRMATION = "ERASE CANDIDATE";

const bodySchema = z
  .object({
    reason: z.string().trim().min(5).max(500),
    confirmation: z.literal(CONFIRMATION),
  })
  .strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAtsActor(req, "ATS_ADMIN");
  if (!actor.ok) return actor.response;

  const pre = mutationPreconditions(req);
  if (!pre.ok) return pre.response;

  const { id } = await params;
  const raw = await readJsonBody(req);
  if (!raw.ok) return refusal("INVALID_INPUT", pre.correlationId);
  const parsed = bodySchema.safeParse(raw.body);
  if (!parsed.success) return refusal("INVALID_INPUT", pre.correlationId);

  const result = await eraseCandidate({
    organizationId: actor.ctx.orgId,
    candidateId: id,
    actorUserId: actor.ctx.userId,
    reason: parsed.data.reason,
    correlationId: pre.correlationId,
  });

  if (result.ok) {
    return NextResponse.json(
      { erased: true, code: result.code, applicationsAnonymised: result.applicationsAnonymised, correlationId: pre.correlationId },
      { status: 200, headers: { ...NO_STORE, [REQUEST_ID_HEADER]: pre.correlationId } },
    );
  }

  // Map the service refusals. A candidate not reachable from this organization
  // is an indistinguishable 404; the other refusals are operator-facing but
  // never reveal another organization's data.
  const STATUS: Record<Exclude<EraseCandidateCode, "ERASED" | "ALREADY_ERASED">, number> = {
    NOT_FOUND: 404,
    CROSS_ORG: 409,
    LEGAL_HOLD: 409,
    MEMBERSHIP_LOST: 403,
    STORE_UNAVAILABLE: 503,
  };
  const MESSAGE: Record<Exclude<EraseCandidateCode, "ERASED" | "ALREADY_ERASED">, string> = {
    NOT_FOUND: "Not found.",
    CROSS_ORG: "This candidate cannot be erased from here.",
    LEGAL_HOLD: "This candidate's data is under a legal hold and cannot be erased.",
    MEMBERSHIP_LOST: "You do not have permission for this action.",
    STORE_UNAVAILABLE: "The request could not be completed. Please try again.",
  };
  const code = result.code as Exclude<EraseCandidateCode, "ERASED" | "ALREADY_ERASED">;
  return NextResponse.json(
    { error: MESSAGE[code], code, correlationId: pre.correlationId },
    { status: STATUS[code], headers: { ...NO_STORE, [REQUEST_ID_HEADER]: pre.correlationId } },
  );
}
