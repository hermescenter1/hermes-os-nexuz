import { NextResponse }    from "next/server";
import { readOrRefuse, refusalResponse, validationResponse } from "@/lib/data-access/route-refusal";
import { z }              from "zod";
import { getCurrentUser }  from "@/lib/auth/session";
import { can }             from "@/lib/auth/roles";
import { getTasks, createTask } from "@/lib/cmms/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * `.strict()` — PHASE 110-A2.0.
 *
 * Without it Zod STRIPS unknown keys silently. A caller that sent
 * `organizationId` to choose the tenant got 201 and a task created in a
 * different organization than the one they named — measured in the A2.0
 * rehearsal, `http-scenarios-run2.log`. Nothing leaked, because the server
 * decides the tenant regardless; what was wrong is that the request was
 * quietly not honoured and the answer said success.
 *
 * An unknown key is now a 400 naming the key. The data layer refuses the
 * same fields as well: two independent boundaries, because this schema
 * protects one route and the layer protects every caller.
 */
const CreateSchema = z.object({
  title:           z.string().min(1).max(300),
  description:     z.string().max(2000).optional().nullable(),
  assetId:         z.string().optional().nullable(),
  planId:          z.string().optional().nullable(),
  workCenterId:    z.string().optional().nullable(),
  workOrderType:   z.enum(["PLANNED","UNPLANNED","EMERGENCY","PROJECT"]).optional(),
  maintenanceType: z.enum(["PREVENTIVE","PREDICTIVE","CORRECTIVE","EMERGENCY","SHUTDOWN","INSPECTION","LUBRICATION","CALIBRATION"]).optional(),
  priority:        z.enum(["LOW","MEDIUM","HIGH","CRITICAL","EMERGENCY"]).optional(),
  scheduledDate:   z.string().optional().nullable(),
  dueDate:         z.string().optional().nullable(),
  estimatedHours:  z.number().positive().optional().nullable(),
  technicianId:    z.string().optional().nullable(),
  teamId:          z.string().optional().nullable(),
  requiresApproval:z.boolean().optional(),
}).strict();

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url      = new URL(req.url);
  const status   = url.searchParams.get("status")   ?? undefined;
  const type     = url.searchParams.get("type")     ?? undefined;
  const priority = url.searchParams.get("priority") ?? undefined;
  const assetId  = url.searchParams.get("assetId")  ?? undefined;

  // The refusal mapping is shared — see `readOrRefuse`.
  return readOrRefuse(() => getTasks(status, type, priority, assetId));
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body   = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return validationResponse(parsed.error);

  /*
   * PHASE 110-A2.0 — the layer throws now; it cannot answer with a mock.
   *
   * What was here returned 202 Accepted with "mock mode" when the create
   * came back null. The layer can no longer return null — it produces a row
   * or raises — and 202 would have told a caller whose write was REFUSED
   * that it had been accepted. `refusalResponse` maps the refusal to the
   * status the platform routes already use for the same condition, and
   * rethrows anything it does not recognise.
   */
  let task;
  try {
    task = await createTask({ ...parsed.data, status: "DRAFT", createdBy: user.id });
  } catch (err) {
    return refusalResponse(err);
  }
  return NextResponse.json(task, { status: 201 });
}
