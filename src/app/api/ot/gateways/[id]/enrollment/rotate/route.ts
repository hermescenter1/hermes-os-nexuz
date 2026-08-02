// PHASE 94 — gateway machine-credential rotation.
//
// Issues a replacement credential without invalidating the working one until the
// swap commits: the service creates the new secret, compare-and-swaps the stored
// reference in one database write, then deletes the old secret best-effort. A
// failed create or commit leaves the current credential intact. The response is
// the ONLY place the new plaintext credential appears; it is `no-store`.

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
    const result = await svc.enrollment.rotate(ctx, id);
    return resultResponse(result);
  });
}
