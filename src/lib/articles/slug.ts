// Phase 83 — Article slug normalization for route -> DB lookup.
//
// The public route /[locale]/articles/[slug] resolves an article by an EXACT
// slug match (Prisma `where: { slug }`). Next.js may hand `params.slug` either
// already-decoded (e.g. Persian "سلام-…") or still percent-encoded
// ("%D8%B3%D9%84%D8%A7%D9%85-…"), depending on the request/runtime boundary
// (standalone output, proxy forwarding, RSC vs. edge). It may also arrive in a
// different Unicode normalization form (NFD) than the persisted value (NFC).
//
// Any of those makes a Persian slug byte-different from the stored slug, so the
// exact-match lookup misses and the page 404s — even though the article is
// PUBLISHED + PUBLIC. ASCII slugs are unaffected (encoding + NFC are identity),
// which is exactly the observed matrix.
//
// This is the single place slug decoding happens — do NOT scatter
// decodeURIComponent()/normalize() across route components.

// A slug is a single URL path segment: after decoding it must never contain a
// path separator or control character. "%2F" decodes to "/" (0x2F) and "%5C" to
// "\" (0x5C); C0 controls (<= 0x1F) and DEL (0x7F) are likewise never valid.
function hasUnsafeSlugChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true; // C0 controls + DEL (incl. NUL)
    if (code === 0x2f || code === 0x5c) return true; // "/" and "\"
  }
  return false;
}

/**
 * Canonicalize a raw route slug for an exact-match DB lookup.
 *
 * Steps (in order):
 *   1. trim surrounding whitespace
 *   2. decode percent-encoding AT MOST ONCE (malformed -> treated as a miss)
 *   3. Unicode NFC normalize
 *   4. reject empty results
 *   5. reject path separators / control characters ("/", "\", NUL, C0, DEL)
 *
 * ASCII slugs pass through byte-identical. Returns `null` for any value that
 * must never reach the database — the caller maps `null` to `notFound()`.
 */
export function normalizeArticleSlug(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  let value = raw.trim();
  if (!value) return null;

  // Decode percent-encoding exactly once. A real slug only contains "%" when it
  // arrived percent-encoded; decoding twice could corrupt a legitimately
  // literal sequence, so we never loop. Malformed encoding (a stray "%") makes
  // decodeURIComponent throw — that is never a valid slug, so fail closed.
  if (value.includes("%")) {
    try {
      value = decodeURIComponent(value);
    } catch {
      return null;
    }
  }

  // The persisted slug is stored NFC. A decoded route parameter can arrive NFD
  // (common with Persian/Arabic text), which is byte-different and misses the
  // exact-match lookup. Canonicalize to NFC so both sides compare equal.
  value = value.normalize("NFC").trim();
  if (!value) return null;

  if (hasUnsafeSlugChar(value)) return null;

  return value;
}
