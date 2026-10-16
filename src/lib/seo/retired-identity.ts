/**
 * Retired public identity containment.
 *
 * ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
 * The company that operates HERMES OS is ZHARFA Vira Pouyesh Fanavari
 * (`ORG_NAME` in `./config`). A former legal name is no longer published on any
 * public surface — see the reasoning in `./config` for why it is deliberately
 * not kept as an `alternateName` either.
 *
 * One public surface can still reach that retired name WITHOUT any repository
 * string saying it: `ArticleAuthorProfile.handle` is a unique DATABASE column,
 * and `/{locale}/articles/author/{handle}` renders whatever handle a row
 * carries. A row created under the old company name therefore produces an
 * indexable URL, a `<title>`, a `Person` JSON-LD `url`, a sitemap entry and an
 * IndexNow submission — all generated from data, none of it from source.
 *
 * This module is the one place that recognises such a handle, so every public
 * emitter can refuse it consistently. It is a CONTAINMENT boundary, not a
 * rename: it keeps the retired identity out of everything Google is asked to
 * index, and it does not touch, migrate or rewrite a single row.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
 * It does not redirect. A redirect needs a destination that returns 200, and
 * the only author route resolves its handle from the database, so a correct
 * destination cannot be named from source alone. Consolidating the retired
 * profile into one ZHARFA author entity is a DATA decision and is tracked
 * separately; see `docs/release/seo-author-archive-governance.md`.
 *
 * ── WHY A PATTERN AND NOT A FIXED SLUG ──────────────────────────────────────
 * Handles are data, so the exact slug is not knowable from source: the live one
 * observed during the 2026-09-28 public audit carried a cuid suffix
 * (`…-mqyyen9v0x56`), and nothing stops a second row from differing in
 * separators, casing or suffix. The test for "is this the retired identity"
 * must therefore be a normalised substring test, not equality with one string.
 *
 * MATCHING: the three words of the retired name, in order, separated by any run
 * of non-alphanumeric characters (or nothing at all). `Hermes-Novin-Mehr-IRIC`,
 * `hermes_novin_mehr`, `HermesNovinMehrIric`, `Hermes Novin Mehr IRIC` and
 * `hermes-novin-mehr-iric-mqyyen9v0x56` all match.
 *
 * WHY NOT STRIP EVERY SEPARATOR FROM THE WHOLE INPUT FIRST: that was the first
 * implementation, and it is unsafe on anything larger than a handle. Collapsing
 * a whole file to `[a-z0-9]` lets the needle straddle two unrelated tokens — the
 * canonical host `hermesnovin.com` immediately followed by the German word
 * `mehr` collapses to `…hermesnovincommehr…`, and a slightly different
 * neighbouring value would collapse to exactly `hermesnovinmehr` and report a
 * retired identity that is not there. Requiring a SEPARATOR (never another
 * letter or digit) between the three words removes that whole class of false
 * positive: `hermesnovin` + `.com` + `mehr` cannot match, because `com` sits
 * between `novin` and `mehr`.
 */

/**
 * The retired company name: three words, any separator run between them.
 *
 * `hermes` + `novin` alone is deliberately NOT the pattern: that is a prefix of
 * the canonical production host `hermesnovin.com`, and a legitimate future
 * handle could contain it. All three words are required.
 */
export const RETIRED_IDENTITY_PATTERN = /hermes[^a-z0-9]*novin[^a-z0-9]*mehr/i;

/** Lowercase and strip every non-alphanumeric character. Handles only. */
export function normalizeIdentityToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * True when a value publishes the retired company identity.
 *
 * Accepts any input so a caller can pass an unvalidated route parameter. A
 * non-string or empty value is not the retired identity — callers must keep
 * their own existing "does this row exist" check, which already produces a 404.
 */
export function isRetiredIdentityHandle(handle: unknown): boolean {
  if (typeof handle !== "string" || handle.length === 0) return false;
  return RETIRED_IDENTITY_PATTERN.test(handle);
}

/**
 * True when any public URL or identifier carries the retired identity.
 *
 * Used by the sitemap and IndexNow guards, which hold whole paths rather than a
 * bare handle. The same normalisation applies, so `/fa/articles/author/
 * Hermes-Novin-Mehr-IRIC-x` is caught exactly like the bare handle.
 */
export function containsRetiredIdentity(value: unknown): boolean {
  return isRetiredIdentityHandle(value);
}
