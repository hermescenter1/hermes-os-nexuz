import { NextResponse }    from "next/server";
import { z }              from "zod";
import { getCurrentUser }  from "@/lib/auth/session";
import { can }             from "@/lib/auth/roles";
import { getDowntime, createDowntime } from "@/lib/cmms/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  assetId:         z.string().optional().nullable(),
  taskId:          z.string().optional().nullable(),
  reason:          z.enum(["PLANNED_MAINTENANCE","BREAKDOWN","SETUP","WAITING_PARTS","WAITING_APPROVAL","EXTERNAL","UNKNOWN"]).optional(),
  startedAt:       z.string(),
  endedAt:         z.string().optional().nullable(),
  durationMinutes: z.number().int().min(0).optional().nullable(),
  description:     z.string().max(1000).optional().nullable(),
  impact:          z.string().max(500).optional().nullable(),
  productionLoss:  z.number().min(0).optional().nullable(),
  currency:        z.string().length(3).optional(),
});

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url     = new URL(req.url);
  const assetId = url.searchParams.get("assetId") ?? undefined;
  const reason  = url.searchParams.get("reason")  ?? undefined;

  const data = await getDowntime(assetId, reason);
  return NextResponse.json(data);
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body   = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const record = await createDowntime({ ...parsed.data, reportedBy: user.id });
  if (!record) return NextResponse.json({ error: "Could not persist — mock mode" }, { status: 202 });
  return NextResponse.json(record, { status: 201 });
}
