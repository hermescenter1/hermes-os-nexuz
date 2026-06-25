import { NextResponse }              from "next/server";
import { getCurrentUser }            from "@/lib/auth/session";
import { can }                       from "@/lib/auth/roles";
import { getCrmDashboard, getCrmPipeline } from "@/lib/crm/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [stats, pipeline] = await Promise.all([getCrmDashboard(), getCrmPipeline()]);
  return NextResponse.json({ stats, pipeline });
}
