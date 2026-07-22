// PHASE 94B4 — OT device profile list + creation.
//
// Thin by design: authenticate, authorize, validate, delegate, map. Every
// security decision lives in `withOtRoute` and the application services, so a
// route cannot forget a gate or reach the database directly.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOtRoute, parseQuery, privateJson, errorResponse } from "@/lib/ot-edge/http/route-kit";
import { resolveOtServices } from "@/lib/ot-edge/http/composition";
import { toOtDeviceProfileDto } from "@/lib/ot-edge/dto";
import { svcFail } from "@/lib/ot-edge/services/core";
import { readJsonBody } from "@/lib/ot-edge/http/body";
import { parseDeviceListFilters } from "@/lib/ot-edge/http/list-filters";

export const dynamic = "force-dynamic";

const CreateDevice = z
  .object({
    assetId: z.string().trim().min(1).max(191),
    category: z.enum(["PLC","HMI","SCADA_SERVER","VFD","MCC","REMOTE_IO","INDUSTRIAL_PC","SAFETY_CONTROLLER","NETWORK_SWITCH","GATEWAY","SENSOR_AGGREGATOR","OTHER"]).optional(),
    lifecycleState: z.enum(["PLANNED","COMMISSIONING","OPERATIONAL","MAINTENANCE","DECOMMISSIONED","UNKNOWN"]).optional(),
    networkZone: z.enum(["ENTERPRISE","DMZ","SUPERVISORY","CONTROL","FIELD","SAFETY","UNKNOWN"]).optional(),
    safetyClass: z.enum(["NON_SAFETY","SAFETY_RELATED","SAFETY_CRITICAL","UNKNOWN"]).optional(),
    productFamily: z.string().trim().max(120).nullable().optional(),
    firmwareVersion: z.string().trim().max(64).nullable().optional(),
    engineeringId: z.string().trim().max(191).nullable().optional(),
  })
  .strict();

export async function GET(req: NextRequest): Promise<NextResponse> {
  return withOtRoute(req, { permission: "view_ot_device", bucket: "ot-read" }, async (ctx) => {
    // PHASE 94B.1 — see the gateway route: validate, then delegate. A
    // supported filter key is honoured or refused, never ignored.
    const url = new URL(req.url);
    const filters = parseDeviceListFilters(url);
    if (!filters.ok) return filters.response;

    const svc = await resolveOtServices();
    if (!svc) return errorResponse(svcFail("TRANSIENT_FAILURE"));
    const res = await svc.repos.devices.listVisible(ctx, parseQuery(url), filters.value);
    if (!res.ok) return errorResponse(svcFail("INTERNAL_FAILURE"));
    return privateJson({
      ok: true,
      data: { items: res.value.items.map((d) => toOtDeviceProfileDto(d as never)), total: res.value.total, take: res.value.take, skip: res.value.skip },
    });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withOtRoute(req, { permission: "manage_ot_device", bucket: "ot-mutate" }, async (ctx) => {
    const body = await readJsonBody(req, CreateDevice);
    if (!body.ok) return body.response;
    const svc = await resolveOtServices();
    if (!svc) return errorResponse(svcFail("TRANSIENT_FAILURE"));
    const res = await svc.repos.devices.createProfile(ctx, body.value);
    if (!res.ok) return errorResponse(svcFail(res.code === "VALIDATION_FAILED" ? "VALIDATION_FAILED" : res.code === "CONFLICT" ? "CONFLICT" : res.code === "FORBIDDEN" ? "FORBIDDEN" : "INTERNAL_FAILURE"));
    return privateJson({ ok: true, data: toOtDeviceProfileDto(res.value as never) }, 201);
  });
}
