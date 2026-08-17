import { NextResponse }   from "next/server";
import { z }              from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { readBoundedJson, SMALL_JSON_BODY_BYTES } from "@/lib/security/request-guards";
import {
  SAVED_MAX_PAGE_SIZE,
  getEngageableArticle,
  listSavedArticles,
  setArticleSaved,
} from "@/lib/articles/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A reader's saved Journal articles.
 *
 * Until now every method here was a PLACEHOLDER: GET answered with a literal
 * empty list, and POST/DELETE answered `{ saved: true }` / `{ unsaved: true }`
 * without touching the database. The bookmark button reported success and then
 * forgot, so a reader who saved an article found nothing on /articles/saved.
 *
 * The `ArticleSave` model, its `@@unique([userId, articleId])` key and its
 * cascade from Article already existed — only the wiring was missing. The
 * response shapes below are preserved exactly so existing callers keep working;
 * the values are now true.
 *
 * The acting reader always comes from the session. No method accepts a `userId`,
 * so a caller can only ever read or change their OWN bookmarks.
 */
const bodySchema = z.object({ articleId: z.string().trim().min(1).max(64) }).strict();

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.trunc(rawLimit), SAVED_MAX_PAGE_SIZE)
    : undefined;

  const rawCursor = url.searchParams.get("cursor");
  const cursor = rawCursor && /^[A-Za-z0-9_-]{1,64}$/.test(rawCursor) ? rawCursor : null;

  // Scoped to the session user by the query itself — the list cannot be
  // widened by any parameter this endpoint accepts.
  const page = await listSavedArticles(user.id, { limit, cursor });
  return NextResponse.json(page);
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const read = await readBoundedJson(request, SMALL_JSON_BODY_BYTES);
  if (read.status === "too_large") return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  if (read.status === "invalid")   return NextResponse.json({ error: "invalid_body" },      { status: 400 });

  const parsed = bodySchema.safeParse(read.value);
  if (!parsed.success) return NextResponse.json({ error: "articleId required" }, { status: 400 });

  // A database outage answers 503; a missing OR unpublished article answers a
  // single indistinguishable 404, so this is never an existence oracle.
  const gate = await getEngageableArticle(parsed.data.articleId);
  if (gate.status === "unavailable") return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  if (gate.status === "not-found")   return NextResponse.json({ error: "not_found" },           { status: 404 });

  const result = await setArticleSaved(parsed.data.articleId, user.id, true);
  if (!result.ok) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  return NextResponse.json({ saved: true, articleId: parsed.data.articleId });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const articleId = searchParams.get("articleId");
  if (!articleId) return NextResponse.json({ error: "articleId required" }, { status: 400 });

  // Un-saving is deliberately NOT gated on the article still being publishable:
  // an article that was unpublished after a reader bookmarked it must still be
  // removable from their list, or the bookmark would be impossible to clear.
  const result = await setArticleSaved(articleId, user.id, false);
  if (!result.ok) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  return NextResponse.json({ unsaved: true, articleId });
}
