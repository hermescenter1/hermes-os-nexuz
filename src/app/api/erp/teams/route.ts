import { NextResponse } from "next/server";
import { z }            from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { can }           from "@/lib/auth/roles";
import { getTeams, createTeam } from "@/lib/erp/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name:        z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  leadId:      z.string().optional().nullable(),
  capacity:    z.number().int().min(0).optional(),
});

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const teams = await getTeams();
  return NextResponse.json(teams);
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body   = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const team = await createTeam(parsed.data);
  if (!team) return NextResponse.json({ error: "Could not persist — mock mode" }, { status: 202 });
  return NextResponse.json(team, { status: 201 });
}
