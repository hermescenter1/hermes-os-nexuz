import { NextResponse }        from "next/server";
import { z }                  from "zod";
import { getCurrentUser }      from "@/lib/auth/session";
import { can }                 from "@/lib/auth/roles";
import { getTaskById, updateTask } from "@/lib/cmms/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  title:          z.string().min(1).max(300).optional(),
  description:    z.string().max(2000).optional().nullable(),
  status:         z.enum(["DRAFT","PLANNED","SCHEDULED","IN_PROGRESS","ON_HOLD","COMPLETED","CANCELLED","OVERDUE"]).optional(),
  priority:       z.enum(["LOW","MEDIUM","HIGH","CRITICAL","EMERGENCY"]).optional(),
  technicianId:   z.string().optional().nullable(),
  teamId:         z.string().optional().nullable(),
  scheduledDate:  z.string().optional().nullable(),
  dueDate:        z.string().optional().nullable(),
  startedAt:      z.string().optional().nullable(),
  completedAt:    z.string().optional().nullable(),
  actualHours:    z.number().positive().optional().nullable(),
  approvalStatus: z.enum(["PENDING","APPROVED","REJECTED","CANCELLED"]).optional().nullable(),
}).strict();

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const task   = await getTaskById(id);
  if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(task);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const body   = await req.json().catch(() => ({}));
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const task = await updateTask(id, parsed.data);
  if (!task) return NextResponse.json({ error: "Could not update — mock mode" }, { status: 202 });
  return NextResponse.json(task);
}
