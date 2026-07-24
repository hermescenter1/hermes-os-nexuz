// PHASE 94B4 — single OT device read + update.
//
// Thin by design: authenticate, authorize, validate, delegate, map. Every
// security decision lives in `withOtRoute` and the application services, so a
// route cannot forget a gate or reach the database directly.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOtRoute, privateJson, errorResponse } from "@/lib/ot-edge/http/route-kit";
import { resolveOtServices } from "@/lib/ot-edge/http/composition";
import { toOtDeviceProfileDto } from "@/lib/ot-edge/dto";
import { svcFail } from "@/lib/ot-edge/services/core";
import { readJsonBody } from "@/lib/ot-edge/http/body";

export const dynamic = "force-dynamic";

const UpdateDevice = z
  .object({
    category: z.enum(["PLC","HMI","SCADA_SERVER","VFD","MCC","REMOTE_IO","INDUSTRIAL_PC","SAFETY_CONTROLLER","NETWORK_SWITCH","GATEWAY","SENSOR_AGGREGATOR","OTHER"]).optional(),
    lifecycleState: z.enum(["PLANNED","COMMISSIONING","OPERATIONAL","MAINTENANCE","DECOMMISSIONED","UNKNOWN"]).optional(),
    networkZone: z.enum(["ENTERPRISE","DMZ","SUPERVISORY","CONTROL","FIELD","SAFETY","UNKNOWN"]).optional(),
    safetyClass: z.enum(["NON_SAFETY","SAFETY_RELATED","SAFETY_CRITICAL","UNKNOWN"]).optional(),
    productFamily: z.string().trim().max(120).nullable().optional(),
    firmwareVersion: z.string().trim().max(64).nullable().optional(),
    engineeringId: z.string().trim().max(191).nullable().optional(),
  })
  .strict();

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  return withOtRoute(req, { permission: "view_ot_device", bucket: "ot-read" }, async (ctx) => {
    const svc = await resolveOtServices();
    if (!svc) return errorResponse(svcFail("TRANSIENT_FAILURE"));
    const res = await svc.repos.devices.findVisibleById(ctx, id);
    if (!res.ok) return errorResponse(svcFail("NOT_FOUND"));
    return privateJson({ ok: true, data: toOtDeviceProfileDto(res.value as never) });
  });
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  return withOtRoute(req, { permission: "manage_ot_device", bucket: "ot-mutate" }, async (ctx) => {
    const body = await readJsonBody(req, UpdateDevice);
    if (!body.ok) return body.response;
    const svc = await resolveOtServices();
    if (!svc) return errorResponse(svcFail("TRANSIENT_FAILURE"));
    const res = await svc.repos.devices.updateProfile(ctx, id, body.value);
    if (!res.ok) return errorResponse(svcFail(res.code === "NOT_FOUND" ? "NOT_FOUND" : "INTERNAL_FAILURE"));
    return privateJson({ ok: true, data: toOtDeviceProfileDto(res.value as never) });
  });
}
