// PHASE 94 — gateway machine-credential enrollment: issue + delete.
//
// Thin by design: authenticate, authorize, delegate, map. Every security
// decision lives in `withOtRoute` (auth → active membership → manage_ot_gateway
// → rate limit → site scope) and in the enrollment service (atomic issuance,
// compensation, fail-closed backend, tenant/site-scoped persistence). The route
// never reads a tenant, actor or reference from the request.
//
// POST   issues a NEW credential. The response is the ONLY place the plaintext
//        credential and its reference appear; it is `no-store` and never
//        retrievable again.
// DELETE removes the enrollment (secret + reference). Idempotent.

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
    const result = await svc.enrollment.enroll(ctx, id);
    // 201: a new credential resource was created. The body carries the one-time
    // secret; `resultResponse` marks it `no-store`.
    return resultResponse(result, 201);
  });
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  return withOtRoute(req, { permission: "manage_ot_gateway", bucket: "ot-mutate" }, async (ctx) => {
    const svc = await resolveOtServices();
    if (!svc) return errorResponse(svcFail("TRANSIENT_FAILURE"));
    const result = await svc.enrollment.remove(ctx, id);
    return resultResponse(result);
  });
}
