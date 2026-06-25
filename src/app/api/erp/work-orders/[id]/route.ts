import { NextResponse } from "next/server";
import { z }            from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { can }           from "@/lib/auth/roles";
import { getWorkOrderById, updateWorkOrder } from "@/lib/erp/db";
import { onWorkOrderCompleted } from "@/lib/erp/triggers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  status:         z.enum(["OPEN","ASSIGNED","IN_PROGRESS","WAITING_APPROVAL","COMPLETED","CANCELLED"]).optional(),
  priority:       z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]).optional(),
  assigneeId:     z.string().optional().nullable(),
  completionNote: z.string().max(2000).optional().nullable(),
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
  const wo     = await getWorkOrderById(id);
  if (!wo) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(wo);
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

  const updated = await updateWorkOrder(id, parsed.data);
  if (!updated) return NextResponse.json({ error: "not found or no db" }, { status: 404 });

  if (parsed.data.status === "COMPLETED") {
    onWorkOrderCompleted(updated.id, updated.title);
  }
  return NextResponse.json(updated);
}
