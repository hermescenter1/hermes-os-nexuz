import { NextResponse }   from "next/server";
import { z }             from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { can }           from "@/lib/auth/roles";
import { getPlans, createPlan } from "@/lib/cmms/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name:            z.string().min(1).max(200),
  description:     z.string().max(1000).optional().nullable(),
  assetId:         z.string().optional().nullable(),
  workCenterId:    z.string().optional().nullable(),
  maintenanceType: z.enum(["PREVENTIVE","PREDICTIVE","CORRECTIVE","EMERGENCY","SHUTDOWN","INSPECTION","LUBRICATION","CALIBRATION"]).optional(),
  priority:        z.enum(["LOW","MEDIUM","HIGH","CRITICAL","EMERGENCY"]).optional(),
  frequencyDays:   z.number().int().positive().optional(),
  estimatedHours:  z.number().positive().optional(),
  leadTimeDays:    z.number().int().min(0).optional(),
  nextDueAt:       z.string().optional().nullable(),
});

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url    = new URL(req.url);
  const type   = url.searchParams.get("type")   ?? undefined;
  const active = url.searchParams.get("active");

  const plans = await getPlans(type, active === null ? undefined : active === "true");
  return NextResponse.json(plans);
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body   = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const plan = await createPlan({ ...parsed.data, createdBy: user.id });
  if (!plan) return NextResponse.json({ error: "Could not persist — mock mode" }, { status: 202 });
  return NextResponse.json(plan, { status: 201 });
}
