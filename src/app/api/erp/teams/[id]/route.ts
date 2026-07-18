import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can }           from "@/lib/auth/roles";
import { getTeamById }   from "@/lib/erp/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const team   = await getTeamById(id);
  if (!team) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(team);
}
