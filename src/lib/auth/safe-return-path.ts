/**
 * Post-authentication return-path validation.
 *
 * The login surface accepts a `from` query parameter so a visitor who was sent
 * to sign in lands back where they were going — the Journal's "Write article"
 * entry point being the case this was added for. That parameter is attacker
 * controllable, so the value is only ever followed after it has been proven to
 * be a same-origin, internal, absolute path.
 *
 * Anything else — an absolute URL, a protocol-relative `//host`, a scheme, a
 * backslash form the browser would normalise into one, or a control character
 * smuggled through percent-encoding — yields null, and the caller falls back to
 * its own default destination.
 */

/** Locale segments that may prefix an internal path. Mirrors i18n/locales. */
const LOCALE_SEGMENTS = new Set(["fa", "en", "de"]);

/**
 * True when the string contains a C0 control character, DEL, or a raw
 * whitespace character that has no business in a URL path.
 *
 * Checked by character code rather than a regular expression containing escape
 * sequences, so the check cannot be altered by how this source file is encoded
 * or rewritten by tooling.
 */
function hasControlOrSpace(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Validate a caller-supplied return path.
 *
 * @returns the safe internal path, or null when the value must not be followed.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;

  // Decode once. A malformed sequence is rejected rather than passed through:
  // if it cannot be decoded it cannot be reasoned about.
  let path: string;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return null;
  }

  if (path.length === 0 || path.length > 512) return null;
  if (hasControlOrSpace(path)) return null;

  // Backslashes are rejected outright: several browsers normalise "/\evil.com"
  // and "\\evil.com" into a protocol-relative URL, so treating "\" as an
  // ordinary path character would reopen exactly what this function closes.
  if (path.includes("\\")) return null;

  // Must be an absolute path on this origin, and must not be protocol-relative.
  if (!path.startsWith("/")) return null;
  if (path.startsWith("//")) return null;

  // No scheme, no authority, and no fragment/again-encoded trickery.
  if (path.includes(":")) return null;

  // Reject traversal segments — nothing legitimate needs them, and they only
  // serve to disguise the real destination.
  if (path.split("/").includes("..")) return null;

  return path;
}

/**
 * Like `safeReturnPath`, but additionally requires the path to sit under a
 * known locale segment. Used where the destination must be a localized app
 * route, so a valid-but-unlocalized path cannot bypass locale routing.
 */
export function safeLocaleReturnPath(raw: string | null | undefined): string | null {
  const path = safeReturnPath(raw);
  if (!path) return null;
  const first = path.split("/")[1] ?? "";
  return LOCALE_SEGMENTS.has(first) ? path : null;
}
