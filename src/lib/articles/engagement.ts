/**
 * Journal engagement — article reactions and comments.
 *
 * Server-only data layer. Every model used here ALREADY EXISTS in
 * prisma/schema.prisma and is reached through the shared `getPrisma()`
 * singleton; this module adds no schema and creates no table.
 *
 *   ArticleReaction  @@unique([userId, articleId])  → the one-reaction-per-
 *                    reader invariant is enforced by the DATABASE, not by
 *                    application bookkeeping.
 *   ArticleComment   parentId + the CommentReplies self-relation → one level
 *                    of replies, with `isActive` as the moderation flag.
 *
 * Both cascade from Article, so deleting an article removes its engagement in
 * the same statement (locked by the schema-contract test in
 * src/app/api/articles/__tests__/article-delete.test.ts).
 */

import { getPrisma } from "@/lib/db/prisma";
import type { ArticleListItem } from "./types";
import {
  ARTICLE_REACTIONS,
  COMMENT_MAX_PAGE_SIZE,
  COMMENT_PAGE_SIZE,
  SAVED_MAX_PAGE_SIZE,
  SAVED_PAGE_SIZE,
  isArticleReaction,
  type ArticleReactionType,
  type CommentNode,
  type CommentPage,
  type CommenterIdentity,
  type ReactionSummary,
} from "./engagement-types";

// The contract lives in engagement-types.ts so client components can import the
// constants without pulling the Prisma client into the browser bundle. Server
// callers keep importing everything from here.
export * from "./engagement-types";

type Row = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const iso = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : typeof v === "string" ? v : new Date(0).toISOString();

/**
 * Recursively convert every Date to an ISO string.
 *
 * Required before an article row crosses the server/client boundary: a nested
 * `author.createdAt` left as a Date breaks RSC serialisation. Mirrors the
 * identically-named helper in lib/articles/db.ts, which is module-private there.
 */
function deepTs(val: unknown): unknown {
  if (val instanceof Date) return val.toISOString();
  if (Array.isArray(val)) return val.map(deepTs);
  if (val !== null && typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(val as object)) {
      out[k] = deepTs((val as Record<string, unknown>)[k]);
    }
    return out;
  }
  return val;
}

/* ── Engagement eligibility ────────────────────────────────────────────────── */

/**
 * Engagement is only open on articles the public can actually read.
 *
 * A DRAFT, a SUBMITTED article awaiting review, or anything not PUBLIC is not
 * an engagement surface: reacting to or commenting on one would let a reader
 * confirm the existence and lifecycle state of unpublished editorial work, and
 * would attach a discussion to something a moderator may still reject.
 *
 * "Missing" and "not publicly readable" collapse into ONE answer so a caller
 * cannot use the difference to discover that an unpublished article exists.
 *
 * A database outage is deliberately NOT folded into that answer: reporting
 * "this article does not exist" when the database is merely unreachable would
 * tell a reader their bookmarked article had been deleted. Outage is its own
 * outcome, and callers map it to 503.
 */
export type EngageableArticle =
  | { status: "ok"; article: { id: string; authorId: string } }
  | { status: "not-found" }
  | { status: "unavailable" };

export async function getEngageableArticle(articleId: string): Promise<EngageableArticle> {
  const db = await getPrisma();
  if (!db) return { status: "unavailable" };
  try {
    const row = await (db as unknown as {
      article: { findUnique: (a: unknown) => Promise<Row | null> };
    }).article.findUnique({
      where:  { id: articleId },
      select: { id: true, status: true, visibility: true, authorId: true },
    });
    if (!row) return { status: "not-found" };
    if (str(row.status) !== "PUBLISHED" || str(row.visibility) !== "PUBLIC") return { status: "not-found" };
    return { status: "ok", article: { id: str(row.id), authorId: str(row.authorId) } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[engagement] getEngageableArticle articleId=${articleId} error=${msg}`);
    return { status: "unavailable" };
  }
}

/* ── Reactions ─────────────────────────────────────────────────────────────── */

function emptyCounts(): Record<ArticleReactionType, number> {
  return { INSIGHTFUL: 0, HELPFUL: 0, DETAILED: 0, PRACTICAL: 0 };
}

/**
 * Aggregate reaction counts for one article, plus the viewer's own reaction.
 *
 * The aggregate is a single `groupBy` — four numbers out of the database, never
 * the reaction rows themselves. That is what keeps an article with ten thousand
 * reactions as cheap to render as one with ten.
 */
export async function getReactionSummary(
  articleId: string,
  viewerUserId: string | null,
): Promise<ReactionSummary> {
  const db = await getPrisma();
  if (!db) return { counts: emptyCounts(), total: 0, viewer: null };

  const model = (db as unknown as {
    articleReaction: {
      groupBy:    (a: unknown) => Promise<Row[]>;
      findUnique: (a: unknown) => Promise<Row | null>;
    };
  }).articleReaction;

  const counts = emptyCounts();
  let total = 0;
  try {
    const grouped = await model.groupBy({
      by:    ["reactionType"],
      where: { articleId },
      _count: { _all: true },
    });
    for (const g of grouped) {
      const type = str(g.reactionType);
      const n = Number((g._count as Row | undefined)?._all ?? 0);
      if (isArticleReaction(type)) {
        counts[type] = n;
        total += n;
      }
    }
  } catch {
    /* aggregation unavailable — report zeroes rather than failing the page */
  }

  let viewer: ArticleReactionType | null = null;
  if (viewerUserId) {
    try {
      const own = await model.findUnique({
        where:  { userId_articleId: { userId: viewerUserId, articleId } },
        select: { reactionType: true },
      });
      const t = str(own?.reactionType);
      if (isArticleReaction(t)) viewer = t;
    } catch {
      /* viewer state is decoration — never fail the read for it */
    }
  }

  return { counts, total, viewer };
}

export type SetReactionResult =
  | { ok: true; viewer: ArticleReactionType | null; summary: ReactionSummary }
  | { ok: false; error: "db-unavailable" | "failed" };

/**
 * Apply a reader's reaction, with the three-way behaviour the product needs:
 *
 *   none      + INSIGHTFUL → INSIGHTFUL   (create)
 *   HELPFUL   + INSIGHTFUL → INSIGHTFUL   (replace — never two reactions)
 *   INSIGHTFUL+ INSIGHTFUL → none         (toggle off)
 *
 * "Replace" is an `upsert` on the composite unique key rather than a
 * read-then-write, so two concurrent reactions from the same reader cannot race
 * into two rows — the unique index decides, not the application.
 */
export async function setArticleReaction(
  articleId: string,
  userId: string,
  type: ArticleReactionType,
): Promise<SetReactionResult> {
  const db = await getPrisma();
  if (!db) return { ok: false, error: "db-unavailable" };

  const model = (db as unknown as {
    articleReaction: {
      findUnique: (a: unknown) => Promise<Row | null>;
      upsert:     (a: unknown) => Promise<Row>;
      delete:     (a: unknown) => Promise<Row>;
    };
  }).articleReaction;

  const key = { userId_articleId: { userId, articleId } };

  try {
    const existing = await model.findUnique({ where: key, select: { reactionType: true } });
    const current = str(existing?.reactionType);

    if (current === type) {
      // Same reaction pressed again — withdraw it.
      try {
        await model.delete({ where: key });
      } catch (err) {
        // Already gone (a double-click, or another tab). The end state the
        // reader asked for holds either way.
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("P2025")) throw err;
      }
      return { ok: true, viewer: null, summary: await getReactionSummary(articleId, userId) };
    }

    await model.upsert({
      where:  key,
      create: { userId, articleId, reactionType: type },
      update: { reactionType: type },
    });
    return { ok: true, viewer: type, summary: await getReactionSummary(articleId, userId) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[engagement] setArticleReaction articleId=${articleId} error=${msg}`);
    return { ok: false, error: "failed" };
  }
}

/**
 * Withdraw a reader's reaction outright, whatever it currently is.
 *
 * Distinct from `setArticleReaction`, which toggles: this is the explicit
 * "remove my reaction" verb the legacy DELETE endpoint expresses.
 */
export async function clearArticleReaction(
  articleId: string,
  userId: string,
): Promise<SetReactionResult> {
  const db = await getPrisma();
  if (!db) return { ok: false, error: "db-unavailable" };

  const model = (db as unknown as {
    articleReaction: { delete: (a: unknown) => Promise<Row> };
  }).articleReaction;

  try {
    await model.delete({ where: { userId_articleId: { userId, articleId } } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Nothing to withdraw is the requested end state, not a failure.
    if (!msg.includes("P2025")) {
      console.error(`[engagement] clearArticleReaction articleId=${articleId} error=${msg}`);
      return { ok: false, error: "failed" };
    }
  }
  return { ok: true, viewer: null, summary: await getReactionSummary(articleId, userId) };
}

/* ── Saves / bookmarks ─────────────────────────────────────────────────────── */

/** Whether this reader has bookmarked the article. Anonymous is always false. */
export async function isArticleSaved(
  articleId: string,
  userId: string | null,
): Promise<boolean> {
  if (!userId) return false;
  const db = await getPrisma();
  if (!db) return false;
  try {
    const row = await (db as unknown as {
      articleSave: { findUnique: (a: unknown) => Promise<Row | null> };
    }).articleSave.findUnique({
      where:  { userId_articleId: { userId, articleId } },
      select: { id: true },
    });
    return row !== null;
  } catch {
    // Bookmark state is decoration on a public page — never fail the read for it.
    return false;
  }
}

export type SetSavedResult =
  | { ok: true; saved: boolean }
  | { ok: false; error: "db-unavailable" | "failed" };

/**
 * Bookmark or un-bookmark an article for one reader.
 *
 * Both directions are IDEMPOTENT and race-safe by construction, which is why
 * neither branch reads before it writes:
 *
 *   save   — `upsert` on the `@@unique([userId, articleId])` key. Two clicks
 *            racing from two tabs cannot produce two rows; the unique index
 *            decides, and the loser becomes a no-op update rather than an error.
 *   unsave — `delete` on the same key, with P2025 ("already gone") swallowed,
 *            because a row that is not there IS the requested end state.
 *
 * A read-then-create would have a window between the read and the insert in
 * which the other tab commits, and would surface that as a 500.
 */
export async function setArticleSaved(
  articleId: string,
  userId: string,
  saved: boolean,
): Promise<SetSavedResult> {
  const db = await getPrisma();
  if (!db) return { ok: false, error: "db-unavailable" };

  const model = (db as unknown as {
    articleSave: {
      upsert: (a: unknown) => Promise<Row>;
      delete: (a: unknown) => Promise<Row>;
    };
  }).articleSave;

  const key = { userId_articleId: { userId, articleId } };

  try {
    if (saved) {
      await model.upsert({
        where:  key,
        // `userId` comes from the session in the caller, never from a body.
        create: { userId, articleId },
        update: {},
      });
      return { ok: true, saved: true };
    }
    try {
      await model.delete({ where: key });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("P2025")) throw err;
    }
    return { ok: true, saved: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[engagement] setArticleSaved articleId=${articleId} error=${msg}`);
    return { ok: false, error: "failed" };
  }
}

export interface SavedArticlesPage {
  articles: ArticleListItem[];
  nextCursor: string | null;
}

/**
 * This reader's bookmarks, newest first.
 *
 * ONE query: the article rows are joined through the save's own relation and
 * filtered to PUBLISHED + PUBLIC in the same `where`, so a bookmark whose
 * article was later unpublished or made private simply stops appearing — the
 * list can never become a back door to content the reader may no longer see.
 * Bounded, and ordered by the save's `createdAt` with `id` as the tie-breaker
 * so the cursor is deterministic.
 */
export async function listSavedArticles(
  userId: string,
  opts: { limit?: number; cursor?: string | null } = {},
): Promise<SavedArticlesPage> {
  const db = await getPrisma();
  if (!db) return { articles: [], nextCursor: null };

  const limit = Math.min(Math.max(1, opts.limit ?? SAVED_PAGE_SIZE), SAVED_MAX_PAGE_SIZE);

  try {
    const rows = await (db as unknown as {
      articleSave: { findMany: (a: unknown) => Promise<Row[]> };
    }).articleSave.findMany({
      where: {
        userId,
        article: { status: "PUBLISHED", visibility: "PUBLIC" },
      },
      include: {
        article: {
          include: { author: true, category: true, tags: { include: { tag: true } } },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const articles = page.map((r) => {
      const a = deepTs(r.article) as Record<string, unknown>;
      // Prisma returns tags in the join-table shape; the card component expects
      // a flat ArticleTag[] — the same normalisation getArticleDetailBySlug does.
      type JoinTag = { tag?: Record<string, unknown> };
      const rawTags = Array.isArray(a.tags) ? (a.tags as JoinTag[]) : [];
      return {
        ...a,
        tags: rawTags
          .filter((t): t is JoinTag & { tag: Record<string, unknown> } => !!t?.tag)
          .map((t) => ({
            id:     String(t.tag.id ?? ""),
            slug:   String(t.tag.slug ?? ""),
            name:   String(t.tag.name ?? ""),
            nameFa: t.tag.nameFa != null ? String(t.tag.nameFa) : null,
          })),
      } as unknown as ArticleListItem;
    });

    return {
      articles,
      nextCursor: hasMore ? String(page[page.length - 1]?.id ?? "") || null : null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[engagement] listSavedArticles error=${msg}`);
    return { articles: [], nextCursor: null };
  }
}

/* ── Professional identity ─────────────────────────────────────────────────── */

/**
 * Resolve the public identity of a set of commenters in TWO queries total,
 * regardless of how many comments are on the page.
 *
 * `ArticleComment` stores a bare `userId` with no relation to `User`, so the
 * identity cannot be produced by an `include`. Rather than querying per comment
 * (the N+1 this function exists to prevent), both sources are fetched with a
 * single `IN` each and joined in memory:
 *
 *   ArticleAuthorProfile — the PUBLIC professional identity (display name,
 *                          avatar, headline, verified marker, handle).
 *   User.name            — the fallback for a reader who has never authored and
 *                          therefore has no author profile.
 *
 * `User.email`, role and every organization field are deliberately not selected:
 * a comment byline must not become a directory of who holds an account.
 */
export async function resolveCommenterIdentities(
  userIds: string[],
): Promise<Map<string, CommenterIdentity>> {
  const out = new Map<string, CommenterIdentity>();
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return out;

  const db = await getPrisma();
  if (!db) return out;

  const client = db as unknown as {
    articleAuthorProfile: { findMany: (a: unknown) => Promise<Row[]> };
    user:                 { findMany: (a: unknown) => Promise<Row[]> };
  };

  let profiles: Row[] = [];
  let users: Row[] = [];
  try {
    [profiles, users] = await Promise.all([
      client.articleAuthorProfile.findMany({
        where:  { userId: { in: unique } },
        select: { userId: true, displayName: true, avatarUrl: true, headline: true, verifiedExpert: true, handle: true },
      }),
      client.user.findMany({
        where:  { id: { in: unique } },
        select: { id: true, name: true },
      }),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[engagement] identity lookup error=${msg}`);
    return out;
  }

  const nameByUser = new Map(users.map((u) => [str(u.id), str(u.name)]));

  for (const p of profiles) {
    const userId = str(p.userId);
    out.set(userId, {
      userId,
      displayName:    str(p.displayName) || nameByUser.get(userId) || "",
      avatarUrl:      typeof p.avatarUrl === "string" ? p.avatarUrl : null,
      headline:       typeof p.headline === "string" ? p.headline : null,
      verifiedExpert: p.verifiedExpert === true,
      handle:         typeof p.handle === "string" ? p.handle : null,
    });
  }

  for (const [userId, name] of nameByUser) {
    if (out.has(userId)) continue;
    out.set(userId, {
      userId,
      displayName:    name,
      avatarUrl:      null,
      headline:       null,
      verifiedExpert: false,
      handle:         null,
    });
  }

  return out;
}

/* ── Comments ──────────────────────────────────────────────────────────────── */

function toNode(row: Row, identity: Map<string, CommenterIdentity>): CommentNode {
  const userId = str(row.userId);
  return {
    id:        str(row.id),
    body:      str(row.content),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    parentId:  typeof row.parentId === "string" ? row.parentId : null,
    author: identity.get(userId) ?? {
      userId,
      displayName:    "",
      avatarUrl:      null,
      headline:       null,
      verifiedExpert: false,
      handle:         null,
    },
    replies: [],
  };
}

/**
 * One bounded page of a discussion: top-level comments oldest-first, each with
 * its (also active) replies attached.
 *
 * Three queries, never more: the page of parents, the replies belonging to
 * exactly those parents, and one identity resolution across both sets. The
 * reply query is keyed by `parentId IN (this page's ids)`, so a long thread
 * costs the same as a short one.
 */
export async function listArticleComments(
  articleId: string,
  opts: { limit?: number; cursor?: string | null } = {},
): Promise<CommentPage> {
  const db = await getPrisma();
  if (!db) return { comments: [], total: 0, nextCursor: null };

  const limit = Math.min(Math.max(1, opts.limit ?? COMMENT_PAGE_SIZE), COMMENT_MAX_PAGE_SIZE);

  const model = (db as unknown as {
    articleComment: {
      findMany: (a: unknown) => Promise<Row[]>;
      count:    (a: unknown) => Promise<number>;
    };
  }).articleComment;

  try {
    const parents = await model.findMany({
      where:   { articleId, parentId: null, isActive: true },
      // `id` is the tie-breaker, and it is required rather than cosmetic: the
      // cursor below is an id, so ordering by createdAt ALONE would be a
      // non-total order — two comments written in the same millisecond could
      // sort either way between pages, silently skipping or repeating a row.
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      // One extra row is fetched purely to decide whether a next page exists;
      // it is dropped before the page is returned.
      take:    limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      select:  { id: true, userId: true, content: true, parentId: true, createdAt: true, updatedAt: true },
    });

    const hasMore = parents.length > limit;
    const page = hasMore ? parents.slice(0, limit) : parents;
    const parentIds = page.map((p) => str(p.id));

    const replies = parentIds.length
      ? await model.findMany({
          where:   { articleId, parentId: { in: parentIds }, isActive: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select:  { id: true, userId: true, content: true, parentId: true, createdAt: true, updatedAt: true },
        })
      : [];

    const total = await model.count({ where: { articleId, isActive: true } });

    const identity = await resolveCommenterIdentities([
      ...page.map((r) => str(r.userId)),
      ...replies.map((r) => str(r.userId)),
    ]);

    const nodes = page.map((p) => toNode(p, identity));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const r of replies) {
      const node = toNode(r, identity);
      byId.get(node.parentId ?? "")?.replies.push(node);
    }

    return {
      comments:   nodes,
      total,
      nextCursor: hasMore ? nodes[nodes.length - 1]?.id ?? null : null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[engagement] listArticleComments articleId=${articleId} error=${msg}`);
    return { comments: [], total: 0, nextCursor: null };
  }
}

export type CreateCommentResult =
  | { ok: true; comment: CommentNode }
  | { ok: false; error: "db-unavailable" | "parent-not-found" | "parent-not-top-level" | "failed" };

/**
 * Post a comment, or a reply to an existing top-level comment.
 *
 * The parent is re-read from the database and checked twice before it is
 * accepted, which is what keeps the thread exactly one level deep and stops a
 * caller from attaching a reply to a comment on somebody else's article:
 *
 *   1. the parent must belong to THIS article  (cross-article parent → refused)
 *   2. the parent must itself be top-level     (reply-to-reply → refused)
 */
export async function createArticleComment(input: {
  articleId: string;
  userId: string;
  body: string;
  parentId?: string | null;
}): Promise<CreateCommentResult> {
  const db = await getPrisma();
  if (!db) return { ok: false, error: "db-unavailable" };

  const model = (db as unknown as {
    articleComment: {
      findUnique: (a: unknown) => Promise<Row | null>;
      create:     (a: unknown) => Promise<Row>;
    };
  }).articleComment;

  try {
    let parentId: string | null = null;
    if (input.parentId) {
      const parent = await model.findUnique({
        where:  { id: input.parentId },
        select: { id: true, articleId: true, parentId: true, isActive: true },
      });
      if (!parent || parent.isActive === false) return { ok: false, error: "parent-not-found" };
      if (str(parent.articleId) !== input.articleId) return { ok: false, error: "parent-not-found" };
      if (parent.parentId != null) return { ok: false, error: "parent-not-top-level" };
      parentId = str(parent.id);
    }

    const created = await model.create({
      data: {
        articleId: input.articleId,
        // Taken from the authenticated session by the caller — never from a body.
        userId:    input.userId,
        content:   input.body,
        parentId,
      },
      select: { id: true, userId: true, content: true, parentId: true, createdAt: true, updatedAt: true },
    });

    const identity = await resolveCommenterIdentities([input.userId]);
    return { ok: true, comment: toNode(created, identity) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[engagement] createArticleComment articleId=${input.articleId} error=${msg}`);
    return { ok: false, error: "failed" };
  }
}

export type RemoveCommentResult =
  | { ok: true; commentId: string; wasReply: boolean }
  | { ok: false; error: "db-unavailable" | "not-found" | "forbidden" | "failed" };

/**
 * Withdraw a comment.
 *
 * `isActive: false` rather than a row delete: the schema models removal as a
 * flag, replies hang off the parent row, and hard-deleting a parent would take
 * unrelated authors' replies with it. Inactive comments are excluded by every
 * read path above.
 *
 * Authorisation is decided HERE, from the persisted row, never from the client:
 * the actor must own the comment, or hold the moderation capability.
 */
export async function removeArticleComment(input: {
  articleId: string;
  commentId: string;
  actorUserId: string;
  actorIsModerator: boolean;
}): Promise<RemoveCommentResult> {
  const db = await getPrisma();
  if (!db) return { ok: false, error: "db-unavailable" };

  const model = (db as unknown as {
    articleComment: {
      findUnique: (a: unknown) => Promise<Row | null>;
      update:     (a: unknown) => Promise<Row>;
    };
  }).articleComment;

  try {
    const row = await model.findUnique({
      where:  { id: input.commentId },
      select: { id: true, userId: true, articleId: true, parentId: true, isActive: true },
    });

    // A comment that belongs to a different article is reported as missing, not
    // as forbidden — the article id in the path is part of the object's
    // identity here, so a mismatch must not confirm that the id exists.
    if (!row || str(row.articleId) !== input.articleId) return { ok: false, error: "not-found" };
    if (row.isActive === false) return { ok: true, commentId: input.commentId, wasReply: row.parentId != null };

    const isOwner = str(row.userId) === input.actorUserId;
    if (!isOwner && !input.actorIsModerator) return { ok: false, error: "forbidden" };

    await model.update({ where: { id: input.commentId }, data: { isActive: false } });
    return { ok: true, commentId: input.commentId, wasReply: row.parentId != null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[engagement] removeArticleComment commentId=${input.commentId} error=${msg}`);
    return { ok: false, error: "failed" };
  }
}
