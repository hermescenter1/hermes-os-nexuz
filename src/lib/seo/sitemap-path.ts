/**
 * Percent-encode every non-ASCII run in a URL path (UTF-8, upper-case hex) —
 * the exact form a WHATWG URL serialises, and therefore the form the page's own
 * `<link rel="canonical">` carries.
 *
 * sitemaps.org requires `<loc>` to be an escaped URL. A raw Persian slug there
 * made the sitemap URL and the canonical URL two different strings for the same
 * document. ASCII is left untouched, so an already-escaped `%xx` sequence is
 * never double-encoded and every ASCII-only path is emitted byte-for-byte as
 * before.
 */
export function sitemapPath(path: string): string {
  return path.replace(/[^\u0000-\u007F]+/g, (run) => encodeURIComponent(run));
}
