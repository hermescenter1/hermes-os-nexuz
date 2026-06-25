import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can }           from "@/lib/auth/roles";
import { getExecutions }  from "@/lib/automation/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url        = new URL(req.url);
  const workflowId = url.searchParams.get("workflowId") ?? undefined;
  const limit      = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

  const executions = await getExecutions(workflowId, limit);
  return NextResponse.json(executions);
}
