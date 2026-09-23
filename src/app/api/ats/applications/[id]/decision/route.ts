import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAtsActor } from "@/lib/ats/rbac";
import { recordGateDecision } from "@/lib/ats/decision";
import { resolveRequestId } from "@/lib/logger/correlation";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * ATS-S1 — the human decision at PENDING_HUMAN_APPROVAL.
 *
 * This is the ONLY route that moves an application out of the gate, and it
 * moves it only where the decision says: ADVANCE → SCREENING, HOLD → stays,
 * RETURN_FOR_REVIEW → AI_REVIEW_PENDING (next cycle), REJECT → REJECTED.
 *
 * Authorization: an ACTIVE membership of the application's organization
 * holding ATS_REVIEW (OWNER, ADMIN, HR_MANAGER, RECRUITER, HIRING_MANAGER).
 * As a state-changing request it must carry the tenant precondition header
 * (`x-hermes-organization`); a missing header is 428, a mismatch 409.
 *
 * The body is strict: unknown keys are a 400, and `reason` is mandatory —
 * a decision without a written reason is not recorded at all.
 */
const bodySchema = z
  .object({
    decision: z.enum(["ADVANCE", "HOLD", "RETURN_FOR_REVIEW", "REJECT"]),
    reason: z.string().trim().min(3).max(2000),
    aiReviewId: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAtsActor(req, "ATS_REVIEW");
  if (!actor.ok) return actor.response;

  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400, headers: NO_STORE });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid decision" }, { status: 400, headers: NO_STORE });
  }

  const result = await recordGateDecision({
    organizationId: actor.ctx.orgId,
    applicationId: id,
    actor: { userId: actor.ctx.userId, role: actor.ctx.role },
    decision: parsed.data.decision,
    reason: parsed.data.reason,
    aiReviewId: parsed.data.aiReviewId ?? null,
    correlationId: resolveRequestId(req),
  });

  if (!result.ok) {
    switch (result.code) {
      case "NOT_FOUND":
        // The same answer for "does not exist" and "not yours".
        return NextResponse.json({ error: "Application not found" }, { status: 404, headers: NO_STORE });
      case "INVALID_STATE":
        return NextResponse.json({ error: "Application is not awaiting a human decision" }, { status: 422, headers: NO_STORE });
      case "STALE":
        return NextResponse.json({ error: "Application changed; reload and decide again" }, { status: 409, headers: NO_STORE });
      case "INVALID_INPUT":
        return NextResponse.json({ error: "invalid decision" }, { status: 400, headers: NO_STORE });
      case "STORE_UNAVAILABLE":
        return NextResponse.json({ error: "The request could not be completed." }, { status: 503, headers: NO_STORE });
      default:
        return NextResponse.json({ error: "The request could not be completed." }, { status: 500, headers: NO_STORE });
    }
  }

  return NextResponse.json(
    { decisionId: result.decisionId, fromStatus: result.fromStatus, toStatus: result.toStatus, cycle: result.cycle },
    { status: 200, headers: NO_STORE },
  );
}
