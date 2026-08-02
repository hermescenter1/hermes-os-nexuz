// PHASE 94 — gateway machine-credential revocation.
//
// Fail-closed and always available: the service marks the profile REVOKED in the
// database first, which blocks every envelope on its own, so an operator can
// revoke even when the writable secret backend is down. The store revocation is
// defence-in-depth (best-effort). Idempotent. The response carries no secret.

import { NextRequest, NextResponse } from "next/server";
import { withOtRoute, resultResponse, errorResponse } from "@/lib/ot-edge/http/route-kit";
import { resolveOtServices } from "@/lib/ot-edge/http/composition";
import { svcFail } from "@/lib/ot-edge/services/core";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  return withOtRoute(req, { permission: "manage_ot_gateway", bucket: "ot-mutate" }, async (ctx) => {
    const svc = await resolveOtServices();
    if (!svc) return errorResponse(svcFail("TRANSIENT_FAILURE"));
    const result = await svc.enrollment.revoke(ctx, id);
    return resultResponse(result);
  });
}
