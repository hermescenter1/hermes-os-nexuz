// PHASE 94B4 — single gateway read + update.
//
// Thin by design: authenticate, authorize, validate, delegate, map. Every
// security decision lives in `withOtRoute` and the application services, so a
// route cannot forget a gate or reach the database directly.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOtRoute, privateJson, errorResponse } from "@/lib/ot-edge/http/route-kit";
import { resolveOtServices } from "@/lib/ot-edge/http/composition";
import { toGatewayProfileDto } from "@/lib/ot-edge/dto";
import { svcFail } from "@/lib/ot-edge/services/core";
import { readJsonBody } from "@/lib/ot-edge/http/body";

export const dynamic = "force-dynamic";

const UpdateGateway = z
  .object({
    environment: z.enum(["PRODUCTION", "STAGING", "LAB", "SIMULATION"]).optional(),
    capabilities: z.array(z.string().trim().max(64)).max(16).optional(),
    softwareVersion: z.string().trim().max(64).nullable().optional(),
    readOnlyMode: z.boolean().optional(),
    simulatorMode: z.boolean().optional(),
    signingKeyRef: z.string().trim().max(191).nullable().optional(),
    lifecycle: z.enum(["REGISTERED", "ACTIVE", "STALE", "DISABLED", "REVOKED", "SIMULATOR"]).optional(),
  })
  .strict();

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  return withOtRoute(req, { permission: "view_ot_gateway", bucket: "ot-read" }, async (ctx) => {
    const svc = await resolveOtServices();
    if (!svc) return errorResponse(svcFail("TRANSIENT_FAILURE"));
    const res = await svc.repos.gateways.findVisibleById(ctx, id);
    // A foreign gateway and a missing one answer identically.
    if (!res.ok) return errorResponse(svcFail("NOT_FOUND"));
    return privateJson({ ok: true, data: toGatewayProfileDto(res.value as never) });
  });
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  return withOtRoute(req, { permission: "manage_ot_gateway", bucket: "ot-mutate" }, async (ctx) => {
    const body = await readJsonBody(req, UpdateGateway);
    if (!body.ok) return body.response;
    const svc = await resolveOtServices();
    if (!svc) return errorResponse(svcFail("TRANSIENT_FAILURE"));

    const { lifecycle, ...profile } = body.value;
    if (Object.keys(profile).length > 0) {
      const updated = await svc.repos.gateways.updateProfile(ctx, id, profile);
      if (!updated.ok) return errorResponse(svcFail(updated.code === "NOT_FOUND" ? "NOT_FOUND" : "INTERNAL_FAILURE"));
    }
    if (lifecycle) {
      const moved = await svc.repos.gateways.updateLifecycle(ctx, id, lifecycle);
      if (!moved.ok) return errorResponse(svcFail(moved.code === "NOT_FOUND" ? "NOT_FOUND" : "INTERNAL_FAILURE"));
      return privateJson({ ok: true, data: toGatewayProfileDto(moved.value as never) });
    }
    const current = await svc.repos.gateways.findVisibleById(ctx, id);
    if (!current.ok) return errorResponse(svcFail("NOT_FOUND"));
    return privateJson({ ok: true, data: toGatewayProfileDto(current.value as never) });
  });
}
