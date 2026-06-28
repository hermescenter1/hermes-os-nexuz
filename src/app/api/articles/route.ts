import { NextResponse }       from "next/server";
import { getPublicArticles }  from "@/lib/articles/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const filters = {
    categorySlug: searchParams.get("category")    ?? undefined,
    tagSlug:      searchParams.get("tag")         ?? undefined,
    authorHandle: searchParams.get("author")      ?? undefined,
    search:       searchParams.get("q")           ?? undefined,
    language:     (searchParams.get("lang")?.toUpperCase() as "EN" | "FA" | undefined),
    page:         Number(searchParams.get("page") ?? "1"),
    limit:        Number(searchParams.get("limit") ?? "20"),
  };
  const articles = await getPublicArticles(filters);
  return NextResponse.json({ articles, total: articles.length });
}
