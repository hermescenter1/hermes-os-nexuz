import { NextResponse }   from "next/server";
import { z }              from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import { readBoundedJson, SMALL_JSON_BODY_BYTES } from "@/lib/security/request-guards";
import {
  ARTICLE_REACTIONS,
  getEngageableArticle,
  getReactionSummary,
  setArticleReaction,
} from "@/lib/articles/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A reader's own reaction to a published Journal article.
 *
 * GET is the aggregate plus, for a signed-in reader, their current choice.
 * PUT is idempotent per (reader, article): the body names the reaction the
 * reader wants, and the server decides whether that means create, replace or
 * withdraw. The client never sends counts and never sends a user id — both are
 * derived on the server, so a caller cannot inflate a total or act as somebody
 * else.
 *
 * `.strict()` means a body carrying `userId`, `count` or any other field is
 * rejected outright rather than silently ignored.
 */
const putSchema = z.object({ type: z.enum(ARTICLE_REACTIONS) }).strict();

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  // Anonymous readers may see the aggregate; only the viewer-specific part
  // depends on a session.
  const user = await getCurrentUser();

  // A database outage answers 503; a missing OR unpublished article answers a
  // single indistinguishable 404, so this is never an existence oracle.
  const gate = await getEngageableArticle(id);
  if (gate.status === "unavailable") return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  if (gate.status === "not-found")   return NextResponse.json({ error: "not_found" },           { status: 404 });

  const summary = await getReactionSummary(id, user?.id ?? null);
  return NextResponse.json(summary);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  // Keyed by the acting reader, not by IP: colleagues behind one plant NAT must
  // not consume each other's budget.
  if (!await checkRateLimit("journal-reaction-set", user.id)) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: retryAfter("journal-reaction-set", user.id) },
      { status: 429 },
    );
  }

  const read = await readBoundedJson(req, SMALL_JSON_BODY_BYTES);
  if (read.status === "too_large") return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  if (read.status === "invalid")   return NextResponse.json({ error: "invalid_body" },      { status: 400 });

  const parsed = putSchema.safeParse(read.value);
  // Field names only — never the submitted value, which would echo an
  // attacker-chosen string back into an error surface.
  if (!parsed.success) return NextResponse.json({ error: "invalid_reaction" }, { status: 400 });

  // A database outage answers 503; a missing OR unpublished article answers a
  // single indistinguishable 404, so this is never an existence oracle.
  const gate = await getEngageableArticle(id);
  if (gate.status === "unavailable") return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  if (gate.status === "not-found")   return NextResponse.json({ error: "not_found" },           { status: 404 });

  const result = await setArticleReaction(id, user.id, parsed.data.type);
  if (!result.ok) {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  // The summary already carries `viewer`, recomputed from the row that was just
  // written — so the response is one consistent snapshot rather than a local
  // guess stapled onto a fresh aggregate.
  return NextResponse.json({ ok: true, ...result.summary });
}
