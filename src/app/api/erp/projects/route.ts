import { NextResponse } from "next/server";
import { z }            from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { can }           from "@/lib/auth/roles";
import { getProjects, createProject } from "@/lib/erp/db";
import { onProjectCreated } from "@/lib/erp/triggers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name:          z.string().min(1).max(200),
  description:   z.string().max(1000).optional().nullable(),
  status:        z.enum(["PLANNED","ACTIVE","ON_HOLD","COMPLETED","CANCELLED"]).optional(),
  startDate:     z.string().optional().nullable(),
  endDate:       z.string().optional().nullable(),
  budget:        z.number().positive().optional().nullable(),
  crmAccountId:  z.string().optional().nullable(),
  managerId:     z.string().optional().nullable(),
});

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url    = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const projects = await getProjects(status);
  return NextResponse.json(projects);
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body   = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const project = await createProject({ ...parsed.data, createdBy: user.id });
  if (project) onProjectCreated(project.id, project.name);
  if (!project) return NextResponse.json({ error: "Could not persist — mock mode" }, { status: 202 });
  return NextResponse.json(project, { status: 201 });
}
