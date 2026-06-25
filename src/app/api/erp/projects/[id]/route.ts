import { NextResponse } from "next/server";
import { z }            from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { can }           from "@/lib/auth/roles";
import { getProjectById, updateProject } from "@/lib/erp/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  name:        z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  status:      z.enum(["PLANNED","ACTIVE","ON_HOLD","COMPLETED","CANCELLED"]).optional(),
  endDate:     z.string().optional().nullable(),
  budget:      z.number().positive().optional().nullable(),
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
  const proj   = await getProjectById(id);
  if (!proj) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(proj);
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

  const updated = await updateProject(id, parsed.data);
  if (!updated) return NextResponse.json({ error: "not found or no db" }, { status: 404 });
  return NextResponse.json(updated);
}
