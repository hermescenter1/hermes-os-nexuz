import { NextResponse }      from "next/server";
import { getCurrentUser }    from "@/lib/auth/session";
import { can }               from "@/lib/auth/roles";
import { recordAuditEvent }  from "@/lib/audit/audit-service";
import { resolveRequestId }  from "@/lib/logger/correlation";
import { removeArticleComment } from "@/lib/articles/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Withdraw a comment.
 *
 * Two distinct authorities meet on this endpoint, and the difference matters:
 *
 *   the COMMENT OWNER  may withdraw their own comment;
 *   a MODERATOR (`can(role, "admin")` — admin + superadmin, the same predicate
 *   the article review endpoints use) may withdraw any comment.
 *
 * An article's AUTHOR is deliberately NOT a moderator of their own discussion.
 * Nothing in the current policy grants a customer authority over another
 * reader's words, and inventing that here would hand every author a silent
 * censorship tool over criticism of their own work.
 *
 * The decision is made in `removeArticleComment` from the PERSISTED row, so a
 * client cannot claim ownership it does not have, and a comment belonging to a
 * different article than the one in the path is reported as missing rather than
 * as forbidden.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, commentId } = await params;
  const isModerator = can(user.role, "admin");

  const result = await removeArticleComment({
    articleId:        id,
    commentId,
    actorUserId:      user.id,
    actorIsModerator: isModerator,
  });

  if (!result.ok) {
    switch (result.error) {
      case "not-found":     return NextResponse.json({ error: "not_found" },           { status: 404 });
      case "forbidden":     return NextResponse.json({ error: "forbidden" },           { status: 403 });
      default:              return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
    }
  }

  // Identifiers only. The comment BODY is never audited — an audit log records
  // that something was removed and by whom, it is not a copy of the removed
  // text, and copying it here would make the audit trail a durable archive of
  // exactly the content someone asked to have taken down.
  await recordAuditEvent({
    userId:        user.id,
    action:        isModerator ? "journal.comment.moderated" : "journal.comment.removed",
    entityType:    "article_comment",
    entityId:      result.commentId,
    outcome:       "success",
    correlationId: resolveRequestId(req),
    metadata:      { articleId: id, wasReply: result.wasReply },
  });

  return NextResponse.json({ ok: true, commentId: result.commentId });
}
