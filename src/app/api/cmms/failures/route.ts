import { NextResponse }    from "next/server";
import { z }              from "zod";
import { getCurrentUser }  from "@/lib/auth/session";
import { can }             from "@/lib/auth/roles";
import { getFailures, createFailure } from "@/lib/cmms/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  title:           z.string().min(1).max(300),
  description:     z.string().min(1),
  assetId:         z.string().optional().nullable(),
  taskId:          z.string().optional().nullable(),
  failureCodeId:   z.string().optional().nullable(),
  severity:        z.enum(["MINOR","MODERATE","MAJOR","CRITICAL"]).optional(),
  category:        z.enum(["MECHANICAL","ELECTRICAL","INSTRUMENTATION","SOFTWARE","HYDRAULIC","PNEUMATIC","STRUCTURAL","OPERATIONAL"]).optional(),
  occurredAt:      z.string(),
  detectedAt:      z.string().optional().nullable(),
  downtimeMinutes: z.number().int().min(0).optional().nullable(),
});

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url      = new URL(req.url);
  const severity = url.searchParams.get("severity") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;

  const data = await getFailures(severity, category);
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

  const failure = await createFailure({ ...parsed.data, reportedBy: user.id });
  if (!failure) return NextResponse.json({ error: "Could not persist — mock mode" }, { status: 202 });
  return NextResponse.json(failure, { status: 201 });
}
