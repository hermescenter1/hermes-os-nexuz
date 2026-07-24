// PHASE 94B4 — finding workflow transition.
//
// Thin by design: authenticate, authorize, validate, delegate, map. Every
// security decision lives in `withOtRoute` and the application services, so a
// route cannot forget a gate or reach the database directly.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOtRoute, resultResponse, errorResponse } from "@/lib/ot-edge/http/route-kit";
import { resolveOtServices } from "@/lib/ot-edge/http/composition";
import { svcFail } from "@/lib/ot-edge/services/core";
import { readJsonBody } from "@/lib/ot-edge/http/body";
import { FINDING_STATES, MAX_REVIEW_NOTE } from "@/lib/ot-edge/finding-workflow";

export const dynamic = "force-dynamic";

/** Only the workflow state and a bounded note may be sent. */
const Transition = z
  .object({
    state: z.enum(FINDING_STATES),
    reviewNote: z.string().max(MAX_REVIEW_NOTE).nullable().optional(),
  })
  .strict();

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  return withOtRoute(req, { permission: "review_engineering_finding", bucket: "engineering-review" }, async (ctx) => {
    const body = await readJsonBody(req, Transition);
    if (!body.ok) return body.response;
    const svc = await resolveOtServices();
    if (!svc) return errorResponse(svcFail("TRANSIENT_FAILURE"));
    return resultResponse(
      await svc.findings.transitionFinding(ctx, id, body.value.state, body.value.reviewNote ?? null),
    );
  });
}
