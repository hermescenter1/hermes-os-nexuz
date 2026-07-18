import { NextResponse } from "next/server";
import { z }            from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { can }           from "@/lib/auth/roles";
import { getWorkOrders, createWorkOrder } from "@/lib/erp/db";
import { onWorkOrderCreated } from "@/lib/erp/triggers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  title:           z.string().min(1).max(300),
  description:     z.string().max(2000).optional().nullable(),
  priority:        z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]).optional(),
  projectId:       z.string().optional().nullable(),
  teamId:          z.string().optional().nullable(),
  dueDate:         z.string().optional().nullable(),
  requiresApproval: z.boolean().optional(),
});

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url       = new URL(req.url);
  const status    = url.searchParams.get("status")    ?? undefined;
  const projectId = url.searchParams.get("projectId") ?? undefined;
  const orders = await getWorkOrders(status, projectId);
  return NextResponse.json(orders);
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body   = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const wo = await createWorkOrder({ ...parsed.data, createdBy: user.id });
  if (wo) onWorkOrderCreated(wo.id, wo.title);
  if (!wo) return NextResponse.json({ error: "Could not persist — mock mode" }, { status: 202 });
  return NextResponse.json(wo, { status: 201 });
}
