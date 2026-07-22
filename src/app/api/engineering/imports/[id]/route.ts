// PHASE 94B4 — import status read.
//
// Thin by design: authenticate, authorize, validate, delegate, map. Every
// security decision lives in `withOtRoute` and the application services, so a
// route cannot forget a gate or reach the database directly.

import { NextRequest, NextResponse } from "next/server";
import { withOtRoute, privateJson, errorResponse } from "@/lib/ot-edge/http/route-kit";
import { resolveOtServices } from "@/lib/ot-edge/http/composition";
import { toEngineeringImportDto } from "@/lib/ot-edge/dto";
import { svcFail } from "@/lib/ot-edge/services/core";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  return withOtRoute(req, { permission: "view_engineering_project", bucket: "engineering-read" }, async (ctx) => {
    const svc = await resolveOtServices();
    if (!svc) return errorResponse(svcFail("TRANSIENT_FAILURE"));
    const res = await svc.repos.imports.findById(ctx, id);
    if (!res.ok) return errorResponse(svcFail("NOT_FOUND"));
    // The DTO deliberately omits the idempotency key.
    return privateJson({ ok: true, data: toEngineeringImportDto(res.value as never) });
  });
}
