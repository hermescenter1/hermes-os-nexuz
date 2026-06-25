import { NextResponse } from "next/server";
import { z }            from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { can }           from "@/lib/auth/roles";
import { simulateWorkflowById } from "@/lib/automation/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  context: z.record(z.string(), z.unknown()).optional().default({}),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const body   = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await simulateWorkflowById(id, parsed.data.context);
  if (!result) return NextResponse.json({ error: "workflow not found" }, { status: 404 });
  return NextResponse.json(result);
}
