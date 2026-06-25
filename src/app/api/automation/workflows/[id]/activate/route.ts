import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can }           from "@/lib/auth/roles";
import { updateWorkflow } from "@/lib/automation/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const updated = await updateWorkflow(id, { status: "ACTIVE" });
  if (!updated) return NextResponse.json({ error: "not found or no db" }, { status: 404 });
  return NextResponse.json(updated);
}
