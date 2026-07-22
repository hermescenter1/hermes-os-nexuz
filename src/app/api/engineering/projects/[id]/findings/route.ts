// PHASE 94B4 — project finding list.
//
// Thin by design: authenticate, authorize, validate, delegate, map. Every
// security decision lives in `withOtRoute` and the application services, so a
// route cannot forget a gate or reach the database directly.

import { NextRequest, NextResponse } from "next/server";
import { withOtRoute, parseQuery, privateJson, errorResponse } from "@/lib/ot-edge/http/route-kit";
import { resolveOtServices } from "@/lib/ot-edge/http/composition";
import { toEngineeringFindingDto } from "@/lib/ot-edge/dto";
import { svcFail } from "@/lib/ot-edge/services/core";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  return withOtRoute(req, { permission: "view_engineering_project", bucket: "engineering-read" }, async (ctx) => {
    const svc = await resolveOtServices();
    if (!svc) return errorResponse(svcFail("TRANSIENT_FAILURE"));
    const res = await svc.repos.findings.listVisible(ctx, id, parseQuery(new URL(req.url)));
    if (!res.ok) return errorResponse(svcFail("INTERNAL_FAILURE"));
    return privateJson({
      ok: true,
      data: { items: res.value.items.map((f) => toEngineeringFindingDto(f as never)), total: res.value.total, take: res.value.take, skip: res.value.skip },
    });
  });
}
