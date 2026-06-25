import { NextResponse } from "next/server";
import { z }            from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { can }           from "@/lib/auth/roles";
import { getWorkflows, createWorkflow } from "@/lib/automation/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name:           z.string().min(1).max(120),
  description:    z.string().max(500).optional().nullable(),
  triggerType:    z.string().min(1),
  organizationId: z.string().optional().nullable(),
  templateId:     z.string().optional().nullable(),
});

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url    = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const workflows = await getWorkflows(status);
  return NextResponse.json(workflows);
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const wf = await createWorkflow({ ...parsed.data, createdBy: user.id });
  if (!wf) return NextResponse.json({ error: "Could not persist workflow — falling back to mock mode" }, { status: 202 });
  return NextResponse.json(wf, { status: 201 });
}
