import { NextResponse } from "next/server";
import { z }            from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { can }           from "@/lib/auth/roles";
import { getTaskById, updateTask } from "@/lib/erp/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  title:      z.string().min(1).max(300).optional(),
  status:     z.enum(["TODO","IN_PROGRESS","BLOCKED","REVIEW","DONE","CANCELLED"]).optional(),
  priority:   z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]).optional(),
  assigneeId: z.string().optional().nullable(),
  dueDate:    z.string().optional().nullable(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
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
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const body   = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await updateTask(id, parsed.data);
  if (!updated) return NextResponse.json({ error: "not found or no db" }, { status: 404 });
  return NextResponse.json(updated);
}
