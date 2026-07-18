import { NextResponse } from "next/server";
import { z }            from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { can }           from "@/lib/auth/roles";
import { getTasks, createTask } from "@/lib/erp/db";
import { onTaskCreated } from "@/lib/erp/triggers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  title:          z.string().min(1).max(300),
  description:    z.string().max(2000).optional().nullable(),
  priority:       z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]).optional(),
  projectId:      z.string().optional().nullable(),
  teamId:         z.string().optional().nullable(),
  assigneeId:     z.string().optional().nullable(),
  dueDate:        z.string().optional().nullable(),
  estimatedHours: z.number().positive().optional().nullable(),
});

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url       = new URL(req.url);
  const projectId = url.searchParams.get("projectId") ?? undefined;
  const status    = url.searchParams.get("status")    ?? undefined;
  const tasks = await getTasks(projectId, status);
  return NextResponse.json(tasks);
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body   = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const task = await createTask({ ...parsed.data, createdBy: user.id });
  if (task) onTaskCreated(task.id, task.title);
  if (!task) return NextResponse.json({ error: "Could not persist — mock mode" }, { status: 202 });
  return NextResponse.json(task, { status: 201 });
}
