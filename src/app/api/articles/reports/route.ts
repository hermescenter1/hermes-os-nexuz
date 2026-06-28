import { NextResponse }    from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can }            from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ reports: [] });
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { articleId?: string; reason?: string; detail?: string };
  if (!body.articleId || !body.reason)
    return NextResponse.json({ error: "articleId and reason required" }, { status: 400 });
  return NextResponse.json({ reported: true, articleId: body.articleId });
}
