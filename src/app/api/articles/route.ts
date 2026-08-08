import { NextResponse }       from "next/server";
import { getPublicArticles }  from "@/lib/articles/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PHASE 99 — bound the client-controlled page size.
 *
 * `limit` and `page` were passed straight through to Prisma `take`/`skip` with a
 * three-level `include`, so `?limit=500000` on this anonymous endpoint ran an
 * unbounded join. The sibling public endpoints already clamp (trending to 50,
 * vendors to 100); 100 matches the most permissive of them. A non-numeric,
 * fractional or negative value falls back to the default instead of reaching
 * the query as `NaN`.
 */
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 1000;

function boundedInt(raw: string | null, fallback: number, max: number): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const filters = {
    categorySlug: searchParams.get("category")    ?? undefined,
    tagSlug:      searchParams.get("tag")         ?? undefined,
    authorHandle: searchParams.get("author")      ?? undefined,
    search:       searchParams.get("q")           ?? undefined,
    language:     (searchParams.get("lang")?.toUpperCase() as "EN" | "FA" | undefined),
    page:         boundedInt(searchParams.get("page"), 1, MAX_PAGE),
    limit:        boundedInt(searchParams.get("limit"), 20, MAX_PAGE_SIZE),
  };
  const articles = await getPublicArticles(filters);
  return NextResponse.json({ articles, total: articles.length });
}
