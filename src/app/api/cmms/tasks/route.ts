import { NextResponse }    from "next/server";
import { z }              from "zod";
import { getCurrentUser }  from "@/lib/auth/session";
import { can }             from "@/lib/auth/roles";
import { getTasks, createTask } from "@/lib/cmms/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
});

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

  const tasks = await getTasks(status, type, priority, assetId);
  return NextResponse.json(tasks);
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body   = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const task = await createTask({ ...parsed.data, status: "DRAFT", createdBy: user.id });
  if (!task) return NextResponse.json({ error: "Could not persist — mock mode" }, { status: 202 });
  return NextResponse.json(task, { status: 201 });
}
