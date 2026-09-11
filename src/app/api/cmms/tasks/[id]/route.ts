import { NextResponse }        from "next/server";
import { refusalResponse, notFoundResponse, validationResponse } from "@/lib/data-access/route-refusal";
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
  /*
   * One answer for "no such id" and "not yours" — see the PATCH below. A caller
   * must not be able to tell the two apart.
   */
  let task;
  try {
    task = await getTaskById(id);
  } catch (err) {
    return refusalResponse(err);
  }
  if (!task) return notFoundResponse();
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
  if (!parsed.success) return validationResponse(parsed.error);

  /*
   * PHASE 110-A2.0 — `null` now means "no such task, or not this organization's".
   *
   * It used to mean "the layer fell back to a mock", and the route answered 202
   * Accepted. After the repair a cross-tenant PATCH lands here, and answering
   * 202 would tell the caller their write had been accepted when nothing was
   * written. It is a 404, and it is the SAME 404 a genuinely missing id gets:
   * distinguishing them would let a caller probe which task ids exist in
   * another organization.
   */
  let task;
  try {
    task = await updateTask(id, parsed.data);
  } catch (err) {
    return refusalResponse(err);
  }
  if (!task) return notFoundResponse();
  return NextResponse.json(task);
}
