"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatDate } from "@/lib/i18n/format";
// Imported from the dependency-free contract module, NOT from
// lib/articles/engagement — that one reaches for Prisma and must never be
// pulled into a client bundle.
import {
  ARTICLE_REACTIONS,
  COMMENT_MAX_LENGTH,
  type ArticleReactionType,
  type CommentNode,
  type CommentPage,
  type ReactionSummary,
} from "@/lib/articles/engagement-types";

/**
 * Journal engagement surfaces: the reaction bar and the discussion thread.
 *
 * Everything here is SERVER-TRUTHFUL. The initial state is rendered from data
 * the page already loaded, and every mutation replaces local state with what
 * the server returned — no count is ever incremented locally and then hoped to
 * match, which is how the previous placeholder bar could disagree with the
 * database indefinitely.
 */

export interface EngagementViewer {
  id: string;
  /** Holds the `admin` capability: may withdraw anybody's comment. */
  isModerator: boolean;
}

interface Props {
  articleId: string;
  articleSlug: string;
  reactions: ReactionSummary;
  comments: CommentPage;
  viewer: EngagementViewer | null;
}

/** Sign-in destination that returns the reader to this exact article. */
function authHref(locale: string, slug: string): string {
  return `/${locale}/auth/login?from=${encodeURIComponent(`/${locale}/articles/${slug}`)}`;
}

function Avatar({ name, src, size = 36 }: { name: string; src: string | null; size?: number }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  if (src) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full border border-line/40 object-cover bg-surface2"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="shrink-0 rounded-full border border-line/40 bg-surface2 text-metadata grid place-items-center font-mono"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </span>
  );
}

/* ── Reactions ─────────────────────────────────────────────────────────────── */

function ReactionBar({
  articleId, articleSlug, initial, viewer,
}: {
  articleId: string;
  articleSlug: string;
  initial: ReactionSummary;
  viewer: EngagementViewer | null;
}) {
  const locale = useLocale();
  const t = useTranslations("journal");
  const [summary, setSummary] = useState<ReactionSummary>(initial);
  const [busy, setBusy] = useState<ArticleReactionType | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function react(type: ArticleReactionType) {
    if (busy) return;
    setBusy(type);
    setError(null);
    try {
      const res = await fetch(`/api/articles/${articleId}/reaction`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ type }),
      });
      if (!res.ok) {
        setError(t("engagement.reactFailed"));
        return;
      }
      const data = await res.json() as ReactionSummary;
      // The server's aggregate replaces local state wholesale.
      setSummary({ counts: data.counts, total: data.total, viewer: data.viewer });
    } catch {
      setError(t("engagement.networkError"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("engagement.reactionsLabel")}>
        {ARTICLE_REACTIONS.map((key) => {
          const active = summary.viewer === key;
          const count = summary.counts[key] ?? 0;
          const label = t(`detail.reaction.${key}`);
          // Anonymous readers see the same bar but it takes them to sign-in
          // rather than silently doing nothing.
          if (!viewer) {
            return (
              <a
                key={key}
                href={authHref(locale, articleSlug)}
                title={t("engagement.signInToReact")}
                className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-full border border-line/60 text-metadata hover:border-signal/30 hover:text-ink transition-all font-mono uppercase tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
              >
                <span>{label}</span>
                {/* The count is NOT dimmed with an opacity modifier: the
                    metadata token already sits at the AA floor, and
                    src/app/__tests__/text-contrast-a11y.test.ts fails any
                    source that pushes it below. Tabular figures do the visual
                    separating instead. */}
                {count > 0 && <span className="tabular-nums">{count}</span>}
              </a>
            );
          }
          return (
            <button
              key={key}
              type="button"
              onClick={() => react(key)}
              disabled={busy !== null}
              // aria-pressed carries the selected state to assistive tech; the
              // check glyph and the bold weight carry it visually, so colour is
              // never the only signal that a reaction is active.
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-full border transition-all font-mono uppercase tracking-wide disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
                active
                  ? "border-signal bg-signal/12 text-signal font-semibold"
                  : "border-line/60 text-metadata hover:border-signal/30 hover:text-ink"
              }`}
            >
              {active && (
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="w-3 h-3">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd"/>
                </svg>
              )}
              <span>{label}</span>
              {count > 0 && <span className="tabular-nums">{count}</span>}
            </button>
          );
        })}
      </div>
      {error && <p role="alert" className="text-[10px] text-danger font-mono">{error}</p>}
    </div>
  );
}

/* ── Comment composer ──────────────────────────────────────────────────────── */

function Composer({
  articleId, parentId, onPosted, onCancel, autoFocus, placeholderKey,
}: {
  articleId: string;
  parentId?: string;
  onPosted: (c: CommentNode) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  placeholderKey: "commentPlaceholder" | "replyPlaceholder";
}) {
  const t = useTranslations("journal");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous guard: React's disabled={busy} is not instantaneous, so a fast
  // double-click could otherwise post the same comment twice.
  const posting = useRef(false);
  const fieldId = `comment-${parentId ?? "root"}-${articleId}`;

  const trimmed = body.trim();
  const tooLong = trimmed.length > COMMENT_MAX_LENGTH;
  const canPost = trimmed.length > 0 && !tooLong && !busy;

  async function post() {
    if (posting.current || !canPost) return;
    posting.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/articles/${articleId}/comments`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(parentId ? { body: trimmed, parentId } : { body: trimmed }),
      });
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok) {
        const code = typeof data.error === "string" ? data.error : "";
        setError(
          code === "comment_too_long" ? t("engagement.commentTooLong")
          : code === "rate_limited"   ? t("engagement.commentRateLimited")
          : code === "unauthorized"   ? t("engagement.signInToComment")
          : t("engagement.commentFailed"),
        );
        return;
      }
      const comment = (data as { comment?: CommentNode }).comment;
      if (comment) {
        setBody("");
        onPosted(comment);
      }
    } catch {
      setError(t("engagement.networkError"));
    } finally {
      setBusy(false);
      posting.current = false;
    }
  }

  return (
    <div className="flex flex-col gap-2 w-full min-w-0">
      <label htmlFor={fieldId} className="sr-only">
        {t(`engagement.${placeholderKey}`)}
      </label>
      <textarea
        id={fieldId}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t(`engagement.${placeholderKey}`)}
        rows={parentId ? 2 : 3}
        autoFocus={autoFocus}
        maxLength={COMMENT_MAX_LENGTH + 100}
        className="hs-writer-field w-full resize-none rounded-xl border border-line/60 px-3.5 py-2.5 text-sm"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={post}
          disabled={!canPost}
          className="text-xs px-4 py-1.5 rounded-lg bg-signal text-bg font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          {busy ? t("engagement.posting") : t("engagement.post")}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-lg border border-line/60 text-muted hover:text-ink transition-all disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          >
            {t("engagement.cancel")}
          </button>
        )}
        <span className={`ms-auto text-[10px] font-mono tabular-nums ${tooLong ? "text-danger" : "text-metadata"}`}>
          {trimmed.length}/{COMMENT_MAX_LENGTH}
        </span>
      </div>
      {error && <p role="alert" className="text-[10px] text-danger font-mono">{error}</p>}
    </div>
  );
}

/* ── One comment ───────────────────────────────────────────────────────────── */

function CommentItem({
  node, articleId, viewer, isReply, onReplyPosted, onRemoved,
}: {
  node: CommentNode;
  articleId: string;
  viewer: EngagementViewer | null;
  isReply: boolean;
  onReplyPosted: (parentId: string, reply: CommentNode) => void;
  onRemoved: (id: string, parentId: string | null) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("journal");
  const [replying, setReplying] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner = viewer?.id === node.author.userId;
  const canRemove = !!viewer && (isOwner || viewer.isModerator);

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/articles/${articleId}/comments/${node.id}`, { method: "DELETE" });
      // 404 means it is already gone; the reader's intent holds either way.
      if (!res.ok && res.status !== 404) {
        setError(t("engagement.removeFailed"));
        return;
      }
      onRemoved(node.id, node.parentId);
    } catch {
      setError(t("engagement.networkError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={isReply ? "flex gap-2.5" : "flex gap-3"}>
      <Avatar name={node.author.displayName} src={node.author.avatarUrl} size={isReply ? 28 : 36} />

      <div className="flex-1 min-w-0">
        <div className="rounded-xl border border-line/30 bg-surface/50 px-3.5 py-2.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {node.author.handle ? (
              <a
                href={`/${locale}/articles/author/${node.author.handle}`}
                className="text-xs font-semibold text-ink hover:text-signal transition-colors"
              >
                {node.author.displayName}
              </a>
            ) : (
              <span className="text-xs font-semibold text-ink">{node.author.displayName}</span>
            )}
            {node.author.verifiedExpert && (
              <span className="hs-badge hs--knowledge text-[9px]">{t("badge.expert")}</span>
            )}
            <span className="text-[10px] text-metadata font-mono">
              {formatDate(node.createdAt, locale, { year: "numeric", month: "short", day: "numeric" })}
            </span>
          </div>

          {/* Public professional context only — never organization or contact data. */}
          {node.author.headline && (
            <p className="text-[10px] text-metadata truncate">{node.author.headline}</p>
          )}

          {/* Plain text. Rendered as a text node, never as markup. */}
          <p className="mt-1.5 text-sm text-muted leading-relaxed whitespace-pre-wrap break-words">
            {node.body}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-1 ps-1">
          {/* Replies are one level deep, so a reply itself offers no reply button. */}
          {!isReply && viewer && (
            <button
              type="button"
              onClick={() => setReplying((v) => !v)}
              className="text-[10px] text-metadata hover:text-signal transition-colors font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
            >
              {t("engagement.reply")}
            </button>
          )}
          {canRemove && !confirmRemove && (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              className="text-[10px] text-metadata hover:text-danger transition-colors font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
            >
              {isOwner ? t("engagement.delete") : t("engagement.moderate")}
            </button>
          )}
          {confirmRemove && (
            <span className="inline-flex items-center gap-2">
              <span className="text-[10px] text-danger font-mono">{t("engagement.removeConfirm")}</span>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="text-[10px] px-2 py-0.5 rounded border border-danger/40 text-danger hover:bg-danger/10 transition-all font-mono disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
              >
                {busy ? t("engagement.removing") : t("engagement.confirmRemove")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemove(false)}
                disabled={busy}
                className="text-[10px] px-2 py-0.5 rounded border border-line/50 text-muted hover:text-ink transition-all font-mono disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
              >
                {t("engagement.cancel")}
              </button>
            </span>
          )}
          {error && <span role="alert" className="text-[10px] text-danger font-mono">{error}</span>}
        </div>

        {replying && (
          <div className="mt-2.5">
            <Composer
              articleId={articleId}
              parentId={node.id}
              autoFocus
              placeholderKey="replyPlaceholder"
              onCancel={() => setReplying(false)}
              onPosted={(reply) => { setReplying(false); onReplyPosted(node.id, reply); }}
            />
          </div>
        )}

        {node.replies.length > 0 && (
          <div className="mt-3 flex flex-col gap-3 ps-3 border-s border-line/25">
            {node.replies.map((r) => (
              <CommentItem
                key={r.id}
                node={r}
                articleId={articleId}
                viewer={viewer}
                isReply
                onReplyPosted={onReplyPosted}
                onRemoved={onRemoved}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Thread ────────────────────────────────────────────────────────────────── */

function CommentThread({
  articleId, articleSlug, initial, viewer,
}: {
  articleId: string;
  articleSlug: string;
  initial: CommentPage;
  viewer: EngagementViewer | null;
}) {
  const locale = useLocale();
  const t = useTranslations("journal");
  const [page, setPage] = useState<CommentPage>(initial);
  const [loadingMore, setLoadingMore] = useState(false);

  function onPosted(c: CommentNode) {
    setPage((p) => ({ ...p, comments: [...p.comments, c], total: p.total + 1 }));
  }

  function onReplyPosted(parentId: string, reply: CommentNode) {
    setPage((p) => ({
      ...p,
      total: p.total + 1,
      comments: p.comments.map((c) => (c.id === parentId ? { ...c, replies: [...c.replies, reply] } : c)),
    }));
  }

  function onRemoved(id: string, parentId: string | null) {
    setPage((p) => {
      if (parentId) {
        return {
          ...p,
          total: Math.max(0, p.total - 1),
          comments: p.comments.map((c) =>
            c.id === parentId ? { ...c, replies: c.replies.filter((r) => r.id !== id) } : c,
          ),
        };
      }
      const removed = p.comments.find((c) => c.id === id);
      // A withdrawn parent takes its replies out of view with it.
      const drop = 1 + (removed?.replies.length ?? 0);
      return { ...p, total: Math.max(0, p.total - drop), comments: p.comments.filter((c) => c.id !== id) };
    });
  }

  async function loadMore() {
    if (loadingMore || !page.nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/articles/${articleId}/comments?cursor=${encodeURIComponent(page.nextCursor)}`);
      if (res.ok) {
        const next = await res.json() as CommentPage;
        setPage((p) => ({
          comments:   [...p.comments, ...next.comments],
          total:      next.total,
          nextCursor: next.nextCursor,
        }));
      }
    } catch {
      /* leaving the existing page in place is the correct failure mode */
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section id="comments" className="mt-12 pt-10 border-t border-line/20" aria-labelledby="comments-heading">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-0.5 h-5 rounded-full bg-gradient-to-b from-signal to-signal/20" />
        <h2 id="comments-heading" className="text-xs font-bold text-ink uppercase tracking-wider">
          {t("engagement.commentsHeading", { count: page.total })}
        </h2>
      </div>

      {viewer ? (
        <div className="mb-7">
          <Composer articleId={articleId} placeholderKey="commentPlaceholder" onPosted={onPosted} />
        </div>
      ) : (
        <div className="mb-7 rounded-xl border border-line/30 bg-surface/40 px-4 py-3.5">
          <p className="text-xs text-muted">
            <a
              href={authHref(locale, articleSlug)}
              className="text-signal font-semibold hover:underline underline-offset-2"
            >
              {t("engagement.signInToComment")}
            </a>
          </p>
        </div>
      )}

      {page.comments.length === 0 ? (
        <p className="text-sm text-metadata">{t("engagement.noComments")}</p>
      ) : (
        <div className="flex flex-col gap-5">
          {page.comments.map((c) => (
            <CommentItem
              key={c.id}
              node={c}
              articleId={articleId}
              viewer={viewer}
              isReply={false}
              onReplyPosted={onReplyPosted}
              onRemoved={onRemoved}
            />
          ))}
        </div>
      )}

      {page.nextCursor && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-6 text-xs px-4 py-2 rounded-lg border border-line/60 text-muted hover:text-ink hover:border-signal/30 transition-all disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          {loadingMore ? t("engagement.loading") : t("engagement.loadMore")}
        </button>
      )}
    </section>
  );
}

export function ArticleEngagement({ articleId, articleSlug, reactions, comments, viewer }: Props) {
  return (
    <>
      <div className="py-5 border-y border-line/30">
        <ReactionBar articleId={articleId} articleSlug={articleSlug} initial={reactions} viewer={viewer} />
      </div>
      <CommentThread articleId={articleId} articleSlug={articleSlug} initial={comments} viewer={viewer} />
    </>
  );
}

export { ReactionBar, CommentThread };
