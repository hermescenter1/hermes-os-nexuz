import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser }           from "@/lib/auth/session";
import { can }                      from "@/lib/auth/roles";
import { getAccountForUser, getActivityLog } from "@/lib/customer-portal/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "dashboard")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const account = await getAccountForUser(user.id);
  if (!account) return NextResponse.json({ activity: [], noAccount: true });

  const take = Math.min(Number(req.nextUrl.searchParams.get("take") ?? "50"), 200);
  const activity = await getActivityLog(account.id, take);
  return NextResponse.json({ activity });
}
