// PHASE 94B4 — gateway registry list + registration.
//
// Thin by design: authenticate, authorize, validate, delegate, map. Every
// security decision lives in `withOtRoute` and the application services, so a
// route cannot forget a gate or reach the database directly.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOtRoute, parseQuery, resultResponse, privateJson, errorResponse } from "@/lib/ot-edge/http/route-kit";
import { resolveOtServices } from "@/lib/ot-edge/http/composition";
import { toGatewayProfileDto } from "@/lib/ot-edge/dto";
import { svcFail } from "@/lib/ot-edge/services/core";
import { readJsonBody } from "@/lib/ot-edge/http/body";
import { parseGatewayListFilters } from "@/lib/ot-edge/http/list-filters";

export const dynamic = "force-dynamic";

/** No organizationId: the tenant comes from the authenticated actor. */
const CreateGateway = z
  .object({
    gatewayId: z.string().trim().min(1).max(191),
    environment: z.enum(["PRODUCTION", "STAGING", "LAB", "SIMULATION"]).optional(),
    capabilities: z.array(z.string().trim().max(64)).max(16).optional(),
    softwareVersion: z.string().trim().max(64).nullable().optional(),
    readOnlyMode: z.boolean().optional(),
    simulatorMode: z.boolean().optional(),
    signingKeyRef: z.string().trim().max(191).nullable().optional(),
  })
  .strict();

export async function GET(req: NextRequest): Promise<NextResponse> {
  return withOtRoute(req, { permission: "view_ot_gateway", bucket: "ot-read" }, async (ctx) => {
    // PHASE 94B.1 — filters are validated before any repository call, so an
    // unaccepted value never reaches a query. (The authorization chain above
    // has already run, by design — this is not a pre-auth fast path.) A
    // supported key is never silently ignored: it is honoured or refused.
    const url = new URL(req.url);
    const filters = parseGatewayListFilters(url);
    if (!filters.ok) return filters.response;

    const svc = await resolveOtServices();
    if (!svc) return errorResponse(svcFail("TRANSIENT_FAILURE"));
    const page = parseQuery(url);
    // Filtering happens inside the tenant-scoped query, before pagination —
    // the route never receives a wider page and narrows it afterwards.
    const res = await svc.repos.gateways.listVisible(ctx, page, filters.value);
    if (!res.ok) return errorResponse(svcFail(res.code === "NOT_FOUND" ? "NOT_FOUND" : "INTERNAL_FAILURE"));
    return privateJson({
      ok: true,
      data: { items: res.value.items.map((g) => toGatewayProfileDto(g as never)), total: res.value.total, take: res.value.take, skip: res.value.skip },
    });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withOtRoute(req, { permission: "manage_ot_gateway", bucket: "ot-mutate" }, async (ctx) => {
    const body = await readJsonBody(req, CreateGateway);
    if (!body.ok) return body.response;
    const svc = await resolveOtServices();
    if (!svc) return errorResponse(svcFail("TRANSIENT_FAILURE"));
    const res = await svc.repos.gateways.createProfile(ctx, body.value);
    if (!res.ok) return errorResponse(svcFail(res.code === "VALIDATION_FAILED" ? "VALIDATION_FAILED" : res.code === "CONFLICT" ? "CONFLICT" : res.code === "FORBIDDEN" ? "FORBIDDEN" : "INTERNAL_FAILURE"));
    return privateJson({ ok: true, data: toGatewayProfileDto(res.value as never) }, 201);
  });
}
