import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can }           from "@/lib/auth/roles";
import { getApprovals }  from "@/lib/erp/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url    = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const approvals = await getApprovals(status);
  return NextResponse.json(approvals);
}
