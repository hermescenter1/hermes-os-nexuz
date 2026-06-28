import { NextResponse }    from "next/server";
import { getArticleFeed } from "@/lib/articles/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const feed = await getArticleFeed();
  return NextResponse.json(feed);
}
