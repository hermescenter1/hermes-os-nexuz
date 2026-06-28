import { NextResponse }   from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getUserArticles } from "@/lib/articles/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const articles = await getUserArticles(user.id);
  return NextResponse.json({ articles });
}
