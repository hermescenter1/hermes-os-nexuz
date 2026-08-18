import { NextResponse }   from "next/server";
import { z }              from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import { readBoundedJson, SMALL_JSON_BODY_BYTES } from "@/lib/security/request-guards";
import {
  COMMENT_MAX_LENGTH,
  COMMENT_MAX_PAGE_SIZE,
  COMMENT_PAGE_SIZE,
  createArticleComment,
  getEngageableArticle,
  listArticleComments,
} from "@/lib/articles/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The discussion on a published Journal article.
 *
 * GET is public: anyone may read the conversation under a PUBLISHED + PUBLIC
 * article. The page is always bounded — there is no parameter that returns an
 * unbounded list — and only ACTIVE comments are returned, so a withdrawn or
 * moderated comment is invisible to readers without being destroyed.
 *
 * POST requires a session. The author is taken from that session; `userId`,
 * `isActive` and every other column are not accepted from the body, so there is
 * no mass-assignment surface and a caller cannot post as somebody else.
 *
 * Bodies are stored and returned as PLAIN TEXT. Nothing in the render path uses
 * dangerouslySetInnerHTML, so markup a reader types is displayed as the
 * characters they typed rather than interpreted — which is why no HTML
 * sanitiser is needed here, and why one must never be swapped in for a
 * "rich text" feature without revisiting this contract.
 */
const postSchema = z
  .object({
    body: z
      .string()
      .transform((v) => v.replace(/\r\n/g, "\n").trim())
      .refine((v) => v.length > 0, "empty")
      .refine((v) => v.length <= COMMENT_MAX_LENGTH, "too_long"),
    // Present only for a reply. The value is validated against the database in
    // createArticleComment, which refuses a parent from another article and a
    // parent that is itself a reply.
    parentId: z.string().trim().min(1).max(64).optional().nullable(),
  })
  .strict();

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  // A database outage answers 503; a missing OR unpublished article answers a
  // single indistinguishable 404, so this is never an existence oracle.
  const gate = await getEngageableArticle(id);
  if (gate.status === "unavailable") return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  if (gate.status === "not-found")   return NextResponse.json({ error: "not_found" },           { status: 404 });

  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.trunc(rawLimit), COMMENT_MAX_PAGE_SIZE)
    : COMMENT_PAGE_SIZE;

  const rawCursor = url.searchParams.get("cursor");
  // A cursor is an opaque row id; anything shaped otherwise is dropped rather
  // than handed to the query.
  const cursor = rawCursor && /^[A-Za-z0-9_-]{1,64}$/.test(rawCursor) ? rawCursor : null;

  const page = await listArticleComments(id, { limit, cursor });
  return NextResponse.json(page);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  if (!await checkRateLimit("journal-comment-create", user.id)) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: retryAfter("journal-comment-create", user.id) },
      { status: 429 },
    );
  }

  const read = await readBoundedJson(req, SMALL_JSON_BODY_BYTES);
  if (read.status === "too_large") return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  if (read.status === "invalid")   return NextResponse.json({ error: "invalid_body" },      { status: 400 });

  const parsed = postSchema.safeParse(read.value);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message;
    const code = first === "too_long" ? "comment_too_long" : "invalid_comment";
    return NextResponse.json({ error: code }, { status: 400 });
  }

  // A database outage answers 503; a missing OR unpublished article answers a
  // single indistinguishable 404, so this is never an existence oracle.
  const gate = await getEngageableArticle(id);
  if (gate.status === "unavailable") return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  if (gate.status === "not-found")   return NextResponse.json({ error: "not_found" },           { status: 404 });

  const result = await createArticleComment({
    articleId: id,
    userId:    user.id,
    body:      parsed.data.body,
    parentId:  parsed.data.parentId ?? null,
  });

  if (!result.ok) {
    switch (result.error) {
      case "parent-not-found":
        return NextResponse.json({ error: "parent_not_found" }, { status: 404 });
      // One level of replies is a structural rule, not a preference: a reply to
      // a reply is refused rather than silently re-parented to the top.
      case "parent-not-top-level":
        return NextResponse.json({ error: "reply_depth_exceeded" }, { status: 422 });
      default:
        return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
    }
  }

  return NextResponse.json({ ok: true, comment: result.comment }, { status: 201 });
}
