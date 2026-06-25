import { NextResponse } from "next/server";
import { z }            from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { can }           from "@/lib/auth/roles";
import { getResources, createResource } from "@/lib/erp/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name:        z.string().min(1).max(200),
  type:        z.enum(["HUMAN","EQUIPMENT","SOFTWARE","VEHICLE","FACILITY","TOOL"]),
  description: z.string().max(500).optional().nullable(),
  costRate:    z.number().positive().optional().nullable(),
  projectId:   z.string().optional().nullable(),
});

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url  = new URL(req.url);
  const type = url.searchParams.get("type") ?? undefined;
  const resources = await getResources(type);
  return NextResponse.json(resources);
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body   = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const resource = await createResource(parsed.data);
  if (!resource) return NextResponse.json({ error: "Could not persist — mock mode" }, { status: 202 });
  return NextResponse.json(resource, { status: 201 });
}
