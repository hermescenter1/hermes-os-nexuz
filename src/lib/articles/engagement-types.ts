/**
 * Journal engagement — shared contract.
 *
 * Deliberately dependency-free so it can be imported from BOTH the server data
 * layer and client components. `engagement.ts` reaches for `getPrisma`, so a
 * "use client" component importing a runtime value from it would drag the
 * database client into the browser bundle; everything a client needs lives
 * here instead, and `engagement.ts` re-exports it for server callers.
 */

/**
 * The reaction vocabulary — the persisted `ArtReactionType` enum, unchanged.
 * An engineering journal rates work as insightful or practical rather than
 * "liked", and this closed list is the only accepted input.
 */
export const ARTICLE_REACTIONS = ["INSIGHTFUL", "HELPFUL", "DETAILED", "PRACTICAL"] as const;
export type ArticleReactionType = (typeof ARTICLE_REACTIONS)[number];

export function isArticleReaction(v: unknown): v is ArticleReactionType {
  return typeof v === "string" && (ARTICLE_REACTIONS as readonly string[]).includes(v);
}

/** Hard ceiling on a single comment, enforced server-side and shown in the UI. */
export const COMMENT_MAX_LENGTH = 2000;
/** Default and maximum comment page size. Comments are never loaded unbounded. */
export const COMMENT_PAGE_SIZE = 20;
export const COMMENT_MAX_PAGE_SIZE = 50;

/** Default and maximum page size for a reader's saved-article list. */
export const SAVED_PAGE_SIZE = 20;
export const SAVED_MAX_PAGE_SIZE = 50;

export interface ReactionSummary {
  /** Count per reaction type. Every key is present, zero included. */
  counts: Record<ArticleReactionType, number>;
  total: number;
  /** The signed-in reader's own reaction, or null. */
  viewer: ArticleReactionType | null;
}

/** Public, non-sensitive identity shown beside a comment. */
export interface CommenterIdentity {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  /** Public professional headline, when the commenter has an author profile. */
  headline: string | null;
  verifiedExpert: boolean;
  /** Public author page handle, when one exists. */
  handle: string | null;
}

export interface CommentNode {
  id: string;
  /** Always "" for a removed node — the original text is never sent. */
  body: string;
  createdAt: string;
  updatedAt: string;
  parentId: string | null;
  author: CommenterIdentity;
  replies: CommentNode[];
  /**
   * TOMBSTONE marker.
   *
   * True only for a top-level comment that was withdrawn or moderated while it
   * still had active replies. The node is kept in the tree so those replies —
   * which belong to OTHER people and were never removed — stay reachable, but
   * it carries no body and no author identity, and the client renders a
   * localized placeholder in its place. It is not counted as a comment.
   *
   * A removed comment with no active replies is not returned at all, and a
   * removed reply is simply absent.
   */
  removed: boolean;
}

/** The identity attached to a tombstone: no user, nothing to attribute. */
export const REMOVED_COMMENT_IDENTITY: CommenterIdentity = {
  userId: "",
  displayName: "",
  avatarUrl: null,
  headline: null,
  verifiedExpert: false,
  handle: null,
};

export interface CommentPage {
  comments: CommentNode[];
  /**
   * Total RENDERABLE comments on the article — every active comment, replies
   * included. Tombstones are placeholders, not comments, and are excluded.
   *
   * This is the same number the UI shows and the same number a reload produces,
   * which only holds because every active reply is reachable: its parent is
   * either active or present as a tombstone.
   */
  total: number;
  /** Cursor for the next page, or null when the list is exhausted. */
  nextCursor: string | null;
}
