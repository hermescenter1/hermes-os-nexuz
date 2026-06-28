import { NextResponse }           from "next/server";
import { getTrendingArticlesList } from "@/lib/articles/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? "12");
  const articles = await getTrendingArticlesList(Math.min(limit, 50));
  return NextResponse.json({ articles });
}
