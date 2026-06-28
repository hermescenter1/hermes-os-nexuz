import { NextResponse }              from "next/server";
import { getArticleDetailBySlug }    from "@/lib/articles/db";
import { getCurrentUser }            from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const article = await getArticleDetailBySlug(id);
  if (!article) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (article.status !== "PUBLISHED" || article.visibility !== "PUBLIC") {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (article.authorId !== user.id && user.role !== "admin" && user.role !== "superadmin")
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json(article);
}
