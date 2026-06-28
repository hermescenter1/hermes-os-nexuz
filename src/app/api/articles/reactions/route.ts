import { NextResponse }    from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_REACTIONS = ["INSIGHTFUL", "HELPFUL", "DETAILED", "PRACTICAL"] as const;

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { articleId?: string; reactionType?: string };
  if (!body.articleId) return NextResponse.json({ error: "articleId required" }, { status: 400 });
  if (!body.reactionType || !VALID_REACTIONS.includes(body.reactionType as never))
    return NextResponse.json({ error: "invalid reactionType" }, { status: 400 });
  return NextResponse.json({ reacted: true, articleId: body.articleId, reactionType: body.reactionType });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const articleId = searchParams.get("articleId");
  if (!articleId) return NextResponse.json({ error: "articleId required" }, { status: 400 });
  return NextResponse.json({ unreacted: true, articleId });
}
