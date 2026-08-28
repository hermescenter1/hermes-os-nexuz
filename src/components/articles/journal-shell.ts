/**
 * PHASE 104-F — which shell a `/articles/*` route renders.
 *
 * `articles/layout.tsx` owns EVERY route under the prefix — the public reading
 * surfaces AND the authenticated author workspace AND the admin editorial
 * tools. The Industrial Journal redesign applies to the public reading system
 * only, so the layout cannot switch on prefix; it has to switch on the exact
 * route, and the switch has to be a pure function so a contract can attack it.
 *
 * The public/private boundary below is NOT invented here. It mirrors the two
 * middleware patterns in `src/lib/auth/rbac.ts`:
 *   ARTICLES_EDITORIAL     = moderation|review-queue|reports|editorial-board|editor|submissions
 *   ARTICLES_AUTHENTICATED = write|drafts|saved|following|my-articles|settings
 * Everything else under `/articles` is publicly reachable. Keeping the lists
 * duplicated rather than imported is deliberate: this file is imported by a
 * client boundary and must not pull the server-side auth module into the
 * client bundle. The contract test asserts the two lists stay identical.
 *
 * FAIL-CLOSED: an unknown or private segment gets the LEGACY shell, never the
 * journal one. A new private editorial route added tomorrow cannot pick up
 * the public editorial treatment by accident.
 */

export type JournalShellMode = "journal" | "legacy";

/** Locale-agnostic first path segment after `/articles`. */
const PRIVATE_SEGMENTS: ReadonlySet<string> = new Set([
  // ARTICLES_EDITORIAL (admin)
  "moderation", "review-queue", "reports", "editorial-board", "editor", "submissions",
  // ARTICLES_AUTHENTICATED (any signed-in user)
  "write", "drafts", "saved", "following", "my-articles", "settings",
]);

/**
 * The public reading and discovery segments that receive the journal shell.
 * `null` stands for the bare landing (`/articles`) and `"[slug]"` for the
 * article detail — any single segment that is neither reserved-public nor
 * private is treated as an article slug, because that is what the router does.
 */
const PUBLIC_SEGMENTS: ReadonlySet<string> = new Set([
  "discover", "latest", "tags", "tag", "categories", "category", "authors",
  "author", "trending", "editors-picks", "case-studies", "feed",
]);

/**
 * Strip a leading `/xx/` locale and return the segments after `articles`.
 * Returns `null` when the path is not under `/articles` at all.
 */
export function articleSegments(pathname: string): string[] | null {
  const parts = pathname.split("?")[0].split("#")[0].split("/").filter(Boolean);
  // optional 2-letter locale prefix
  const start = parts.length && /^[a-z]{2}$/i.test(parts[0]) ? 1 : 0;
  if (parts[start] !== "articles") return null;
  return parts.slice(start + 1);
}

export function journalShellMode(pathname: string): JournalShellMode {
  const segs = articleSegments(pathname);
  if (segs === null) return "legacy";
  if (segs.length === 0) return "journal";           // /articles
  const head = segs[0].toLowerCase();
  if (PRIVATE_SEGMENTS.has(head)) return "legacy";  // fail-closed
  if (PUBLIC_SEGMENTS.has(head)) return "journal";
  // /articles/<slug> — exactly one unreserved segment is an article detail.
  if (segs.length === 1) return "journal";
  // Deeper unknown structure: fail closed.
  return "legacy";
}

/** Exposed for the contract test only. */
export const __JOURNAL_SHELL_INTERNALS = Object.freeze({
  PRIVATE_SEGMENTS: [...PRIVATE_SEGMENTS],
  PUBLIC_SEGMENTS: [...PUBLIC_SEGMENTS],
});
