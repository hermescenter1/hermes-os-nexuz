import { NextResponse } from "next/server";
import { z }            from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { can }           from "@/lib/auth/roles";
import { getWorkflowById, updateWorkflow, deleteWorkflow } from "@/lib/automation/db";
import { TRIGGER_TYPES, ConditionsArraySchema, ActionsArraySchema } from "@/lib/automation/validation";
import { workflowWriteErrorResponse } from "@/lib/automation/write-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PAGE 08 — strict, and it now carries triggerType plus both child
 * collections.
 *
 * Previously this schema listed only name/description/status, and zod's
 * default strip meant a builder that sent a changed trigger, edited conditions
 * or reordered actions got 200 OK with none of it written. An omitted
 * collection still means "leave it alone"; a present one replaces what is
 * stored, so removals actually take effect.
 */
const PatchSchema = z.object({
  name:        z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  status:      z.enum(["DRAFT","ACTIVE","PAUSED","ARCHIVED"]).optional(),
  triggerType: z.enum(TRIGGER_TYPES).optional(),
  conditions:  ConditionsArraySchema.optional(),
  actions:     ActionsArraySchema.optional(),
}).strict();

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const wf = await getWorkflowById(id);
  if (!wf) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(wf);
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

  const result = await updateWorkflow(id, parsed.data);
  if (!result.ok) {
    const { body, status } = workflowWriteErrorResponse(result.reason);
    return NextResponse.json(body, { status });
  }
  return NextResponse.json(result.workflow);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const ok = await deleteWorkflow(id);
  if (!ok) return NextResponse.json({ error: "not found or no db" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
