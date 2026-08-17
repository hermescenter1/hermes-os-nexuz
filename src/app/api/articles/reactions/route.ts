import { NextResponse }   from "next/server";
import { z }              from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import { readBoundedJson, SMALL_JSON_BODY_BYTES } from "@/lib/security/request-guards";
import {
  ARTICLE_REACTIONS,
  clearArticleReaction,
  getEngageableArticle,
  setArticleReaction,
} from "@/lib/articles/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Legacy article-reaction endpoint, kept for its existing request shape.
 *
 * Until now this route VALIDATED a reaction and then returned
 * `{ reacted: true }` without ever writing a row — a placeholder that reported
 * success for something it had not done. Any caller integrating against it
 * believed reactions were being recorded when nothing was.
 *
 * The canonical surface is now `PUT /api/articles/[id]/reaction`, which is
 * idempotent per reader and returns the aggregate. This path is retained rather
 * than deleted so an existing caller does not break, and it now delegates to
 * the same persistence as the canonical route — so it tells the truth.
 */
const postSchema = z
  .object({
    articleId:    z.string().trim().min(1).max(64),
    reactionType: z.enum(ARTICLE_REACTIONS),
  })
  .strict();

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!await checkRateLimit("journal-reaction-set", user.id)) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: retryAfter("journal-reaction-set", user.id) },
      { status: 429 },
    );
  }

  const read = await readBoundedJson(request, SMALL_JSON_BODY_BYTES);
  if (read.status === "too_large") return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  if (read.status === "invalid")   return NextResponse.json({ error: "invalid_body" },      { status: 400 });

  const parsed = postSchema.safeParse(read.value);
  if (!parsed.success) return NextResponse.json({ error: "invalid reactionType" }, { status: 400 });

  // A database outage answers 503; a missing OR unpublished article answers a
  // single indistinguishable 404, so this is never an existence oracle.
  const gate = await getEngageableArticle(parsed.data.articleId);
  if (gate.status === "unavailable") return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  if (gate.status === "not-found")   return NextResponse.json({ error: "not_found" },           { status: 404 });

  const result = await setArticleReaction(parsed.data.articleId, user.id, parsed.data.reactionType);
  if (!result.ok) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  // Original response shape preserved, now backed by a real row.
  return NextResponse.json({
    reacted:      result.viewer !== null,
    articleId:    parsed.data.articleId,
    reactionType: result.viewer,
    counts:       result.summary.counts,
    total:        result.summary.total,
  });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const articleId = searchParams.get("articleId");
  if (!articleId) return NextResponse.json({ error: "articleId required" }, { status: 400 });

  // A database outage answers 503; a missing OR unpublished article answers a
  // single indistinguishable 404, so this is never an existence oracle.
  const gate = await getEngageableArticle(articleId);
  if (gate.status === "unavailable") return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  if (gate.status === "not-found")   return NextResponse.json({ error: "not_found" },           { status: 404 });

  const result = await clearArticleReaction(articleId, user.id);
  if (!result.ok) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  return NextResponse.json({
    unreacted: true,
    articleId,
    counts:    result.summary.counts,
    total:     result.summary.total,
  });
}
