/**
 * PHASE 107 FINAL — the machine refusal vocabulary, in ONE place.
 *
 * Independent copies of this list existed in the browser client, in the AST
 * refusal detector and in the live probe classifier, and they had already
 * drifted: `INTERNAL_FAILURE` — which `src/lib/ot-edge/http/route-kit.ts`
 * genuinely emits — was known to the detector and unknown to the client. A
 * refusal the client cannot name is a refusal the reader is shown as a generic
 * "something went wrong", so the drift was not cosmetic.
 *
 * Product code imports this. The proof machinery PARSES this file rather than
 * keeping its own copy, so a code added here reaches every consumer at once and
 * a drift test can prove there is no second list.
 *
 * WHAT BELONGS HERE: identifiers a machine emits and a machine branches on.
 * Human sentences never belong, and never match: every entry is
 * SCREAMING_SNAKE_CASE with no spaces, which is exactly what separates
 * `AUTHENTICATION_REQUIRED` from the message "Authentication required".
 */
export const MACHINE_REFUSAL_CODES = [
  // Pre-authentication. All of these must stay indistinguishable to a prober.
  "UNAUTHENTICATED",
  "UNAUTHORIZED",
  "AUTHENTICATION_REQUIRED",
  "SESSION_AUTH_REQUIRED",

  // Authenticated, but not permitted.
  "FORBIDDEN",
  "CAPABILITY_NOT_ALLOWED",
  "INSUFFICIENT_PERMISSION",

  // Authenticated, but missing a scope selection. Signing in again cannot help.
  "ORGANIZATION_CONTEXT_REQUIRED",
  "ORGANIZATION_SCOPE_REQUIRED",
  "SITE_CONTEXT_REQUIRED",

  // The platform's fault, not the caller's.
  "INTERNAL_ERROR",
  "INTERNAL_FAILURE",
  "TRANSIENT_FAILURE",
  "COPILOT_UNAVAILABLE",

  // The request itself.
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "INVALID_QUERY_PARAMETER",
  "RATE_LIMITED",
] as const;

export type MachineRefusalCode = (typeof MACHINE_REFUSAL_CODES)[number];

/** Membership, for code that must decide whether a string is a machine code. */
export const MACHINE_REFUSAL_CODE_SET: ReadonlySet<string> = new Set(MACHINE_REFUSAL_CODES);

/**
 * True only for an exact member, compared after upper-casing.
 *
 * Deliberately NOT a substring or regex test. A prose message that happens to
 * contain a code's words — "Authentication required to continue" — must not be
 * promoted to a machine code, because the UI branches on the result and would
 * route the reader on the strength of a sentence someone may reword tomorrow.
 * Upper-casing is the only normalisation, so `authentication_required` (which
 * the Media upload family emits) is accepted while any string containing a
 * space is not.
 */
export function isMachineRefusalCode(value: unknown): value is MachineRefusalCode {
  return typeof value === "string" && MACHINE_REFUSAL_CODE_SET.has(value.toUpperCase());
}
