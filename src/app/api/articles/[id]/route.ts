import { NextResponse }              from "next/server";
import { getArticleDetailBySlug }    from "@/lib/articles/db";
import { getCurrentUser }            from "@/lib/auth/session";
import { can }                       from "@/lib/auth/roles";
import { getPrisma }                 from "@/lib/db/prisma";
import { recordAuditEvent }          from "@/lib/audit/audit-service";
import { resolveRequestId }          from "@/lib/logger/correlation";
import { notifyArticleLifecycle }    from "@/lib/seo/indexnow-lifecycle";
import { deleteCoverFile }           from "@/lib/articles/media";

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

/**
 * Editorial removal of a Journal article.
 *
 * Authority matches the sibling review endpoints (`/api/articles/review/[id]/
 * approve|reject`): `can(role, "admin")` covers admin + superadmin, and no
 * "editor" role exists in the current auth system. Authors deliberately get
 * nothing here — a customer removing their own article is a separate product
 * decision, not part of the moderation surface.
 *
 * DELETE SEMANTICS — this is a hard delete, and it is safe to be one.
 * Every one of Article's twelve child relations declares `onDelete: Cascade`
 * in prisma/schema.prisma (tags, saves, reactions, comments, views, shares,
 * reports, moderationEvents, editorialReviews, qualitySignals,
 * knowledgeMetadata, readingHistory), and the datasource uses the default
 * `relationMode = "foreignKeys"`, so Postgres itself removes the dependent rows
 * inside the single DELETE statement. There is no application-side deleteMany
 * to keep in sync and no orphan class to sweep.
 *
 * `ArticleCategory` and `ArticleAuthorProfile` are PARENTS of the article, not
 * children — deleting an article never touches them. `articleCount` on the
 * author profile is intentionally left alone: it is a known-stale denormalised
 * counter that the read path already overrides with a computed
 * PUBLISHED + PUBLIC `_count` (see lib/articles/db.ts and the Phase 75 note in
 * lib/articles/types.ts), so decrementing it here would be inventing a
 * maintenance contract the write path does not otherwise honour.
 *
 * The moderation history dies with the article by existing schema design. That
 * is the schema's answer, not this endpoint's — the durable record of WHO
 * removed WHAT lives in the audit log written below, which no cascade touches.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user)                    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin")) return NextResponse.json({ error: "forbidden" },    { status: 403 });

  const { id } = await params;

  const db = await getPrisma();
  if (!db) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const articleModel = (db as unknown as {
    article: {
      findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
      delete:     (a: unknown) => Promise<unknown>;
    };
  }).article;

  // Read the few fields the removal itself needs. Never the body — nothing
  // downstream of this point should be able to log article content.
  let existing: Record<string, unknown> | null;
  try {
    existing = await articleModel.findUnique({
      where:  { id },
      select: { id: true, slug: true, status: true, language: true, coverImageUrl: true },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[api/articles/delete] lookup articleId=${id} actor=${user.id} error=${msg}`);
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const previousStatus = String(existing.status ?? "");
  const slug           = String(existing.slug ?? "");
  const language       = String(existing.language ?? "EN");
  const coverImageUrl  = typeof existing.coverImageUrl === "string" ? existing.coverImageUrl : null;

  try {
    await articleModel.delete({ where: { id } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // P2025 = "record to delete does not exist". A second click, or two
    // moderators acting at once, lands here after the first call already
    // succeeded — that is the same observable end state, reported as 404
    // rather than a 500.
    if (msg.includes("P2025") || /record to delete does not exist/i.test(msg)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error(`[api/articles/delete] delete articleId=${id} actor=${user.id} error=${msg}`);
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  // The row is gone; everything below is cleanup that must not fail the request.

  // Cover images are owned exclusively by their article (each upload mints a
  // fresh opaque filename), so releasing the file here can never affect another
  // article or an author avatar — `deleteCoverFile` additionally refuses any
  // URL it did not mint.
  await deleteCoverFile(coverImageUrl);

  await recordAuditEvent({
    userId:        user.id,
    action:        "journal.article.deleted",
    entityType:    "article",
    entityId:      id,
    outcome:       "success",
    correlationId: resolveRequestId(req),
    // Identifiers and lifecycle state only. No title, excerpt, content,
    // author identity or moderation prose — an audit record is not a copy of
    // the thing it describes.
    metadata:      { previousStatus },
  });

  // A published article had public URLs; tell IndexNow they changed. Inert in
  // tests and development, and fire-and-forget either way.
  if (previousStatus === "PUBLISHED" && slug) {
    notifyArticleLifecycle(slug, language);
  }

  return NextResponse.json({ ok: true, id, previousStatus });
}
