import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser }           from "@/lib/auth/session";
import { can }                      from "@/lib/auth/roles";
import { getAccountForUser, getProjectById } from "@/lib/customer-portal/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "dashboard")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const account = await getAccountForUser(user.id);
  if (!account) return NextResponse.json({ error: "no_account" }, { status: 404 });

  const project = await getProjectById(account.id, id);
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ project });
}
