import { NextResponse } from "next/server";
import { z }            from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { can }           from "@/lib/auth/roles";
import { getTemplateById, createWorkflow } from "@/lib/automation/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  name:        z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const template = await getTemplateById(id);
  if (!template) return NextResponse.json({ error: "template not found" }, { status: 404 });

  const body   = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const wf = await createWorkflow({
    name:        parsed.data.name ?? `${template.name} (copy)`,
    description: parsed.data.description ?? template.description,
    triggerType: template.triggerType,
    templateId:  id,
    createdBy:   user.id,
  });
  if (!wf) return NextResponse.json({ error: "Could not persist — mock mode" }, { status: 202 });
  return NextResponse.json(wf, { status: 201 });
}
