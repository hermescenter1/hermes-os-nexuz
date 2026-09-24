import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAtsActor } from "@/lib/ats/rbac";
import { HUMAN_TRANSITIONS, transitionApplication } from "@/lib/ats/decision";
import { resolveRequestId } from "@/lib/logger/correlation";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * ATS-S1 — a human transition between the ordinary pipeline stages.
 *
 * Previously: a coarse platform-role gate, a non-transactional status write
 * and an optional note. Now: an ACTIVE membership holding ATS_MANAGE, a
 * MANDATORY reason, and one transaction holding the conditional status update,
 * the AtsReviewDecision record, the pipeline event and the audit row.
 *
 * AI_REVIEW_PENDING and PENDING_HUMAN_APPROVAL are not reachable from here:
 * the first belongs to the review worker, the second to POST …/decision.
 * Tenancy: a foreign or unknown application is one 404 (Phase SECURITY-8
 * contract, preserved).
 */
const bodySchema = z
  .object({
    status: z.string().trim().min(1).max(40),
    reason: z.string().trim().min(3).max(2000),
  })
  .strict();

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAtsActor(req, "ATS_MANAGE");
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
    return NextResponse.json({ error: "status and a reason are required" }, { status: 400, headers: NO_STORE });
  }
  const toStatus = parsed.data.status.toUpperCase();
  if (!(toStatus in HUMAN_TRANSITIONS)) {
    return NextResponse.json({ error: `Invalid status: ${parsed.data.status}` }, { status: 400, headers: NO_STORE });
  }

  const result = await transitionApplication({
    organizationId: actor.ctx.orgId,
    applicationId: id,
    actor: { userId: actor.ctx.userId, role: actor.ctx.role },
    toStatus: toStatus as keyof typeof HUMAN_TRANSITIONS,
    reason: parsed.data.reason,
    correlationId: resolveRequestId(req),
  });

  if (!result.ok) {
    switch (result.code) {
      case "NOT_FOUND":
        return NextResponse.json({ error: "Application not found" }, { status: 404, headers: NO_STORE });
      case "INVALID_STATE":
        return NextResponse.json({ error: `Cannot transition to ${toStatus} from the current stage` }, { status: 422, headers: NO_STORE });
      case "STALE":
        return NextResponse.json({ error: "Application changed; reload and try again" }, { status: 409, headers: NO_STORE });
      case "INVALID_INPUT":
        return NextResponse.json({ error: "status and a reason are required" }, { status: 400, headers: NO_STORE });
      case "STORE_UNAVAILABLE":
        return NextResponse.json({ error: "The request could not be completed." }, { status: 503, headers: NO_STORE });
      default:
        return NextResponse.json({ error: "Update failed" }, { status: 500, headers: NO_STORE });
    }
  }

  return NextResponse.json(
    { decisionId: result.decisionId, fromStatus: result.fromStatus, toStatus: result.toStatus },
    { status: 200, headers: NO_STORE },
  );
}
